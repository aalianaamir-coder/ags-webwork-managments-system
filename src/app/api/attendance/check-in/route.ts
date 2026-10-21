import { db } from '@/lib/db'
import { handler, ApiError, requirePermission } from '@/lib/permissions'
import { logActivity, riyadhToday, riyadhMinutesOfDay } from '@/lib/helpers'

const LATE_AFTER_MINUTES = 9 * 60 + 30 // 09:30 Asia/Riyadh

// POST /api/attendance/check-in — self check-in for today (Asia/Riyadh)
export const POST = handler(async () => {
  const user = await requirePermission('attendance:read')
  const today = riyadhToday()
  const now = new Date()
  const isLate = riyadhMinutesOfDay(now) > LATE_AFTER_MINUTES
  const status = isLate ? 'LATE' : 'PRESENT'

  const existing = await db.attendanceRecord.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  })

  if (existing?.checkInAt) {
    throw new ApiError(409, `You already checked in today at ${new Date(existing.checkInAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' })}`)
  }

  const record = await db.attendanceRecord.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    create: { userId: user.id, date: today, checkInAt: now, status },
    update: { checkInAt: now, status, updatedAt: now },
  })

  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'attendance',
    entityId: record.id,
    summary: `${user.name} checked in${isLate ? ' (late)' : ''}`,
  })

  return Response.json({ record, isLate })
})
