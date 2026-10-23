import { db } from '@/lib/db'
import { handler, requirePermission, isSuperAdmin } from '@/lib/permissions'

export const GET = handler(async (req: Request) => {
  const user = await requirePermission('activity:read')
  const url = new URL(req.url)
  const entity = url.searchParams.get('entity') ?? undefined
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  // Entries created by hidden (system oversight) accounts are only shown to
  // the oversight role itself — other viewers never see them.
  const logs = await db.activityLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(isSuperAdmin(user) ? {} : { user: { hidden: false } }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, avatarUrl: true, role: true } } },
  })
  return Response.json({ logs })
})
