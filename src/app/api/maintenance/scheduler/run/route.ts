import { db } from "@/lib/db";
import { handler, requirePermission } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth";
import {
  logActivity,
  notify,
  notifyRole,
  withCodeRetry,
  addMonths,
} from "@/lib/helpers";

/**
 * Auth for this endpoint accepts ANY of:
 *  - a signed-in ADMIN/ACCOUNTANT session (UI auto-trigger + manual button),
 *  - the "x-scheduler-key" header matching process.env.SCHEDULER_KEY, or
 *  - "Authorization: Bearer <SCHEDULER_KEY>" — this is what Vercel Cron sends
 *    (set CRON_SECRET = SCHEDULER_KEY in Vercel). The key is never sent to the
 *    client and is only honored when the environment variable is set.
 */
async function authorizeScheduler(req: Request): Promise<boolean> {
  const key = process.env.SCHEDULER_KEY;
  if (key) {
    const provided = req.headers.get("x-scheduler-key");
    if (provided && provided === key) return true;
    const bearer = req.headers.get("authorization");
    if (bearer && bearer === `Bearer ${key}`) return true;
  }
  await requirePermission("scheduler:run");
  return false;
}

/**
 * Recurring maintenance invoice scheduler.
 *
 * How it runs in this deployment:
 *  1. Automatically: while any ADMIN/ACCOUNTANT is signed in, the app calls this
 *     endpoint every 5 minutes (idempotent — safe to call repeatedly) because a
 *     long-running OS cron job is not available in this hosting environment.
 *  2. Manually: the "Generate Due Invoices" button in Maintenance → Invoices.
 *  3. In production (VPS / Supabase / Vercel), replace the auto-trigger with a real
 *     cron job hitting this endpoint:
 *       curl -X POST https://<your-domain>/api/maintenance/scheduler/run -H "x-scheduler-key: $SCHEDULER_KEY"
 *
 * For every ACTIVE / PAYMENT DUE subscription whose nextBillingDate has arrived:
 *  - creates the monthly invoice (unique constraint prevents duplicates),
 *  - advances nextBillingDate by one month (handles short months),
 *  - flips status to Payment Due / Overdue appropriately,
 *  - notifies the accountant (new invoices) and the CEO (overdue / at-risk).
 */
export const POST = handler(async (req: Request) => {
  await authorizeScheduler(req);
  return runScheduler();
});

/** Vercel Cron entry point: GET with Authorization: Bearer <SCHEDULER_KEY> runs the
 *  scheduler; a signed-in session gets the lightweight status (client auto-trigger). */
export const GET = handler(async (req: Request) => {
  const viaKey = await authorizeScheduler(req);
  if (viaKey) return runScheduler();
  return schedulerStatus();
});

