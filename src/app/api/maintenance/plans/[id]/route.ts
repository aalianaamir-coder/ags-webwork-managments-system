import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, sanitize, parseFloatSafe } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission('plans:write')
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const existing = await db.maintenancePlan.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Plan not found')

  const data: Record<string, unknown> = { updatedById: user.id }
  if ('name' in b) data.name = sanitize(b.name) ?? existing.name
  if ('description' in b) data.description = sanitize(b.description)
  if ('monthlyPrice' in b) data.monthlyPrice = parseFloatSafe(b.monthlyPrice)
  if ('features' in b) data.features = JSON.stringify(Array.isArray(b.features) ? b.features.filter(Boolean) : [])
  if ('updateLimit' in b) data.updateLimit = b.updateLimit === null || b.updateLimit === '' ? null : Number(b.updateLimit)
  if ('supportLimit' in b) data.supportLimit = b.supportLimit === null || b.supportLimit === '' ? null : Number(b.supportLimit)
  if ('exclusions' in b) data.exclusions = sanitize(b.exclusions)
  if ('isActive' in b) data.isActive = Boolean(b.isActive)
  if ('sortOrder' in b) data.sortOrder = Number(b.sortOrder)

  const plan = await db.maintenancePlan.update({ where: { id }, data })
  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'plan',
    entityId: id,
    summary: `Maintenance plan updated: ${plan.name} (${plan.code})${existing.monthlyPrice !== plan.monthlyPrice ? ` — price ${existing.monthlyPrice ?? 'custom'} → ${plan.monthlyPrice ?? 'custom'}` : ''}`,
  })
  return Response.json({ plan: { ...plan, features: JSON.parse(plan.features) } })
})

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission('plans:write')
  const { id } = await params
  const existing = await db.maintenancePlan.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true } } } })
  if (!existing) throw new ApiError(404, 'Plan not found')
  if (existing._count.subscriptions > 0) {
    // Plans in use are deactivated, never deleted (subscription history stays intact)
    await db.maintenancePlan.update({ where: { id }, data: { isActive: false } })
    await logActivity({
      userId: user.id,
      action: 'archive',
      entity: 'plan',
      entityId: id,
      summary: `Maintenance plan deactivated (in use by ${existing._count.subscriptions} subscriptions): ${existing.name}`,
    })
    return Response.json({ ok: true, deactivated: true, message: 'Plan is used by existing subscriptions — deactivated instead of deleted.' })
  }
  await db.maintenancePlan.delete({ where: { id } })
  await logActivity({ userId: user.id, action: 'delete', entity: 'plan', entityId: id, summary: `Maintenance plan deleted: ${existing.name}` })
  return Response.json({ ok: true })
})
