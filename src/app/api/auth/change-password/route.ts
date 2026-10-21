import { db } from '@/lib/db'
import { getSessionUser, hashPassword, verifyPassword, destroyAllUserSessions, createSession } from '@/lib/auth'
import { handler, ApiError } from '@/lib/permissions'
import { logActivity } from '@/lib/helpers'

/** Change own password. Enforced on first login (mustChangePassword). */
export const POST = handler(async (req: Request) => {
  const sessionUser = await getSessionUser()
  if (!sessionUser) throw new ApiError(401, 'Authentication required')

  const body = await req.json().catch(() => ({}))
  const currentPassword = String(body.currentPassword ?? '')
  const newPassword = String(body.newPassword ?? '')
  const confirmPassword = String(body.confirmPassword ?? '')

  if (sessionUser.mustChangePassword) {
    // first-login flow: current password is the seeded one
  } else if (!currentPassword) {
    throw new ApiError(400, 'Current password is required')
  }

  if (newPassword.length < 8) throw new ApiError(400, 'New password must be at least 8 characters')
  if (newPassword !== confirmPassword) throw new ApiError(400, 'Passwords do not match')

  const user = await db.user.findUnique({ where: { id: sessionUser.id } })
  if (!user) throw new ApiError(404, 'Account not found')

  if (currentPassword) {
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new ApiError(401, 'Current password is incorrect')
    }
  }
  if (verifyPassword(newPassword, user.passwordHash)) {
    throw new ApiError(400, 'New password must be different from the current password')
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
  })
  // Invalidate all other sessions after a password change, then re-issue one
  await destroyAllUserSessions(user.id)
  await createSession(user.id)
  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'user',
    entityId: user.id,
    summary: `${user.name} changed their password`,
  })
  return Response.json({ ok: true })
})
