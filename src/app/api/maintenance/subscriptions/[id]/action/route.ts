import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, notifyRole, notify, sanitize, parseFloatSafe, addMonths } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

/**
 * Lifecycle actions on a maintenance subscription.
 * action: activate | pause | resume | renew | upgrade | downgrade | cancel | record-maintenance
 */
export const POST = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission('subs:manage')
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const action = String(b.action ?? '')
  const existing = await db.maintenanceSubscription.findUnique({
    where: { id },
    include: { client: { select: { businessName: true } }, plan: true },
  })
  if (!existing) throw new ApiError(404, 'Subscription not found')

  const data: Record<string, unknown> = {}
  let logSummary = ''

  switch (action) {
    case 'activate': {
      if (existing.status === 'Active') throw new ApiError(409, 'Subscription is already active')
      data.status = 'Active'
      data.nextBillingDate = existing.nextBillingDate < new Date() ? addMonths(new Date(), 1) : existing.nextBillingDate
      logSummary = 'Subscription activated'
      break
    }
    case 'pause': {
      if (!['Active', 'Payment Due', 'Overdue'].includes(existing.status)) throw new ApiError(409, 'Only active subscriptions can be paused')
      data.status = 'Paused'
      data.pauseReason = sanitize(b.reason) ?? 'Paused without reason'
      logSummary = `Subscription paused — ${data.pauseReason}`
      break
    }
    case 'resume': {
      if (existing.status !== 'Paused') throw new ApiError(409, 'Only paused subscriptions can be resumed')
      data.status = 'Active'
      data.pauseReason = null
      data.nextBillingDate = addMonths(new Date(), 1)
      logSummary = 'Subscription resumed'
      break
    }
    case 'renew': {
      data.status = 'Active'
      data.nextBillingDate = addMonths(existing.nextBillingDate > new Date() ? existing.nextBillingDate : new Date(), Number(b.months ?? 1))
      if (sanitize(b.renewalNotes)) data.renewalNotes = sanitize(b.renewalNotes)
      logSummary = `Subscription renewed until next billing ${new Date(data.nextBillingDate as Date).toDateString()}`
      break
    }
    case 'upgrade':
    case 'downgrade': {
      const planId = sanitize(b.planId)
      const newFee = parseFloatSafe(b.monthlyFee)
      if (!planId) throw new ApiError(400, 'A target package must be selected')
      const plan = await db.maintenancePlan.findUnique({ where: { id: planId } })
      if (!plan) throw new ApiError(404, 'Target plan not found')
      if (plan.id === existing.planId) throw new ApiError(400, `The subscription is already on ${plan.name}`)
      if (action === 'upgrade' && plan.sortOrder <= existing.plan.sortOrder && plan.code !== 'PRO') {
        throw new ApiError(400, 'Downgrade detected — use the downgrade action')
      }
      data.planId = plan.id
      data.planType = plan.code
      if (newFee && newFee > 0) data.monthlyFee = newFee
      else if (plan.monthlyPrice) data.monthlyFee = plan.monthlyPrice
      logSummary = `Package ${action}: ${existing.plan.name} → ${plan.name} (SAR ${data.monthlyFee ?? existing.monthlyFee}/month)`
      break
    }
    case 'cancel': {
      if (existing.status === 'Cancelled') throw new ApiError(409, 'Subscription is already cancelled')
      data.status = 'Cancelled'
      data.cancelledAt = new Date()
      logSummary = `Subscription cancelled — ${sanitize(b.reason) ?? 'no reason given'}`
      break
    }
    case 'record-maintenance': {
      data.lastMaintenanceDate = new Date()
      data.nextMaintenanceDate = new Date(Date.now() + 30 * 86400000)
      logSummary = `Maintenance performed — ${sanitize(b.note) ?? 'routine check'}`
      await db.maintenanceActivityLog.create({
        data: { subscriptionId: id, userId: user.id, action: 'maintenance', summary: sanitize(b.note) ?? 'Routine maintenance performed' },
      })
      break
    }
    default:
      throw new ApiError(400, 'Unknown action')
  }

  const sub = await db.maintenanceSubscription.update({ where: { id }, data })
  await db.maintenanceActivityLog.create({
    data: { subscriptionId: id, userId: user.id, action, summary: logSummary },
  })
  await logActivity({
    userId: user.id,
    action,
    entity: 'subscription',
    entityId: id,
    summary: `${logSummary} — ${sub.subscriptionCode} (${existing.client.businessName})`,
  })
  // Cancellation risk / overdue signals go to the CEO
  if (action === 'cancel') {
    await notifyRole('ADMIN', {
      title: 'Maintenance subscription cancelled',
      body: `${existing.client.businessName} — ${sub.subscriptionCode} was cancelled by ${user.name}.`,
      type: 'maintenance',
      link: 'maintenance',
    })
  }
  if (sub.assignedToId && sub.assignedToId !== user.id && ['pause', 'cancel', 'upgrade', 'downgrade'].includes(action)) {
    await notify({
      userId: sub.assignedToId,
      title: `Subscription ${action}d`,
      body: `${existing.client.businessName} — ${sub.subscriptionCode}: ${logSummary}`,
      type: 'maintenance',
      link: 'maintenance',
    })
  }
  return Response.json({ subscription: sub })
})
