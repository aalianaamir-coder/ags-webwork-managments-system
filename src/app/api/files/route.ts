import { db } from '@/lib/db'
import { handler, ApiError, requirePermission, requireUser } from '@/lib/permissions'
import { logActivity, sanitize } from '@/lib/helpers'
import { sniffContent } from '@/lib/file-validation'
import crypto from 'crypto'

// Serverless-safe limit: Vercel caps request bodies at ~4.5 MB, so business
// files are limited to 4 MB and stored IN the database (FileRecord.data).
const MAX_SIZE = 4 * 1024 * 1024 // 4 MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown', 'application/json',
  'video/mp4', 'audio/mpeg', 'audio/wav',
]

export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const clientId = sanitize(url.searchParams.get('clientId'))
  const orderId = sanitize(url.searchParams.get('orderId'))
  const category = sanitize(url.searchParams.get('category'))

  let files = await db.fileRecord.findMany({
    where: {
      AND: [clientId ? { clientId } : {}, orderId ? { orderId } : {}, category ? { category } : {}],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      uploader: { select: { id: true, name: true, avatarUrl: true } },
      client: { select: { id: true, businessName: true, clientCode: true } },
      order: { select: { id: true, orderCode: true } },
    },
  })

  // Developers only see files linked to their assigned orders or their own uploads
  if (user.role === 'DEVELOPER') {
    const myOrders = await db.order.findMany({ where: { OR: [{ developerId: user.id }, { coordinatorId: user.id }] }, select: { id: true } })
    const orderIds = new Set(myOrders.map((o) => o.id))
    files = files.filter((f) => (f.orderId && orderIds.has(f.orderId)) || f.uploadedById === user.id)
  }
  return Response.json({ files })
})

export const POST = handler(async (req: Request) => {
  const user = await requirePermission('files:write')
  const form = await req.formData().catch(() => null)
  if (!form) throw new ApiError(400, 'Multipart form data required')

  const file = form.get('file')
  if (!(file instanceof File)) throw new ApiError(400, 'No file provided')
  if (file.size > MAX_SIZE) throw new ApiError(413, 'File is larger than the 4 MB limit')

  const category = sanitize(form.get('category')) ?? 'Project Document'
  const clientId = sanitize(form.get('clientId'))
  const orderId = sanitize(form.get('orderId'))
  const taskId = sanitize(form.get('taskId'))

  // Content-based validation: sniff magic bytes instead of trusting the
  // client-declared MIME type (a renamed .exe claiming image/png is rejected).
  const buffer = Buffer.from(await file.arrayBuffer())
  const sniff = sniffContent(buffer, file.type || '', ALLOWED_TYPES)
  if (!sniff.ok) {
    if (sniff.reason === 'empty') throw new ApiError(400, 'The uploaded file is empty')
    if (sniff.reason === 'type-not-allowed') throw new ApiError(415, `File type “${file.type || 'unknown'}” is not allowed`)
    throw new ApiError(415, `File content does not match its type (detected: ${sniff.detected ?? 'unknown'}). The upload was rejected for security.`)
  }

  // Developers can only attach files to their assigned orders/tasks
  if (user.role === 'DEVELOPER' && orderId) {
    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order || (order.developerId !== user.id && order.coordinatorId !== user.id)) {
      throw new ApiError(403, 'You can only attach files to projects assigned to you')
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`

  const record = await db.fileRecord.create({
    data: {
      fileName: file.name,
      filePath: storedName, // storage key (metadata only — content lives in `data`)
      data: buffer, // DB-stored content: private, persistent, serverless-safe
      category,
      clientId,
      orderId,
      taskId,
      uploadedById: user.id,
      // store the SNIFFED type, not the client-declared one
      mimeType: sniff.mime,
      size: buffer.length,
    },
  })
  await logActivity({
    userId: user.id,
    action: 'upload',
    entity: 'file',
    entityId: record.id,
    summary: `File uploaded: ${file.name} (${(file.size / 1024).toFixed(0)} KB) — ${category}`,
  })
  return Response.json({ file: record }, { status: 201 })
})
