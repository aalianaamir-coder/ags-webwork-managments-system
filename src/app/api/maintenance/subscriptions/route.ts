import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notify,
  withCodeRetry,
  sanitize,
  parseFloatSafe,
  parseDateSafe,
  addMonths,
} from "@/lib/helpers";

const SUB_STATUSES = [
  "Pending",
  "Active",
  "Payment Due",
  "Overdue",
  "Paused",
  "Cancelled",
  "Expired",
];

export const GET = handler(async (req: Request) => {
  const user = await requirePermission("subs:read");
  const url = new URL(req.url);
  const status = sanitize(url.searchParams.get("status"));
  const q = sanitize(url.searchParams.get("q"));

  let subs = await db.maintenanceSubscription.findMany({
    where: {
      AND: [
        status ? { status } : {},
        q
          ? {
              OR: [
                { subscriptionCode: { contains: q } },
                { domain: { contains: q } },
                { client: { businessName: { contains: q } } },
              ],
            }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
          clientCode: true,
          contactPerson: true,
          phone: true,
          email: true,
        },
      },
      plan: true,
      assignedTo: { select: { id: true, name: true, avatarUrl: true } },
      order: { select: { id: true, orderCode: true } },
      _count: { select: { invoices: true, tickets: true } },
    },
  });

  if (user.role === "DEVELOPER") {
    subs = subs.filter((s) => s.assignedToId === user.id);
  }

  // Attach open balance per subscription for finance roles
  const enriched = await Promise.all(
    subs.map(async (s) => {
      const invs = await db.maintenanceInvoice.findMany({
        where: {
          subscriptionId: s.id,
          status: { in: ["Issued", "Partially Paid", "Overdue"] },
        },
        select: { total: true, amountPaid: true },
      });
      return {
        ...s,
        openBalance: invs.reduce((sum, i) => sum + (i.total - i.amountPaid), 0),
      };
    }),
  );
  return Response.json({ subscriptions: enriched, statuses: SUB_STATUSES });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("subs:manage");
  const b = await req.json().catch(() => ({}));
  const clientId = sanitize(b.clientId);
  const planId = sanitize(b.planId);
  const monthlyFee = parseFloatSafe(b.monthlyFee);
  const startDate = parseDateSafe(b.startDate) ?? new Date();
  if (!clientId) throw new ApiError(400, "Client is required");
  if (!planId)
    throw new ApiError(400, "A maintenance package must be selected");
  if (!monthlyFee || monthlyFee <= 0)
    throw new ApiError(400, "Monthly fee must be greater than zero");

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ApiError(404, "Client not found");
  const plan = await db.maintenancePlan.findUnique({ where: { id: planId } });
  if (!plan) throw new ApiError(404, "Plan not found");

  const planType =
    plan.code === "CUSTOM" || sanitize(b.planType) === "CUSTOM"
      ? "CUSTOM"
      : plan.code;
  const billingDay = Math.min(
    31,
    Math.max(1, Number(b.billingDay ?? startDate.getDate())),
  );
  const nextBillingDate = addMonths(startDate, 1);

  const sub = await withCodeRetry(
    "msub",
    "subscriptionCode",
    (subscriptionCode) =>
      db.maintenanceSubscription.create({
        data: {
          subscriptionCode,
          clientId,
          orderId: sanitize(b.orderId),
          domain: sanitize(b.domain),
          websiteUrl: sanitize(b.websiteUrl),
          planId,
          planType,
          monthlyFee,
          startDate,
          billingDay,
          nextBillingDate,
          status: sanitize(b.status) ?? "Pending",
          paymentMethod: sanitize(b.paymentMethod),
          nextMaintenanceDate: parseDateSafe(b.nextMaintenanceDate),
          assignedToId: sanitize(b.assignedToId),
          contractTerms: sanitize(b.contractTerms),
          renewalNotes: sanitize(b.renewalNotes),
        },
        include: { client: { select: { businessName: true } }, plan: true },
      }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "subscription",
    entityId: sub.id,
    summary: `Maintenance subscription created: ${sub.subscriptionCode} — ${client.businessName} on ${plan.name} (SAR ${monthlyFee}/month)`,
  });
  await db.maintenanceActivityLog.create({
    data: {
      subscriptionId: sub.id,
      userId: user.id,
      action: "create",
      summary: `Subscription created on ${plan.name} at SAR ${monthlyFee}/month`,
    },
  });
  if (sub.assignedToId && sub.assignedToId !== user.id) {
    await notify({
      userId: sub.assignedToId,
      title: "Maintenance client assigned to you",
      body: `${client.businessName} — ${plan.name} subscription (${sub.subscriptionCode}).`,
      type: "maintenance",
      link: "maintenance",
    });
  }
  return Response.json({ subscription: sub }, { status: 201 });
});
