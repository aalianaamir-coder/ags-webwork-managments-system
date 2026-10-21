import { db } from '@/lib/db'
import { handler, ApiError, requireUser } from '@/lib/permissions'
import { sanitize } from '@/lib/helpers'

/** Unified comments endpoint for orders, tasks, clients and maintenance tickets. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser()
  const b = await req.json().catch(() => ({}))
  const body = sanitize(b.body)
  if (!body) throw new ApiError(400, 'Comment cannot be empty')

  const orderId = sanitize(b.orderId)
  const taskId = sanitize(b.taskId)
  const clientId = sanitize(b.clientId)
  const ticketId = sanitize(b.ticketId)
  if (!orderId && !taskId && !clientId && !ticketId) throw new ApiError(400, 'A related record is required')

  // Access checks
  if (orderId) {
    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) throw new ApiError(404, 'Order not found')
    if (user.role === 'DEVELOPER' && order.developerId !== user.id && order.coordinatorId !== user.id) {
      throw new ApiError(403, 'You cannot comment on this order')
    }
  }
  if (taskId) {
    const task = await db.task.findUnique({ where: { id: taskId } })
    if (!task) throw new ApiError(404, 'Task not found')
    if (user.role === 'DEVELOPER' && task.assigneeId !== user.id) {
      throw new ApiError(403, 'You cannot comment on this task')
    }
  }

  const comment = await db.comment.create({
    data: { body, userId: user.id, orderId, taskId, clientId, ticketId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })
  return Response.json({ comment }, { status: 201 })
})
