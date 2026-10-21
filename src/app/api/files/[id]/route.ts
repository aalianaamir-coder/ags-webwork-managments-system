import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity } from '@/lib/helpers'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'db', 'uploads')

type Params = { params: Promise<{ id: string }> }

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission('files:delete')
  const { id } = await params
  const record = await db.fileRecord.findUnique({ where: { id } })
  if (!record) throw new ApiError(404, 'File not found')

  await db.fileRecord.delete({ where: { id } })
  await unlink(path.join(UPLOAD_DIR, record.filePath)).catch(() => {}) // storage cleanup, ignore if missing
  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'file',
    entityId: id,
    summary: `File deleted: ${record.fileName}`,
  })
  return Response.json({ ok: true })
})
