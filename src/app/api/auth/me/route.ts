import { getSessionUser } from '@/lib/auth'
import { handler } from '@/lib/permissions'

export const GET = handler(async () => {
  const user = await getSessionUser()
  if (!user) return Response.json({ user: null }, { status: 200 })
  return Response.json({ user })
})
