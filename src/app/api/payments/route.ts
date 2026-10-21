import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notifyRole,
  withCodeRetry,
  parseDateSafe,
  parseDateEndOfDaySafe,
  sanitize,
  parseFloatSafe,
} from "@/lib/helpers";

export const GET = handler(async (req: Request) => {
  await requirePermission("payments:read");
  const url = new URL(req.url);
  const q = sanitize(url.searchParams.get("q"));
  const orderId = sanitize(url.searchParams.get("orderId"));
  const clientId = sanitize(url.searchParams.get("clientId"));
  const from = parseDateSafe(url.searchParams.get("from"));
  const to = parseDateEndOfDaySafe(url.searchParams.get("to")); // include whole final day
  const direction = sanitize(url.searchParams.get("direction"));

  const payments = await db.payment.findMany({
    where: {
      AND: [
        orderId ? { orderId } : {},
        clientId ? { clientId } : {},
        direction ? { direction } : {},
        from ? { receivedAt: { gte: from } } : {},
        to ? { receivedAt: { lte: to } } : {},
        q
          ? {
              OR: [
                { paymentCode: { contains: q } },
                { reference: { contains: q } },
                { notes: { contains: q } },
                { client: { businessName: { contains: q } } },
                { order: { orderCode: { contains: q } } },
              ],
            }
          : {},
      ],
    },
    orderBy: { receivedAt: "desc" },
    include: {
      client: { select: { id: true, businessName: true, clientCode: true } },
      order: { select: { id: true, orderCode: true, serviceType: true } },
    },
  });

  const totals = {
    received: payments
      .filter((p) => p.direction === "in")
      .reduce((s, p) => s + p.amount, 0),
    refunded: payments
      .filter((p) => p.direction === "out")
      .reduce((s, p) => s + p.amount, 0),
  };
  return Response.json({ payments, totals });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("payments:write");
  const b = await req.json().catch(() => ({}));
  const clientId = sanitize(b.clientId);
  const amount = parseFloatSafe(b.amount);
  if (!clientId) throw new ApiError(400, "Client is required");
  if (!amount || amount <= 0)
    throw new ApiError(400, "Amount must be greater than zero");

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ApiError(404, "Client not found");

  const payment = await withCodeRetry("payment", "paymentCode", (paymentCode) =>
    db.payment.create({
      data: {
        paymentCode,
        clientId,
        orderId: sanitize(b.orderId),
        amount,
        direction: sanitize(b.direction) === "out" ? "out" : "in",
        category: sanitize(b.category) ?? "Project Payment",
        method: sanitize(b.method) ?? "Bank Transfer",
        reference: sanitize(b.reference),
        notes: sanitize(b.notes),
        receivedAt: parseDateSafe(b.receivedAt) ?? new Date(),
        recordedById: user.id,
        invoiceId: sanitize(b.invoiceId),
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "payment",
    entityId: payment.id,
    summary: `Payment recorded: ${payment.paymentCode} — SAR ${amount.toFixed(2)} from ${client.businessName} (${payment.method})`,
    details: { orderId: payment.orderId, direction: payment.direction },
  });
  await notifyRole("ADMIN", {
    title: "Payment recorded",
    body: `SAR ${amount.toFixed(2)} received from ${client.businessName} — recorded by ${user.name}.`,
    type: "payment",
    link: "payments",
  });

  // If tied to an invoice, update its paid amount / status
  if (payment.invoiceId) {
    const invoice = await db.invoice.findUnique({
      where: { id: payment.invoiceId },
      include: { payments: true },
    });
    if (invoice) {
      const paid = invoice.payments
        .filter((p) => p.direction === "in")
        .reduce((s, p) => s + p.amount, 0);
      const refunded = invoice.payments
        .filter((p) => p.direction === "out")
        .reduce((s, p) => s + p.amount, 0);
      const net = paid - refunded;
      const status =
        net >= invoice.total
          ? "Paid"
          : net > 0
            ? "Partially Paid"
            : invoice.status;
      await db.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: net, status },
      });
    }
  }

  // If the order reaches full payment, move workflow forward
  if (payment.orderId && payment.direction === "in") {
    const order = await db.order.findUnique({ where: { id: payment.orderId } });
    if (order) {
      const agg = await db.payment.aggregate({
        where: { orderId: order.id, direction: "in" },
        _sum: { amount: true },
      });
      const refunds = await db.payment.aggregate({
        where: { orderId: order.id, direction: "out" },
        _sum: { amount: true },
      });
      const net = (agg._sum.amount ?? 0) - (refunds._sum.amount ?? 0);
      if (net >= order.agreedPrice && order.status === "Delivered") {
        await db.order.update({
          where: { id: order.id },
          data: { status: "Payment Completed" },
        });
        await db.orderRevision.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "Payment Completed",
            userId: user.id,
            note: "Full payment received",
          },
        });
      }
    }
  }

  return Response.json({ payment }, { status: 201 });
});
