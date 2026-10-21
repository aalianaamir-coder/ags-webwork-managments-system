import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  withCodeRetry,
  parseDateSafe,
  sanitize,
  parseFloatSafe,
} from "@/lib/helpers";

export const GET = handler(async (req: Request) => {
  await requirePermission("invoices:read");
  const url = new URL(req.url);
  const q = sanitize(url.searchParams.get("q"));
  const status = sanitize(url.searchParams.get("status"));
  const clientId = sanitize(url.searchParams.get("clientId"));

  const invoices = await db.invoice.findMany({
    where: {
      AND: [
        status ? { status } : {},
        clientId ? { clientId } : {},
        q
          ? {
              OR: [
                { invoiceCode: { contains: q } },
                { client: { businessName: { contains: q } } },
                { order: { orderCode: { contains: q } } },
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
          email: true,
          phone: true,
          location: true,
          city: true,
        },
      },
      order: { select: { id: true, orderCode: true, serviceType: true } },
      items: true,
      _count: { select: { payments: true } },
    },
  });
  return Response.json({ invoices });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("invoices:write");
  const b = await req.json().catch(() => ({}));
  const clientId = sanitize(b.clientId);
  if (!clientId) throw new ApiError(400, "Client is required");

  const items = Array.isArray(b.items) ? b.items : [];
  const cleanItems = items
    .map((it: Record<string, unknown>) => ({
      description: sanitize(it.description) ?? "Service",
      quantity: parseFloatSafe(it.quantity) ?? 1,
      unitPrice: parseFloatSafe(it.unitPrice) ?? 0,
    }))
    .filter((it: { description: string }) => it.description)
    .map(
      (it: { description: string; quantity: number; unitPrice: number }) => ({
        ...it,
        amount: it.quantity * it.unitPrice,
      }),
    );
  if (!cleanItems.length)
    throw new ApiError(400, "At least one invoice line item is required");

  const settings = await db.businessSettings.findFirst();
  const taxRate = settings?.vatEnabled ? settings.vatRate : 0;
  const subtotal = cleanItems.reduce(
    (s: number, it: { amount: number }) => s + it.amount,
    0,
  );
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = subtotal + taxAmount;

  const dueDate =
    parseDateSafe(b.dueDate) ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  const invoice = await withCodeRetry("invoice", "invoiceCode", (invoiceCode) =>
    db.invoice.create({
      data: {
        invoiceCode,
        clientId,
        orderId: sanitize(b.orderId),
        issueDate: parseDateSafe(b.issueDate) ?? new Date(),
        dueDate,
        status: sanitize(b.status) ?? "Issued",
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: sanitize(b.notes),
        terms: sanitize(b.terms) ?? settings?.invoiceFooter,
        createdById: user.id,
        items: { create: cleanItems },
      },
      include: { items: true, client: { select: { businessName: true } } },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "invoice",
    entityId: invoice.id,
    summary: `Invoice created: ${invoice.invoiceCode} for ${invoice.client.businessName} — SAR ${total.toFixed(2)}`,
  });
  return Response.json({ invoice }, { status: 201 });
});
