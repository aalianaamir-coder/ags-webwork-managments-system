import { db } from '@/lib/db'
import { handler, requireUser } from '@/lib/permissions'

// GET /api/avatars/[userId] — serve an uploaded profile picture (any signed-in team member).
// Bytes come from the database (User.avatarData) so avatars survive serverless
// redeploys and never touch the filesystem.
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  await requireUser()
  const { userId } = await params

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { username: true, avatarData: true, avatarMime: true },
  })

  if (user?.avatarData) {
    const buffer = Buffer.from(user.avatarData)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': user.avatarMime || 'image/png',
        'Cache-Control': 'private, max-age=60',
        'Content-Length': String(buffer.length),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // No custom upload — fall back to the default generated avatar
  if (user) {
    return Response.redirect(new URL(`/avatars/${user.username}.png`, _req.url), 302)
  }
  return new Response('Not found', { status: 404 })
})
