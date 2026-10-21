import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notifyRole,
  withCodeRetry,
  sanitize,
  addMonths,
} from "@/lib/helpers";

export const GET = handler(async (req: Request) => {
  await requirePermission("minvoices:read");
  const url = new URL(req.url);
  const status = sanitize(url.searchParams.get("status"));
  const q = sanitize(url.searchParams.get("q"));

  const invoices = await db.maintenanceInvoice.findMany({
    where: {
      AND: [
        status ? { status } : {},
        q
          ? {
              OR: [
                { invoiceCode: { contains: q } },
                { client: { businessName: { contains: q } } },
                { subscription: { subscriptionCode: { contains: q } } },
              ],
            }
          : {},
      ],
    },
    orderBy: { issueDate: "desc" },
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
          clientCode: true,
          email: true,
          phone: true,
          location: true,
          city: true,
          contactPerson: true,
        },
      },
      subscription: {
        include: { plan: true, assignedTo: { select: { name: true } } },
      },
      payments: { orderBy: { receivedAt: "desc" } },
    },
  });
  return Response.json({ invoices });
});

/**
 * Manual invoice generation for a specific subscription (Addan / Sharjeel).
 * Duplicate prevention: unique constraint on (subscriptionId, billingPeriodStart).
 */
export const POST = handler(async (req: Request) => {
  const user = await requirePermission("minvoices:write");
  const b = await req.json().catch(() => ({}));
  const subscriptionId = sanitize(b.subscriptionId);
  if (!subscriptionId) throw new ApiError(400, "Subscription is required");

  const sub = await db.maintenanceSubscription.findUnique({
    where: { id: subscriptionId },
    include: { client: true, plan: true },
  });
  if (!sub) throw new ApiError(404, "Subscription not found");

  // Billing period = the subscription's current cycle
  const periodStart =
    sub.nextBillingDate <= new Date()
      ? sub.nextBillingDate
      : new Date(sub.nextBillingDate);
  const periodStartNorm = new Date(
    periodStart.getFullYear(),
    periodStart.getMonth(),
    1,
  );
  const periodEnd = new Date(
    periodStartNorm.getFullYear(),
    periodStartNorm.getMonth() + 1,
    0,
  );

  const duplicate = await db.maintenanceInvoice.findFirst({
    where: { subscriptionId: sub.id, billingPeriodStart: periodStartNorm },
  });
  if (duplicate) {
    throw new ApiError(
      409,
      `Invoice ${duplicate.invoiceCode} already exists for this billing period (${periodStartNorm.toLocaleDateString("en")} — ${periodEnd.toLocaleDateString("en")}).`,
    );
  }

  const settings = await db.businessSettings.findFirst();
  const taxRate = settings?.vatEnabled ? settings.vatRate : 0;
  const taxAmount = Math.round(sub.monthlyFee * (taxRate / 100) * 100) / 100;
  const total = sub.monthlyFee + taxAmount;
  const dueDate = new Date(
    Math.max(Date.now(), periodStartNorm.getTime()) + 14 * 86400000,
  );
  const invoice = await withCodeRetry(
    "minvoice",
    "invoiceCode",
    (invoiceCode) =>
      db.maintenanceInvoice.create({
        data: {
          invoiceCode,
          subscriptionId: sub.id,
          clientId: sub.clientId,
          issueDate: new Date(),
          dueDate: parseDueDate(b.dueDate) ?? dueDate,
          billingPeriodStart: periodStartNorm,
          billingPeriodEnd: periodEnd,
          status: sanitize(b.status) ?? "Issued",
          packagePrice: sub.monthlyFee,
          taxRate,
          taxAmount,
          total,
          notes: sanitize(b.notes) ?? `Monthly maintenance — ${sub.plan.name}`,
          terms: sanitize(b.terms) ?? settings?.invoiceFooter,
          generatedBy: `manual:${user.id}`,
        },
        include: {
          client: { select: { businessName: true } },
          subscription: { include: { plan: true } },
        },
      }),
  );

  // Advance the cycle & flip status to Payment Due
  await db.maintenanceSubscription.update({
    where: { id: sub.id },
    data: {
      nextBillingDate: addMonths(sub.nextBillingDate, 1),
      status: sub.status === "Active" ? "Payment Due" : sub.status,
    },
  });

  await logActivity({
    userId: user.id,
    action: "generate",
    entity: "minvoice",
    entityId: invoice.id,
    summary: `Maintenance invoice generated: ${invoice.invoiceCode} — ${sub.client.businessName} (${sub.plan.name}) — SAR ${total.toFixed(2)}`,
  });
  await notifyRole("ACCOUNTANT", {
    title: "Maintenance invoice generated",
    body: `${invoice.invoiceCode} for ${sub.client.businessName} — SAR ${total.toFixed(2)} (by ${user.name}).`,
    type: "maintenance",
    link: "maintenance-invoices",
  });
  return Response.json({ invoice }, { status: 201 });
});

function parseDueDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
