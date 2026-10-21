import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notify,
  notifyRole,
  withCodeRetry,
  parseFloatSafe,
  parseDateSafe,
  sanitize,
} from "@/lib/helpers";

const WORKFLOW_STAGES = [
  "Lead Received",
  "Client Contacted",
  "Quotation Sent",
  "Order Confirmed",
  "Development in Progress",
  "Internal Review",
  "Client Review",
  "Revisions",
  "Ready for Delivery",
  "Delivered",
  "Payment Completed",
  "Closed",
] as const;

const SERVICE_TYPES = [
  "Business Website Development",
  "Restaurant Website Development",
  "Website Redesign",
  "Website Maintenance",
  "Google Business Profile Setup",
  "Promotional Video Editing",
  "Landing Page",
  "Website Hosting & Deployment",
  "Other Custom Digital Service",
] as const;

export const GET = handler(async (req: Request) => {
  const user = await requirePermission("orders:read");
  const url = new URL(req.url);
  const q = sanitize(url.searchParams.get("q"));
  const status = sanitize(url.searchParams.get("status"));
  const priority = sanitize(url.searchParams.get("priority"));
  const developerId = sanitize(url.searchParams.get("developerId"));

  const where = {
    AND: [
      // Developers only see orders assigned to them
      ...(user.role === "DEVELOPER"
        ? [{ OR: [{ developerId: user.id }, { coordinatorId: user.id }] }]
        : []),
      status ? { status } : {},
      priority ? { priority } : {},
      developerId ? { developerId } : {},
      q
        ? {
            OR: [
              { orderCode: { contains: q } },
              { serviceType: { contains: q } },
              { description: { contains: q } },
              { client: { businessName: { contains: q } } },
              { client: { contactPerson: { contains: q } } },
            ],
          }
        : {},
    ],
  };

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          businessName: true,
          contactPerson: true,
          phone: true,
          whatsapp: true,
          email: true,
          location: true,
          websiteUrl: true,
        },
      },
      developer: { select: { id: true, name: true, avatarUrl: true } },
      coordinator: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { tasks: true, files: true } },
    },
  });

  // Attach financial aggregates (payments are hidden from developers)
  if (user.role === "DEVELOPER") {
    return Response.json({
      orders,
      stages: WORKFLOW_STAGES,
      serviceTypes: SERVICE_TYPES,
    });
  }
  const ordersWithFinance = await Promise.all(
    orders.map(async (o) => {
      const agg = await db.payment.aggregate({
        where: { orderId: o.id, direction: "in" },
        _sum: { amount: true },
      });
      const refunds = await db.payment.aggregate({
        where: { orderId: o.id, direction: "out" },
        _sum: { amount: true },
      });
      const received = (agg._sum.amount ?? 0) - (refunds._sum.amount ?? 0);
      return {
        ...o,
        paymentsReceived: received,
        remainingBalance: o.agreedPrice - received,
      };
    }),
  );
  return Response.json({
    orders: ordersWithFinance,
    stages: WORKFLOW_STAGES,
    serviceTypes: SERVICE_TYPES,
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("orders:write");
  const b = await req.json().catch(() => ({}));

  const clientId = sanitize(b.clientId);
  const serviceType = sanitize(b.serviceType);
  if (!clientId)
    throw new ApiError(400, "A client must be selected for this order");
  if (!serviceType) throw new ApiError(400, "Service type is required");

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ApiError(404, "Client not found");

  const order = await withCodeRetry("order", "orderCode", (orderCode) =>
    db.order.create({
      data: {
        orderCode,
        clientId,
        serviceType,
        description: sanitize(b.description),
        createdById: user.id,
        developerId: sanitize(b.developerId),
        coordinatorId: sanitize(b.coordinatorId),
        agreedPrice: parseFloatSafe(b.agreedPrice) ?? 0,
        startDate: parseDateSafe(b.startDate),
        internalDeadline: parseDateSafe(b.internalDeadline),
        deliveryDate: parseDateSafe(b.deliveryDate),
        priority: sanitize(b.priority) ?? "Medium",
        status: sanitize(b.status) ?? "Lead Received",
        previewUrl: sanitize(b.previewUrl),
        liveUrl: sanitize(b.liveUrl),
        repoUrl: sanitize(b.repoUrl),
        estimatedCompletion: parseDateSafe(b.estimatedCompletion),
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "order",
    entityId: order.id,
    summary: `Order created: ${order.orderCode} for ${client.businessName} — ${serviceType}`,
    details: { agreedPrice: order.agreedPrice, priority: order.priority },
  });
  if (order.developerId) {
    await notify({
      userId: order.developerId,
      title: "New project assigned to you",
      body: `${order.orderCode} — ${serviceType} for ${client.businessName}.`,
      type: "order",
      link: "orders",
    });
  }
  if (order.coordinatorId && order.coordinatorId !== user.id) {
    await notify({
      userId: order.coordinatorId,
      title: "You are coordinating a new order",
      body: `${order.orderCode} — ${serviceType} for ${client.businessName}.`,
      type: "order",
      link: "orders",
    });
  }
  await notifyRole("ADMIN", {
    title: "New order created",
    body: `${order.orderCode} — ${serviceType} for ${client.businessName} (by ${user.name}).`,
    type: "order",
    link: "orders",
  });
  return Response.json({ order }, { status: 201 });
});
