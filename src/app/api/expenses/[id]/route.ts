import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity } from '@/lib/helpers'

type Params = { params: Promise<{ id: string }> }

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission('expenses:delete')
  const { id } = await params
  const existing = await db.expense.findUnique({ where: { id } })
  if (!existing) throw new ApiError(404, 'Expense not found')
  await db.expense.delete({ where: { id } })
  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'expense',
    entityId: id,
    summary: `Expense deleted: ${existing.expenseCode} — SAR ${existing.amount.toFixed(2)}`,
  })
  return Response.json({ ok: true })
})
