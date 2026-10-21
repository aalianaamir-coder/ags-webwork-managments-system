import { db } from '@/lib/db'
import { handler, requirePermission, ApiError } from '@/lib/permissions'
import { parseDateEndOfDaySafe } from '@/lib/helpers'

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','))
  return '\uFEFF' + lines.join('\n') // BOM so Excel opens UTF-8 correctly
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '')

export const GET = handler(async (req: Request) => {
  const user = await requirePermission('reports:export')
  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'clients'
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const fromD = from ? new Date(from) : null
  const toD = parseDateEndOfDaySafe(to) // include the whole final day

  let rows: Record<string, unknown>[] = []
  let filename = 'export.csv'

  if (type === 'clients') {
    const clients = await db.client.findMany({ orderBy: { createdAt: 'desc' }, include: { assignedTo: { select: { name: true } } } })
    rows = clients.map((c) => ({
      'Client ID': c.clientCode,
      'Business Name': c.businessName,
      Category: c.businessCategory,
      'Contact Person': c.contactPerson,
      Phone: c.phone,
      WhatsApp: c.whatsapp,
      Email: c.email,
      Location: [c.location, c.city].filter(Boolean).join(', '),
      'Service Requested': c.serviceRequested,
      'Quoted Price (SAR)': c.quotedPrice,
      'Agreed Price (SAR)': c.agreedPrice,
      'Lead Source': c.leadSource,
      'Acquisition Date': iso(c.acquisitionDate),
      'Assigned To': c.assignedTo?.name,
      Status: c.status,
      Archived: c.archived ? 'Yes' : 'No',
      'Created At': iso(c.createdAt),
    }))
    filename = 'ags-clients.csv'
  } else if (type === 'orders') {
    const orders = await db.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: true, developer: { select: { name: true } }, coordinator: { select: { name: true } }, payments: true },
    })
    rows = orders
      .filter((o) => (!fromD || o.createdAt >= fromD) && (!toD || o.createdAt <= toD))
      .map((o) => {
        const received = o.payments.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amount, 0) - o.payments.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amount, 0)
        return {
          'Order ID': o.orderCode,
          Client: o.client.businessName,
          'Client ID': o.client.clientCode,
          Service: o.serviceType,
          'Agreed Price (SAR)': o.agreedPrice,
          'Received (SAR)': received,
          'Remaining (SAR)': o.agreedPrice - received,
          Developer: o.developer?.name,
          Coordinator: o.coordinator?.name,
          Priority: o.priority,
          Status: o.status,
          'Start Date': iso(o.startDate),
          'Internal Deadline': iso(o.internalDeadline),
          'Delivery Date': iso(o.deliveryDate),
          'Live URL': o.liveUrl,
          'Created At': iso(o.createdAt),
        }
      })
    filename = 'ags-orders.csv'
  } else if (type === 'payments') {
    const payments = await db.payment.findMany({
      orderBy: { receivedAt: 'desc' },
      include: { client: { select: { businessName: true } }, order: { select: { orderCode: true } } },
    })
    rows = payments
      .filter((p) => (!fromD || p.receivedAt >= fromD) && (!toD || p.receivedAt <= toD))
      .map((p) => ({
        'Payment ID': p.paymentCode,
        Date: iso(p.receivedAt),
        Client: p.client.businessName,
        Order: p.order?.orderCode,
        'Amount (SAR)': p.direction === 'out' ? -p.amount : p.amount,
        Direction: p.direction === 'in' ? 'Received' : 'Refund',
        Category: p.category,
        Method: p.method,
        Reference: p.reference,
        Notes: p.notes,
      }))
    filename = 'ags-payments.csv'
  } else if (type === 'expenses') {
    const expenses = await db.expense.findMany({ orderBy: { spentAt: 'desc' }, include: { creator: { select: { name: true } } } })
    rows = expenses
      .filter((e) => (!fromD || e.spentAt >= fromD) && (!toD || e.spentAt <= toD))
      .map((e) => ({
        'Expense ID': e.expenseCode,
        Date: iso(e.spentAt),
        Category: e.category,
        Description: e.description,
        'Amount (SAR)': e.amount,
        Vendor: e.vendor,
        Method: e.method,
        Status: e.status,
        'Recorded By': e.creator?.name,
      }))
    filename = 'ags-expenses.csv'
  } else if (type === 'maintenance-subscriptions') {
    const subs = await db.maintenanceSubscription.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { businessName: true } }, plan: true, assignedTo: { select: { name: true } } },
    })
    rows = subs.map((s) => ({
      'Subscription ID': s.subscriptionCode,
      Client: s.client.businessName,
      Domain: s.domain,
      Package: s.planType,
      'Monthly Fee (SAR)': s.monthlyFee,
      'Start Date': iso(s.startDate),
      'Next Billing': iso(s.nextBillingDate),
      Status: s.status,
      'Last Payment': iso(s.lastPaymentDate),
      'Assigned To': s.assignedTo?.name,
    }))
    filename = 'ags-maintenance-subscriptions.csv'
  } else if (type === 'maintenance-invoices') {
    const invs = await db.maintenanceInvoice.findMany({
      orderBy: { issueDate: 'desc' },
      include: { client: { select: { businessName: true } }, subscription: { select: { subscriptionCode: true } } },
    })
    rows = invs
      .filter((i) => (!fromD || i.issueDate >= fromD) && (!toD || i.issueDate <= toD))
      .map((i) => ({
        'Invoice Number': i.invoiceCode,
        Client: i.client.businessName,
        Subscription: i.subscription.subscriptionCode,
        'Billing Period': `${iso(i.billingPeriodStart)} to ${iso(i.billingPeriodEnd)}`,
        'Issue Date': iso(i.issueDate),
        'Due Date': iso(i.dueDate),
        'Package Price (SAR)': i.packagePrice,
        'Tax (SAR)': i.taxAmount,
        'Total (SAR)': i.total,
        'Paid (SAR)': i.amountPaid,
        Status: i.status,
      }))
    filename = 'ags-maintenance-invoices.csv'
  } else {
    throw new ApiError(400, 'Unknown export type')
  }

  const csv = toCSV(rows)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
})
