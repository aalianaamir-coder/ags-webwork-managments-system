import { db } from '@/lib/db'
import { handler, ApiError, requireUser } from '@/lib/permissions'

type Params = { params: Promise<{ id: string }> }

/** Access-controlled download — content is served from the database, never /public. */
export const GET = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser()
  const { id } = await params
  const record = await db.fileRecord.findUnique({
    where: { id },
    include: { order: { select: { id: true, developerId: true, coordinatorId: true } } },
  })
  if (!record) throw new ApiError(404, 'File not found')

  if (user.role === 'DEVELOPER') {
    const own = record.uploadedById === user.id || (record.order && (record.order.developerId === user.id || record.order.coordinatorId === user.id))
    if (!own) throw new ApiError(403, 'You do not have access to this file')
  }

  if (!record.data) {
    throw new ApiError(410, 'File content is no longer available on the server')
  }
  const buffer = Buffer.from(record.data)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': record.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(record.fileName)}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
