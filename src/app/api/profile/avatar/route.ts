import { db } from '@/lib/db'
import { handler, ApiError, requireUser, isAdminRole } from '@/lib/permissions'
import { logActivity } from '@/lib/helpers'
import { sniffContent } from '@/lib/file-validation'

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// POST /api/profile/avatar — upload/change a profile picture (self, or any member as ADMIN)
// Picture bytes are stored IN the database (User.avatarData) so the app works
// on serverless hosts (Vercel) where the filesystem is read-only/ephemeral.
export const POST = handler(async (req: Request) => {
  const user = await requireUser()

  const form = await req.formData().catch(() => null)
  if (!form) throw new ApiError(400, 'Multipart form data required')

  const file = form.get('file')
  if (!(file instanceof File)) throw new ApiError(400, 'No image provided')
  if (file.size > MAX_SIZE) throw new ApiError(413, 'Image is larger than the 2 MB limit')

  // Content-based validation — sniff magic bytes, never trust the declared MIME
  const buffer = Buffer.from(await file.arrayBuffer())
  const sniff = sniffContent(buffer, file.type || '', Object.keys(ALLOWED_TYPES))
  if (!sniff.ok) {
    if (sniff.reason === 'empty') throw new ApiError(400, 'The uploaded image is empty')
    if (sniff.reason === 'type-not-allowed') throw new ApiError(415, 'Profile picture must be a JPG, PNG or WebP image')
    throw new ApiError(415, 'The file content is not a valid image. The upload was rejected for security.')
  }

  // Target: self by default; admins may change any member's picture
  let targetId = user.id
  const requestedId = form.get('userId')
  if (typeof requestedId === 'string' && requestedId && requestedId !== user.id) {
    if (!isAdminRole(user)) throw new ApiError(403, 'Only the CEO can change another member\'s picture')
    const target = await db.user.findUnique({ where: { id: requestedId } })
    if (!target || (target.hidden && user.role !== 'SUPERADMIN')) throw new ApiError(404, 'Team member not found')
    targetId = target.id
  }
  const targetUser = await db.user.findUnique({ where: { id: targetId } })
  if (!targetUser) throw new ApiError(404, 'Team member not found')

  const avatarUrl = `/api/avatars/${targetId}?v=${Date.now()}`
  const updated = await db.user.update({
    where: { id: targetId },
    data: {
      avatarUrl,
      avatarData: buffer, // DB-stored (serverless-safe)
      avatarMime: sniff.mime,
    },
    select: { id: true, username: true, email: true, name: true, role: true, jobTitle: true, avatarUrl: true, mustChangePassword: true },
  })

  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'user',
    entityId: targetId,
    summary: `Profile picture updated for ${targetUser.name}${targetId !== user.id ? ' (by CEO)' : ''}`,
  })

  return Response.json({ user: updated })
})

// DELETE /api/profile/avatar — remove custom picture, fall back to the default avatar
export const DELETE = handler(async (req: Request) => {
  const user = await requireUser()
  const url = new URL(req.url)

  let targetId = user.id
  const requestedId = url.searchParams.get('userId')
  if (requestedId && requestedId !== user.id) {
    if (!isAdminRole(user)) throw new ApiError(403, 'Only the CEO can reset another member\'s picture')
    const target = await db.user.findUnique({ where: { id: requestedId } })
    if (!target || (target.hidden && user.role !== 'SUPERADMIN')) throw new ApiError(404, 'Team member not found')
    targetId = target.id
  }
  const targetUser = await db.user.findUnique({ where: { id: targetId } })
  if (!targetUser) throw new ApiError(404, 'Team member not found')

  await db.user.update({
    where: { id: targetId },
    data: { avatarData: null, avatarMime: null, avatarUrl: `/avatars/${targetUser.username}.png` },
  })
  const updated = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, email: true, name: true, role: true, jobTitle: true, avatarUrl: true, mustChangePassword: true },
  })

  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'user',
    entityId: targetId,
    summary: `Profile picture reset to default for ${targetUser.name}`,
  })

  return Response.json({ user: updated })
})
