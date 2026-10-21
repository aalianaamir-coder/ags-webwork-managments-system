import { db } from '@/lib/db'
import { handler, ApiError, requireUser } from '@/lib/permissions'

type Params = { params: Promise<{ id: string }> }

export const POST = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser()
  const { id } = await params
  const notification = await db.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== user.id) throw new ApiError(404, 'Notification not found')
  await db.notification.update({ where: { id }, data: { isRead: true } })
  return Response.json({ ok: true })
})
