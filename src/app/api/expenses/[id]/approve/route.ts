import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

/** CEO approves / rejects a recorded expense. */
export const POST = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission('expenses:approve')
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const decision = String(b.decision ?? '')
  if (!['Approved', 'Rejected'].includes(decision)) throw new ApiError(400, 'Decision must be Approved or Rejected')

  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Expense not found')
  if (existing.status !== 'Pending') throw new ApiError(409, `This expense is already ${existing.status.toLowerCase()}`)

  const expense = await db.expense.update({
    where: { id },
    data: { status: decision, approvedById: user.id, approvedAt: new Date() },
  })
  await logActivity({
    userId: user.id,
    action: decision === 'Approved' ? 'approve' : 'reject',
    entity: 'expense',
    entityId: id,
    summary: `Expense ${expense.expenseCode} ${decision.toLowerCase()} by ${user.name} (SAR ${expense.amount.toFixed(2)})`,
  })
  if (existing.createdById && existing.createdById !== user.id) {
    await db.notification.create({
      data: {
        userId: existing.createdById,
        title: `Expense ${decision.toLowerCase()}`,
        body: `${expense.expenseCode} — SAR ${expense.amount.toFixed(2)} was ${decision.toLowerCase()} by ${user.name}.`,
        type: 'alert',
        link: 'expenses',
      },
    })
  }
  return Response.json({ expense })
})
