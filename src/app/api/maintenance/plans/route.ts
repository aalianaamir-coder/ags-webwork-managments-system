import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, sanitize, parseFloatSafe } from '@/lib/helpers'

export const GET = handler(async () => {
  await requirePermission('plans:read')
  const plans = await db.maintenancePlan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  })
  return Response.json({
    plans: plans.map((p) => ({
      ...p,
      features: safeParse(p.features),
      exclusions: p.exclusions,
      activeSubscriptions: p._count.subscriptions,
    })),
  })
})

function safeParse(s: string | null): string[] {
  try {
    const v = JSON.parse(s ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export const POST = handler(async (req: Request) => {
  const user = await requirePermission('plans:write')
  const b = await req.json().catch(() => ({}))
  const code = sanitize(b.code)?.toUpperCase()
  const name = sanitize(b.name)
  if (!code || !name) throw new ApiError(400, 'Plan code and name are required')
  const exists = await db.maintenancePlan.findUnique({ where: { code } })
  if (exists) throw new ApiError(409, `A plan with code ${code} already exists`)

  const plan = await db.maintenancePlan.create({
    data: {
      code,
      name,
      description: sanitize(b.description),
      monthlyPrice: parseFloatSafe(b.monthlyPrice),
      features: JSON.stringify(Array.isArray(b.features) ? b.features.filter(Boolean) : []),
      updateLimit: b.updateLimit === null || b.updateLimit === undefined || b.updateLimit === '' ? null : Number(b.updateLimit),
      supportLimit: b.supportLimit === null || b.supportLimit === undefined || b.supportLimit === '' ? null : Number(b.supportLimit),
      exclusions: sanitize(b.exclusions),
      sortOrder: Number(b.sortOrder ?? 99),
      updatedById: user.id,
    },
  })
  await logActivity({
    userId: user.id,
    action: 'create',
    entity: 'plan',
    entityId: plan.id,
    summary: `Maintenance plan created: ${plan.name} (${plan.code})${plan.monthlyPrice ? ` — SAR ${plan.monthlyPrice}/month` : ' — custom pricing'}`,
  })
  return Response.json({ plan: { ...plan, features: safeParse(plan.features) } }, { status: 201 })
})
