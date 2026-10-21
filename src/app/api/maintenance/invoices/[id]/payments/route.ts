import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, notifyRole, sanitize, parseFloatSafe, parseDateSafe } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

/** Record a payment against a maintenance invoice. Statuses update only when money is actually recorded. */
export const POST = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission('minvoices:write')
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const amount = parseFloatSafe(b.amount)
  if (!amount || amount <= 0) throw new ApiError(400, 'Amount must be greater than zero')

  const invoice = await db.maintenanceInvoice.findUnique({
    where: { id },
    include: { subscription: { include: { client: true } }, payments: true },
  })
  if (!invoice) throw new ApiError(404, 'Invoice not found')
  if (invoice.status === 'Void') throw new ApiError(409, 'Cannot record a payment on a voided invoice')

  const payment = await db.maintenancePayment.create({
    data: {
      invoiceId: id,
      amount,
      method: sanitize(b.method) ?? 'Bank Transfer',
      reference: sanitize(b.reference),
      notes: sanitize(b.notes),
      receivedAt: parseDateSafe(b.receivedAt) ?? new Date(),
      recordedById: user.id,
    },
  })

  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0) + amount
  const status = paid >= invoice.total ? 'Paid' : 'Partially Paid'
  await db.maintenanceInvoice.update({ where: { id }, data: { amountPaid: paid, status } })

  // Payment landed → update the subscription's payment trail
  const subUpdate: Record<string, unknown> = { lastPaymentDate: payment.receivedAt }
  if (status === 'Paid' && ['Payment Due', 'Overdue'].includes(invoice.subscription.status)) {
    subUpdate.status = 'Active'
  }
  await db.maintenanceSubscription.update({ where: { id: invoice.subscriptionId }, data: subUpdate })

  await logActivity({
    userId: user.id,
    action: 'create',
    entity: 'maintenance-payment',
    entityId: payment.id,
    summary: `Maintenance payment recorded: SAR ${amount.toFixed(2)} on ${invoice.invoiceCode} (${invoice.subscription.client.businessName}) — ${status.toLowerCase()}`,
  })
  await notifyRole('ADMIN', {
    title: 'Maintenance payment received',
    body: `SAR ${amount.toFixed(2)} on ${invoice.invoiceCode} — ${invoice.subscription.client.businessName} (recorded by ${user.name}).`,
    type: 'payment',
    link: 'maintenance-invoices',
  })
  return Response.json({ payment, invoiceStatus: status }, { status: 201 })
})
