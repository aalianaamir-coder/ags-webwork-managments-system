import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import { logActivity, sanitize } from "@/lib/helpers";

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Params) => {
  await requirePermission("minvoices:read");
  const { id } = await params;
  const invoice = await db.maintenanceInvoice.findUnique({
    where: { id },
    include: {
      client: true,
      subscription: {
        include: { plan: true, order: { select: { orderCode: true } } },
      },
      payments: { orderBy: { receivedAt: "desc" } },
    },
  });
  if (!invoice) throw new ApiError(404, "Invoice not found");
  return Response.json({ invoice });
});

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission("minvoices:write");
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const existing = await db.maintenanceInvoice.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Invoice not found");

  const data: Record<string, unknown> = {};
  if ("status" in b) {
    const status = sanitize(b.status);
    const allowed = [
      "Draft",
      "Issued",
      "Partially Paid",
      "Paid",
      "Overdue",
      "Void",
    ];
    if (!status || !allowed.includes(status))
      throw new ApiError(400, "Invalid invoice status");
    if (status === "Void" && existing.status === "Paid")
      throw new ApiError(409, "A paid invoice cannot be voided");
    data.status = status;
  }
  if ("notes" in b) data.notes = sanitize(b.notes);
  if ("dueDate" in b && sanitize(b.dueDate))
    data.dueDate = new Date(String(b.dueDate));

  const invoice = await db.maintenanceInvoice.update({ where: { id }, data });
  await logActivity({
    userId: user.id,
    action: "update",
    entity: "minvoice",
    entityId: id,
    summary: `Maintenance invoice ${invoice.invoiceCode} updated${existing.status !== invoice.status ? ` (${existing.status} → ${invoice.status})` : ""}`,
  });
  return Response.json({ invoice });
});

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("minvoices:write");
  const { id } = await params;
  const existing = await db.maintenanceInvoice.findUnique({
    where: { id },
    include: { _count: { select: { payments: true } } },
  });
  if (!existing) throw new ApiError(404, "Invoice not found");
  if (existing._count.payments > 0)
    throw new ApiError(
      409,
      "This invoice has recorded payments — void it instead of deleting",
    );
  await db.maintenanceInvoice.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "delete",
    entity: "minvoice",
    entityId: id,
    summary: `Maintenance invoice deleted: ${existing.invoiceCode}`,
  });
  return Response.json({ ok: true });
});
