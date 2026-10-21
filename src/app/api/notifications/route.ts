import { db } from '@/lib/db'
import { handler, requireUser } from '@/lib/permissions'

export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get('unread') === 'true'

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ])
  return Response.json({ notifications, unreadCount })
})
