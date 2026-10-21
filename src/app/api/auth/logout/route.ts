import { destroySession, getSessionUser } from '@/lib/auth'
import { handler } from '@/lib/permissions'
import { logActivity } from '@/lib/helpers'

export const POST = handler(async () => {
  const user = await getSessionUser()
  if (user) {
    await logActivity({ userId: user.id, action: 'logout', entity: 'user', entityId: user.id, summary: `${user.name} signed out` })
  }
  await destroySession()
  return Response.json({ ok: true })
})
