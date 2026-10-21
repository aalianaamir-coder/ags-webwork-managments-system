import { db } from '@/lib/db'
import { handler, ApiError, requireUser, can } from '@/lib/permissions'
import { logActivity, sanitize, parseDateSafe } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

export const GET = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser()
  const { id } = await params
  const ticket = await db.maintenanceTicket.findUnique({
    where: { id },
    include: {
      client: true,
      subscription: { include: { plan: true } },
      order: { select: { id: true, orderCode: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      comments: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      files: true,
    },
  })
  if (!ticket) throw new ApiError(404, 'Ticket not found')
  if (user.role === 'DEVELOPER' && ticket.assigneeId !== user.id) {
    throw new ApiError(403, 'This ticket is not assigned to you')
  }
  return Response.json({ ticket })
})

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requireUser()
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const existing = await db.maintenanceTicket.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Ticket not found')

  const isCoordinator = can(user, 'tickets:write')
  const isAssignee = existing.assigneeId === user.id
  if (!isCoordinator && !isAssignee) throw new ApiError(403, 'You can only update tickets assigned to you')

  const data: Record<string, unknown> = {}
  if ('status' in b) {
    const status = sanitize(b.status)
    if (!status || !['New', 'In Progress', 'Waiting for Client', 'Completed', 'Closed'].includes(status)) {
      throw new ApiError(400, 'Invalid ticket status')
    }
    data.status = status
    if (status === 'Completed') data.completedAt = new Date()
    if (status === 'Closed') data.closedAt = new Date()
  }
  if ('priority' in b && isCoordinator) data.priority = sanitize(b.priority) ?? existing.priority
  if ('workPerformed' in b) data.workPerformed = sanitize(b.workPerformed)
  if ('expectedCompletion' in b) data.expectedCompletion = parseDateSafe(b.expectedCompletion)
  if ('outOfScope' in b && isCoordinator) data.outOfScope = Boolean(b.outOfScope)
  if ('assigneeId' in b && isCoordinator) data.assigneeId = sanitize(b.assigneeId)

  const ticket = await db.maintenanceTicket.update({ where: { id }, data })
  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'ticket',
    entityId: id,
    summary: `Maintenance ticket updated: ${ticket.ticketCode}${existing.status !== ticket.status ? ` (${existing.status} → ${ticket.status})` : ''}`,
  })
  return Response.json({ ticket })
})

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requireUser()
  if (!can(user, 'tickets:write')) throw new ApiError(403, 'Only the CEO and accountant can delete maintenance tickets')
  const { id } = await params
  const existing = await db.maintenanceTicket.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Ticket not found')
  await db.maintenanceTicket.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'ticket',
    entityId: id,
    summary: `Maintenance ticket deleted: ${existing.ticketCode}`,
  })
  return Response.json({ ok: true })
})
