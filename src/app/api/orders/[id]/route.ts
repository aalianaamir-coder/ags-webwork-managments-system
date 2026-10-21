import { db } from "@/lib/db";
import {
  handler,
  ApiError,
  requireUser,
  requirePermission,
  can,
} from "@/lib/permissions";
import {
  logActivity,
  notify,
  notifyRole,
  parseFloatSafe,
  parseDateSafe,
  sanitize,
} from "@/lib/helpers";

type Params = { params: Promise<{ id: string }> };

// Statuses a developer may set (development-side of the workflow)
const DEV_STATUSES = [
  "Development in Progress",
  "Internal Review",
  "Client Review",
  "Revisions",
  "Ready for Delivery",
  "Delivered",
];
const DEV_FIELDS = [
  "status",
  "previewUrl",
  "liveUrl",
  "repoUrl",
  "estimatedCompletion",
  "description",
];

export const GET = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      client: true,
      developer: { select: { id: true, name: true, avatarUrl: true } },
      coordinator: { select: { id: true, name: true, avatarUrl: true } },
      tasks: { include: { assignee: { select: { id: true, name: true } } } },
      files: { orderBy: { createdAt: "desc" } },
      comments: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      revisions: { orderBy: { createdAt: "desc" } },
      payments:
        user.role === "DEVELOPER"
          ? undefined
          : { orderBy: { receivedAt: "desc" } },
      invoices:
        user.role === "DEVELOPER"
          ? undefined
          : { orderBy: { createdAt: "desc" } },
      subscriptions: { include: { plan: true } },
    },
  });
  if (!order) throw new ApiError(404, "Order not found");
  if (
    user.role === "DEVELOPER" &&
    order.developerId !== user.id &&
    order.coordinatorId !== user.id
  ) {
    throw new ApiError(403, "This order is not assigned to you");
  }
  return Response.json({ order });
});

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const existing = await db.order.findUnique({
    where: { id },
    include: { client: { select: { businessName: true } } },
  });
  if (!existing) throw new ApiError(404, "Order not found");

  const isFullEdit = can(user, "orders:write");
  const isDevOnOrder =
    user.role === "DEVELOPER" &&
    (existing.developerId === user.id || existing.coordinatorId === user.id);
  if (!isFullEdit && !isDevOnOrder)
    throw new ApiError(403, "You can only update projects assigned to you");

  // Developers may only change development-side fields
  const data: Record<string, unknown> = {};
  if (isFullEdit) {
    if ("clientId" in b && sanitize(b.clientId))
      data.clientId = sanitize(b.clientId);
    if ("serviceType" in b)
      data.serviceType = sanitize(b.serviceType) ?? existing.serviceType;
    if ("description" in b) data.description = sanitize(b.description);
    if ("developerId" in b) data.developerId = sanitize(b.developerId);
    if ("coordinatorId" in b) data.coordinatorId = sanitize(b.coordinatorId);
    if ("agreedPrice" in b)
      data.agreedPrice = parseFloatSafe(b.agreedPrice) ?? existing.agreedPrice;
    if ("startDate" in b) data.startDate = parseDateSafe(b.startDate);
    if ("internalDeadline" in b)
      data.internalDeadline = parseDateSafe(b.internalDeadline);
    if ("deliveryDate" in b) data.deliveryDate = parseDateSafe(b.deliveryDate);
    if ("priority" in b)
      data.priority = sanitize(b.priority) ?? existing.priority;
    if ("status" in b) data.status = sanitize(b.status) ?? existing.status;
    if ("previewUrl" in b) data.previewUrl = sanitize(b.previewUrl);
    if ("liveUrl" in b) data.liveUrl = sanitize(b.liveUrl);
    if ("repoUrl" in b) data.repoUrl = sanitize(b.repoUrl);
    if ("estimatedCompletion" in b)
      data.estimatedCompletion = parseDateSafe(b.estimatedCompletion);
  } else {
    for (const f of DEV_FIELDS) {
      if (f in b) {
        if (f === "status") {
          const newStatus = sanitize(b.status);
          if (newStatus && !DEV_STATUSES.includes(newStatus)) {
            throw new ApiError(
              403,
              `You cannot set the status to “${newStatus}”. Contact the CEO or coordinator.`,
            );
          }
          data.status = newStatus ?? existing.status;
        } else if (f === "description") {
          // developer appends dev notes instead of replacing business description
          if (sanitize(b.description))
            data.description = sanitize(b.description);
        } else if (f === "estimatedCompletion") {
          data.estimatedCompletion = parseDateSafe(b.estimatedCompletion);
        } else {
          data[f] = sanitize(b[f]);
        }
      }
    }
  }

  const statusChanged =
    typeof data.status === "string" && data.status !== existing.status;
  if (statusChanged && data.status === "Delivered") {
    data.deliveredAt = new Date();
    data.deliveredById = user.id;
  }
  if (statusChanged && data.status === "Ready for Delivery") {
    // delivery readiness report — notify coordinators + admin
    await notifyRole("ACCOUNTANT", {
      title: "Project ready for delivery",
      body: `${existing.orderCode} (${existing.client.businessName}) is ready for delivery — please coordinate with the client.`,
      type: "order",
      link: "orders",
    });
    await notifyRole("ADMIN", {
      title: "Project ready for delivery",
      body: `${existing.orderCode} (${existing.client.businessName}) marked Ready for Delivery by ${user.name}.`,
      type: "order",
      link: "orders",
    });
  }

  const order = await db.order.update({ where: { id }, data });

  if (statusChanged) {
    await db.orderRevision.create({
      data: {
        orderId: id,
        fromStatus: existing.status,
        toStatus: order.status,
        userId: user.id,
        note: sanitize(b.statusNote),
      },
    });
    await logActivity({
      userId: user.id,
      action: "update",
      entity: "order",
      entityId: id,
      summary: `Order ${order.orderCode} status: ${existing.status} → ${order.status}`,
    });
    if (order.status === "Client Review") {
      await notifyRole("ACCOUNTANT", {
        title: "Project moved to Client Review",
        body: `${order.orderCode} (${existing.client.businessName}) is now in Client Review.`,
        type: "order",
        link: "orders",
      });
    }
    if (order.status === "Delivered") {
      await notifyRole("ACCOUNTANT", {
        title: "Website delivered",
        body: `${order.orderCode} (${existing.client.businessName}) was delivered. Please track remaining payment.`,
        type: "order",
        link: "orders",
      });
    }
  } else {
    await logActivity({
      userId: user.id,
      action: "update",
      entity: "order",
      entityId: id,
      summary: `Order updated: ${order.orderCode}`,
      details: { fields: Object.keys(data) },
    });
  }

  // Deadline changes notify the developer
  const deadlineChanged =
    (data.internalDeadline !== undefined &&
      String(data.internalDeadline) !== String(existing.internalDeadline)) ||
    (data.deliveryDate !== undefined &&
      String(data.deliveryDate) !== String(existing.deliveryDate));
  if (deadlineChanged && order.developerId && order.developerId !== user.id) {
    await notify({
      userId: order.developerId,
      title: "Deadline changed on your project",
      body: `${order.orderCode} — internal deadline or delivery date was updated by ${user.name}.`,
      type: "deadline",
      link: "orders",
    });
  }
  // Developer assignment
  if (data.developerId && data.developerId !== existing.developerId) {
    await notify({
      userId: String(data.developerId),
      title: "New project assigned to you",
      body: `${order.orderCode} — ${order.serviceType}.`,
      type: "order",
      link: "orders",
    });
  }
  return Response.json({ order });
});

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("orders:delete");
  const { id } = await params;
  const existing = await db.order.findUnique({
    where: { id },
    include: { _count: { select: { payments: true, invoices: true } } },
  });
  if (!existing) throw new ApiError(404, "Order not found");
  if (existing._count.payments > 0) {
    throw new ApiError(
      409,
      "This order has recorded payments and cannot be deleted. Cancel or close it instead.",
    );
  }
  await db.order.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "delete",
    entity: "order",
    entityId: id,
    summary: `Order deleted: ${existing.orderCode}`,
  });
  return Response.json({ ok: true });
});
