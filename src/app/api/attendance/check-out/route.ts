import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, riyadhToday } from '@/lib/helpers'

// POST /api/attendance/check-out — self check-out for today (Asia/Riyadh)
export const POST = handler(async () => {
  const user = await requirePermission('attendance:read')
  const today = riyadhToday()
  const now = new Date()

  const existing = await db.attendanceRecord.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  })

  if (!existing || !existing.checkInAt) {
    throw new ApiError(400, 'You have not checked in yet today')
  }
  if (existing.checkOutAt) {
    throw new ApiError(409, `You already checked out today at ${new Date(existing.checkOutAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' })}`)
  }

  const workedMinutes = Math.max(0, Math.round((now.getTime() - new Date(existing.checkInAt).getTime()) / 60000))
  const record = await db.attendanceRecord.update({
    where: { id: existing.id },
    data: { checkOutAt: now, workedMinutes, updatedAt: now },
  })

  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'attendance',
    entityId: record.id,
    summary: `${user.name} checked out — ${(workedMinutes / 60).toFixed(1)}h logged`,
  })

  return Response.json({ record })
})
