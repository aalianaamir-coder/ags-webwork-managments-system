import { db } from '@/lib/db'
import { handler, requirePermission } from '@/lib/permissions'
import { parseDateSafe, parseDateEndOfDaySafe } from '@/lib/helpers'

const ACTIVE_STATUSES = ['Order Confirmed', 'Development in Progress', 'Internal Review', 'Client Review', 'Revisions', 'Ready for Delivery']

export const GET = handler(async (req: Request) => {
  await requirePermission('reports:read')
  const url = new URL(req.url)
  const from = parseDateSafe(url.searchParams.get('from')) ?? new Date(new Date().getFullYear() - 1, 0, 1)
  // Date-only "to" values include the whole final day (23:59:59.999), so records
  // created on the last day of the range are not silently dropped.
  const to = parseDateEndOfDaySafe(url.searchParams.get('to')) ?? new Date(Date.now() + 86400000 * 365)

  const [orders, payments, expenses, clients, mInvoices] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { client: { select: { businessName: true } }, payments: true },
    }),
    db.payment.findMany({
      where: { receivedAt: { gte: from, lte: to } },
      include: { client: { select: { businessName: true } }, order: { select: { serviceType: true } } },
    }),
    db.expense.findMany({ where: { spentAt: { gte: from, lte: to } } }),
    db.client.findMany({ where: { acquisitionDate: { gte: from, lte: to } } }),
    db.maintenanceInvoice.findMany({
      where: { issueDate: { gte: from, lte: to } },
      include: { subscription: { include: { plan: true } } },
    }),
  ])

  // --- Monthly buckets ---
  const months: { key: string; label: string }[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  const end = new Date(to.getFullYear(), to.getMonth(), 1)
  while (cursor <= end && months.length < 36) {
    months.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: cursor.toLocaleString('en', { month: 'short', year: '2-digit' }),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  const salesByMonth = months.map((m) => ({
    month: m.label,
    value: orders.filter((o) => monthKey(o.createdAt) === m.key).reduce((s, o) => s + o.agreedPrice, 0),
    count: orders.filter((o) => monthKey(o.createdAt) === m.key).length,
  }))
  const revenueByMonth = months.map((m) => ({
    month: m.label,
    value: payments.filter((p) => p.direction === 'in' && monthKey(p.receivedAt) === m.key).reduce((s, p) => s + p.amount, 0)
      - payments.filter((p) => p.direction === 'out' && monthKey(p.receivedAt) === m.key).reduce((s, p) => s + p.amount, 0),
  }))
  const expensesByMonth = months.map((m) => ({
    month: m.label,
    value: expenses.filter((e) => e.status === 'Approved' && monthKey(e.spentAt) === m.key).reduce((s, e) => s + e.amount, 0),
  }))
  const profitByMonth = revenueByMonth.map((r, i) => ({ month: r.month, value: r.value - expensesByMonth[i].value }))

  // --- Orders by status ---
  const statusCounts: Record<string, number> = {}
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1

  // --- On-time vs overdue deliveries (delivered orders) ---
  const delivered = orders.filter((o) => ['Delivered', 'Payment Completed', 'Closed'].includes(o.status) && o.deliveredAt && o.deliveryDate)
  const onTime = delivered.filter((o) => o.deliveredAt! <= o.deliveryDate!).length
  const overdueProjects = orders.filter((o) => ACTIVE_STATUSES.includes(o.status) && o.internalDeadline && o.internalDeadline < new Date()).length

  // --- Lead funnel ---
  const allClients = await db.client.findMany({ where: { archived: false } })
  const funnel = ['Lead', 'Contacted', 'Interested', 'Negotiation', 'Won', 'Active Client', 'Lost'].map((s) => ({
    stage: s,
    count: allClients.filter((c) => c.status === s).length,
  }))
  const won = allClients.filter((c) => ['Won', 'Active Client'].includes(c.status)).length
  const conversionRate = allClients.length ? Math.round((won / allClients.length) * 100) : 0

  // --- Revenue by service category ---
  const serviceRevenue: Record<string, number> = {}
  for (const p of payments) {
    if (p.direction !== 'in') continue
    const cat = p.order?.serviceType ?? 'Other / Unlinked'
    serviceRevenue[cat] = (serviceRevenue[cat] ?? 0) + p.amount
  }

  // --- Workload by team member (hidden system accounts excluded) ---
  const team = await db.user.findMany({ where: { isActive: true, hidden: false }, select: { id: true, name: true, role: true, avatarUrl: true } })
  const workload = await Promise.all(
    team.map(async (t) => {
      const assigned = await db.order.count({ where: { developerId: t.id, status: { in: ACTIVE_STATUSES } } })
      const coordinating = await db.order.count({ where: { coordinatorId: t.id, status: { in: ACTIVE_STATUSES } } })
      const tasks = await db.task.count({ where: { assigneeId: t.id, status: { in: ['To Do', 'In Progress', 'Waiting', 'Review'] } } })
      const tickets = await db.maintenanceTicket.count({ where: { assigneeId: t.id, status: { in: ['New', 'In Progress', 'Waiting for Client'] } } })
      return { ...t, assigned, coordinating, tasks, tickets }
    })
  )

  // --- Maintenance reports ---
  const maintenanceRevenue = mInvoices.reduce((s, i) => s + i.amountPaid, 0)
  const subsAll = await db.maintenanceSubscription.findMany({ include: { plan: true } })
  const maintenanceReport = {
    mrr: subsAll.filter((s) => s.status === 'Active').reduce((s, x) => s + x.monthlyFee, 0),
    collected: maintenanceRevenue,
    outstanding: mInvoices.filter((i) => ['Issued', 'Partially Paid', 'Overdue'].includes(i.status)).reduce((s, i) => s + (i.total - i.amountPaid), 0),
    activeCount: subsAll.filter((s) => s.status === 'Active').length,
    cancelledCount: subsAll.filter((s) => s.status === 'Cancelled').length,
    planSplit: ['VALUE', 'PRO', 'CUSTOM'].map((t) => ({ plan: t, count: subsAll.filter((s) => s.planType === t && s.status !== 'Cancelled').length })),
    monthlyRevenue: months.map((m) => ({
      month: m.label,
      value: mInvoices.filter((i) => monthKey(i.issueDate) === m.key).reduce((s, i) => s + i.amountPaid, 0),
    })),
  }

  return Response.json({
    range: { from, to },
    salesByMonth,
    revenueByMonth,
    expensesByMonth,
    profitByMonth,
    ordersByStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    deliveryPerformance: { delivered: delivered.length, onTime, late: delivered.length - onTime, overdueActive: overdueProjects },
    clientsAcquiredByMonth: months.map((m) => ({ month: m.label, value: clients.filter((c) => c.acquisitionDate && monthKey(c.acquisitionDate) === m.key).length })),
    leadFunnel: funnel,
    conversionRate,
    serviceRevenue: Object.entries(serviceRevenue).map(([service, amount]) => ({ service, amount })).sort((a, b) => b.amount - a.amount),
    workload,
    maintenance: maintenanceReport,
    summary: {
      totalSales: orders.reduce((s, o) => s + o.agreedPrice, 0),
      totalRevenueReceived: payments.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amount, 0) - payments.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amount, 0),
      totalExpenses: expenses.filter((e) => e.status === 'Approved').reduce((s, e) => s + e.amount, 0),
      netProfit: payments.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amount, 0)
        - payments.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amount, 0)
        - expenses.filter((e) => e.status === 'Approved').reduce((s, e) => s + e.amount, 0),
      ordersCount: orders.length,
      clientsAcquired: clients.length,
    },
  })
})
