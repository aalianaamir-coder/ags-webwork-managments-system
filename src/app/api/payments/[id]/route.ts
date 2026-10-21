import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, parseFloatSafe, parseDateSafe, sanitize } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission('payments:delete')
  const { id } = await params
  const existing = await db.payment.findUnique({ where: { id }, include: { client: { select: { businessName: true } } } })
  if (!existing) throw new ApiError(404, 'Payment not found')
  await db.payment.delete({ where: { id } })
  // Recompute linked invoice status if needed
  if (existing.invoiceId) {
    const invoice = await db.invoice.findUnique({ where: { id: existing.invoiceId }, include: { payments: true } })
    if (invoice) {
      const paid = invoice.payments.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amount, 0)
      const refunded = invoice.payments.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amount, 0)
      const net = paid - refunded
      await db.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: net, status: net >= invoice.total ? 'Paid' : net > 0 ? 'Partially Paid' : 'Issued' },
      })
    }
  }
  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'payment',
    entityId: id,
    summary: `Payment deleted: ${existing.paymentCode} (SAR ${existing.amount.toFixed(2)} — ${existing.client.businessName})`,
  })
  return Response.json({ ok: true })
})
