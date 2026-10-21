import { db } from '@/lib/db'
import { handler, requirePermission } from '@/lib/permissions'

export const GET = handler(async (req: Request) => {
  await requirePermission('activity:read')
  const url = new URL(req.url)
  const entity = url.searchParams.get('entity') ?? undefined
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)

  const logs = await db.activityLog.findMany({
    where: entity ? { entity } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true, avatarUrl: true, role: true } } },
  })
  return Response.json({ logs })
})
