import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, sanitize, parseFloatSafe, parseDateSafe } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

export const GET = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission('subs:read')
  const { id } = await params
  const sub = await db.maintenanceSubscription.findUnique({
    where: { id },
    include: {
      client: true,
      plan: true,
      assignedTo: { select: { id: true, name: true, avatarUrl: true } },
      order: { select: { id: true, orderCode: true, serviceType: true } },
      invoices: {
        orderBy: { issueDate: 'desc' },
        include: { payments: true },
      },
      tickets: { orderBy: { createdAt: 'desc' }, include: { assignee: { select: { name: true } } } },
      logs: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  })
  if (!sub) throw new ApiError(404, 'Subscription not found')
  if (user.role === 'DEVELOPER' && sub.assignedToId !== user.id) {
    throw new ApiError(403, 'This subscription is not assigned to you')
  }
  return Response.json({ subscription: sub })
})

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission('subs:manage')
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const existing = await db.maintenanceSubscription.findUnique({ where: { id }, include: { client: true, plan: true } })
  if (!existing) throw new ApiError(404, 'Subscription not found')

  const data: Record<string, unknown> = {}
  if ('domain' in b) data.domain = sanitize(b.domain)
  if ('websiteUrl' in b) data.websiteUrl = sanitize(b.websiteUrl)
  if ('orderId' in b) data.orderId = sanitize(b.orderId)
  if ('planId' in b && sanitize(b.planId)) {
    const plan = await db.maintenancePlan.findUnique({ where: { id: sanitize(b.planId)! } })
    if (!plan) throw new ApiError(404, 'Plan not found')
    data.planId = plan.id
    data.planType = plan.code
  }
  if ('monthlyFee' in b) data.monthlyFee = parseFloatSafe(b.monthlyFee) ?? existing.monthlyFee
  if ('startDate' in b) data.startDate = parseDateSafe(b.startDate) ?? existing.startDate
  if ('billingDay' in b) data.billingDay = Math.min(31, Math.max(1, Number(b.billingDay) || existing.billingDay))
  if ('nextBillingDate' in b) data.nextBillingDate = parseDateSafe(b.nextBillingDate) ?? existing.nextBillingDate
  if ('paymentMethod' in b) data.paymentMethod = sanitize(b.paymentMethod)
  if ('nextMaintenanceDate' in b) data.nextMaintenanceDate = parseDateSafe(b.nextMaintenanceDate)
  if ('lastMaintenanceDate' in b) data.lastMaintenanceDate = parseDateSafe(b.lastMaintenanceDate)
  if ('assignedToId' in b) data.assignedToId = sanitize(b.assignedToId)
  if ('contractTerms' in b) data.contractTerms = sanitize(b.contractTerms)
  if ('renewalNotes' in b) data.renewalNotes = sanitize(b.renewalNotes)
  if ('status' in b) data.status = sanitize(b.status) ?? existing.status

  const sub = await db.maintenanceSubscription.update({ where: { id }, data })
  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'subscription',
    entityId: id,
    summary: `Subscription updated: ${sub.subscriptionCode} (${existing.client.businessName})`,
    details: { changed: Object.keys(data) },
  })
  await db.maintenanceActivityLog.create({
    data: {
      subscriptionId: id,
      userId: user.id,
      action: 'update',
      summary: `Subscription details updated${existing.monthlyFee !== sub.monthlyFee ? ` — fee SAR ${existing.monthlyFee} → SAR ${sub.monthlyFee}` : ''}`,
    },
  })
  return Response.json({ subscription: sub })
})

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission('subs:manage')
  const { id } = await params
  const existing = await db.maintenanceSubscription.findUnique({
    where: { id },
    include: { client: { select: { businessName: true } }, _count: { select: { invoices: true } } },
  })
  if (!existing) throw new ApiError(404, 'Subscription not found')
  if (existing._count.invoices > 0) {
    throw new ApiError(409, 'This subscription has billing history — cancel it instead of deleting.')
  }
  await db.maintenanceSubscription.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'subscription',
    entityId: id,
    summary: `Subscription deleted: ${existing.subscriptionCode} (${existing.client.businessName})`,
  })
  return Response.json({ ok: true })
})