async function runScheduler() {
  const user = await getSessionUser();
  const now = new Date();

  const settings = await db.businessSettings.findFirst();
  if (settings && !settings.schedulerEnabled) {
    return Response.json({
      ok: true,
      skipped: true,
      message: "Automatic scheduling is disabled in Settings.",
    });
  }

  const subs = await db.maintenanceSubscription.findMany({
    where: {
      status: { in: ["Active", "Payment Due", "Overdue"] },
      nextBillingDate: { lte: now },
    },
    include: { client: true, plan: true },
  });

  // Housekeeping: sweep expired user sessions on every scheduler pass
  await db.session
    .deleteMany({ where: { expiresAt: { lt: now } } })
    .catch(() => {});

  const results: {
    code: string;
    client: string;
    status: "created" | "skipped" | "failed";
    detail: string;
  }[] = [];

  for (const sub of subs) {
    try {
      // Billing period = calendar month of the due billing date
      const periodStart = new Date(
        sub.nextBillingDate.getFullYear(),
        sub.nextBillingDate.getMonth(),
        1,
      );
      const periodEnd = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth() + 1,
        0,
      );

      const duplicate = await db.maintenanceInvoice.findFirst({
        where: { subscriptionId: sub.id, billingPeriodStart: periodStart },
      });
      if (duplicate) {
        results.push({
          code: sub.subscriptionCode,
          client: sub.client.businessName,
          status: "skipped",
          detail: `already invoiced (${duplicate.invoiceCode})`,
        });
        // still advance the billing date if it somehow lagged behind
        await db.maintenanceSubscription.update({
          where: { id: sub.id },
          data: { nextBillingDate: addMonths(sub.nextBillingDate, 1) },
        });
        continue;
      }

      const taxRate = settings?.vatEnabled ? settings.vatRate : 0;
      const taxAmount =
        Math.round(sub.monthlyFee * (taxRate / 100) * 100) / 100;
      const total = sub.monthlyFee + taxAmount;

      const { invoiceCode } = await withCodeRetry(
        "minvoice",
        "invoiceCode",
        async (code) => {
          await db.maintenanceInvoice.create({
            data: {
              invoiceCode: code,
              subscriptionId: sub.id,
              clientId: sub.clientId,
              issueDate: now,
              dueDate: new Date(now.getTime() + 14 * 86400000),
              billingPeriodStart: periodStart,
              billingPeriodEnd: periodEnd,
              status: "Issued",
              packagePrice: sub.monthlyFee,
              taxRate,
              taxAmount,
              total,
              notes: `Monthly website maintenance — ${sub.plan.name}${sub.domain ? ` (${sub.domain})` : ""}`,
              terms: settings?.invoiceFooter,
              generatedBy: "auto-scheduler",
            },
          });
          return { invoiceCode: code };
        },
      );

      // Advance billing date by exactly one month (handles months shorter than billing day)
      const next = addMonths(sub.nextBillingDate, 1);
      await db.maintenanceSubscription.update({
        where: { id: sub.id },
        data: {
          nextBillingDate: next,
          status: sub.status === "Active" ? "Payment Due" : sub.status,
        },
      });
      await db.maintenanceActivityLog.create({
        data: {
          subscriptionId: sub.id,
          userId: user?.id ?? null,
          action: "generate",
          summary: `Auto-generated maintenance invoice ${invoiceCode} for ${periodStart.toLocaleDateString("en", { month: "long", year: "numeric" })} — SAR ${total.toFixed(2)}`,
        },
      });
      await logActivity({
        userId: user?.id ?? null,
        action: "generate",
        entity: "minvoice",
        summary: `Scheduler: invoice ${invoiceCode} generated for ${sub.client.businessName} (${sub.subscriptionCode}) — SAR ${total.toFixed(2)}`,
      });
      await notifyRole("ACCOUNTANT", {
        title: "New maintenance invoice generated",
        body: `${invoiceCode} — ${sub.client.businessName}: SAR ${total.toFixed(2)} for ${periodStart.toLocaleDateString("en", { month: "long", year: "numeric" })}.`,
        type: "maintenance",
        link: "maintenance-invoices",
      });
      results.push({
        code: sub.subscriptionCode,
        client: sub.client.businessName,
        status: "created",
        detail: invoiceCode,
      });
    } catch (err) {
      // Track generation failures — visible in the response for authorized retries
      const detail = err instanceof Error ? err.message : "unknown error";
      await db.maintenanceSubscription
        .update({ where: { id: sub.id }, data: {} })
        .catch(() => {});
      results.push({
        code: sub.subscriptionCode,
        client: sub.client.businessName,
        status: "failed",
        detail,
      });
    }
  }

  // ---- Overdue detection pass ----
  const overdueInvoices = await db.maintenanceInvoice.findMany({
    where: {
      status: { in: ["Issued", "Partially Paid"] },
      dueDate: { lt: now },
    },
    include: { subscription: { include: { client: true } }, client: true },
  });
  let overdueMarked = 0;
  for (const inv of overdueInvoices) {
    await db.maintenanceInvoice.update({
      where: { id: inv.id },
      data: { status: "Overdue" },
    });
    overdueMarked++;
    // subscription becomes overdue if payment is late
    if (["Payment Due", "Active"].includes(inv.subscription.status)) {
      await db.maintenanceSubscription.update({
        where: { id: inv.subscriptionId },
        data: { status: "Overdue" },
      });
    }
    await notifyRole("ADMIN", {
      title: "Maintenance invoice overdue",
      body: `${inv.invoiceCode} — ${inv.client.businessName}: SAR ${(inv.total - inv.amountPaid).toFixed(2)} outstanding since ${inv.dueDate.toDateString()}.`,
      type: "alert",
      link: "maintenance-invoices",
    });
  }

  if (settings) {
    await db.businessSettings.update({
      where: { id: settings.id },
      data: { schedulerLastRunAt: now },
    });
  }

  const created = results.filter((r) => r.status === "created").length;
  const failed = results.filter((r) => r.status === "failed").length;
  await logActivity({
    userId: user?.id ?? null,
    action: "scheduler-run",
    entity: "settings",
    summary: `Maintenance scheduler run: ${created} invoice(s) generated, ${overdueMarked} marked overdue${failed ? `, ${failed} FAILED` : ""}`,
  });
  return Response.json({
    ok: true,
    ranAt: now.toISOString(),
    processed: subs.length,
    created,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed,
    overdueMarked,
    results,
  });
}

/** Lightweight status check used by the client auto-trigger. */
async function schedulerStatus() {
  const settings = await db.businessSettings.findFirst();
  const due = await db.maintenanceSubscription.count({
    where: {
      status: { in: ["Active", "Payment Due", "Overdue"] },
      nextBillingDate: { lte: new Date() },
    },
  });
  return Response.json({
    schedulerEnabled: settings?.schedulerEnabled ?? false,
    lastRunAt: settings?.schedulerLastRunAt ?? null,
    subscriptionsDue: due,
  });
}
