import { db } from '@/lib/db'
import { handler, ApiError, requireUser, can } from '@/lib/permissions'
import { logActivity, notify, parseDateSafe, sanitize } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

export const GET = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser()
  const { id } = await params
  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true, role: true } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      client: { select: { id: true, businessName: true, clientCode: true, phone: true, whatsapp: true } },
      order: { select: { id: true, orderCode: true, serviceType: true, status: true } },
      comments: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      files: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!task) throw new ApiError(404, 'Task not found')
  if (user.role === 'DEVELOPER' && task.assigneeId !== user.id) {
    throw new ApiError(403, 'This task is not assigned to you')
  }
  return Response.json({ task })
})

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requireUser()
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Task not found')

  const isFullEdit = can(user, 'tasks:write')
  const isAssignee = existing.assigneeId === user.id
  if (!isFullEdit && !isAssignee) throw new ApiError(403, 'You can only update tasks assigned to you')

  const data: Record<string, unknown> = {}
  if (isFullEdit) {
    if ('title' in b) data.title = sanitize(b.title) ?? existing.title
    if ('description' in b) data.description = sanitize(b.description)
    if ('clientId' in b) data.clientId = sanitize(b.clientId)
    if ('orderId' in b) data.orderId = sanitize(b.orderId)
    if ('assigneeId' in b) data.assigneeId = sanitize(b.assigneeId)
    if ('priority' in b) data.priority = sanitize(b.priority) ?? existing.priority
    if ('startDate' in b) data.startDate = parseDateSafe(b.startDate)
    if ('deadline' in b) data.deadline = parseDateSafe(b.deadline)
    if ('status' in b) data.status = sanitize(b.status) ?? existing.status
  } else {
    // assignee: status only
    if ('status' in b) data.status = sanitize(b.status) ?? existing.status
    if ('description' in b && !existing.description) data.description = sanitize(b.description)
  }

  if (data.status === 'Completed' && existing.status !== 'Completed') {
    data.completedAt = new Date()
  }
  const task = await db.task.update({ where: { id }, data })

  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'task',
    entityId: id,
    summary: `Task updated: ${task.taskCode}${existing.status !== task.status ? ` (${existing.status} → ${task.status})` : ''}`,
  })
  if (data.assigneeId && data.assigneeId !== existing.assigneeId) {
    await notify({
      userId: String(data.assigneeId),
      title: 'New task assigned to you',
      body: `${task.taskCode} — ${task.title}.`,
      type: 'task',
      link: 'tasks',
    })
  }
  // Task completed — notify the creator
  if (existing.status !== 'Completed' && task.status === 'Completed' && task.creatorId && task.creatorId !== user.id) {
    await notify({
      userId: task.creatorId,
      title: 'Task completed',
      body: `${task.taskCode} — ${task.title} was marked completed by ${user.name}.`,
      type: 'task',
      link: 'tasks',
    })
  }
  return Response.json({ task })
})

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser()
  if (!can(user, 'tasks:delete')) throw new ApiError(403, 'Only the CEO can delete tasks')
  const { id } = await params
  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Task not found')
  await db.task.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'task',
    entityId: id,
    summary: `Task deleted: ${existing.taskCode} — ${existing.title}`,
  })
  return Response.json({ ok: true })
})
