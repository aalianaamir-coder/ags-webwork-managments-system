import { db } from '@/lib/db'
import { handler, ApiError, requirePermission, isSuperAdmin } from '@/lib/permissions'
import { logActivity, sanitize, riyadhToday, addDaysStr, ATTENDANCE_STATUSES } from '@/lib/helpers'

// GET /api/attendance — heatmap records + today + stats (+ team overview for ADMIN/ACCOUNTANT)
// Query: userId (optional — viewing another member requires ADMIN/ACCOUNTANT), days (default 371)
export const GET = handler(async (req: Request) => {
  const user = await requirePermission('attendance:read')
  const url = new URL(req.url)
  const canViewTeam = isSuperAdmin(user) || user.role === 'ADMIN' || user.role === 'ACCOUNTANT'

  let targetId = user.id
  const requestedId = sanitize(url.searchParams.get('userId'))
  if (requestedId && requestedId !== user.id) {
    if (!canViewTeam) throw new ApiError(403, 'You can only view your own attendance')
    const target = await db.user.findUnique({ where: { id: requestedId } })
    if (!target) throw new ApiError(404, 'Team member not found')
    targetId = target.id
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '371', 10) || 371, 31), 731)
  const today = riyadhToday()
  const from = addDaysStr(today, -(days - 1))

  const records = await db.attendanceRecord.findMany({
    where: { userId: targetId, date: { gte: from } },
    orderBy: { date: 'asc' },
  })

  const todayRecord = records.find((r) => r.date === today) ?? null

  // ---- stats over the fetched window ----
  const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
  const worked = records.filter((r) => r.workedMinutes > 0)
  const avgMinutes = worked.length
    ? Math.round(worked.reduce((s, r) => s + r.workedMinutes, 0) / worked.length)
    : 0

  // streaks count consecutive days with PRESENT/LATE/HALF_DAY
  const activeDays = new Set(records.filter((r) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(r.status)).map((r) => r.date))
  let currentStreak = 0
  let cursor = activeDays.has(today) ? today : addDaysStr(today, -1)
  while (activeDays.has(cursor)) { currentStreak++; cursor = addDaysStr(cursor, -1) }
  let longestStreak = 0
  let run = 0
  let prev: string | null = null
  for (const d of [...activeDays].sort()) {
    run = prev && addDaysStr(prev, 1) === d ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    prev = d
  }

  const stats = {
    presentDays: present.length,
    lateDays: records.filter((r) => r.status === 'LATE').length,
    absentDays: records.filter((r) => r.status === 'ABSENT').length,
    leaveDays: records.filter((r) => r.status === 'LEAVE').length,
    halfDays: records.filter((r) => r.status === 'HALF_DAY').length,
    avgMinutes,
    currentStreak,
    longestStreak,
    totalHours: Math.round(records.reduce((s, r) => s + r.workedMinutes, 0) / 6) / 10,
  }

  // ---- team overview + member list (ADMIN / ACCOUNTANT) ----
  let team: unknown[] = []
  let members: unknown[] = []
  if (canViewTeam) {
    const users = await db.user.findMany({
      // hidden (system) accounts are never part of the attendance team view
      where: { isActive: true, hidden: false },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, jobTitle: true, avatarUrl: true },
    })
    members = users
    const allRecent = await db.attendanceRecord.findMany({
      where: { date: { gte: addDaysStr(today, -62) } },
    })
    const byUser = new Map<string, typeof allRecent>()
    for (const r of allRecent) {
      const list = byUser.get(r.userId) ?? []
      list.push(r)
      byUser.set(r.userId, list)
    }
    const monthPrefix = today.slice(0, 7)
    team = users.map((u) => {
      const list = byUser.get(u.id) ?? []
      const month = list.filter((r) => r.date.startsWith(monthPrefix))
      return {
        user: u,
        today: list.find((r) => r.date === today) ?? null,
        month: {
          present: month.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length,
          late: month.filter((r) => r.status === 'LATE').length,
          absent: month.filter((r) => r.status === 'ABSENT').length,
          leave: month.filter((r) => r.status === 'LEAVE').length,
        },
      }
    })
  }

  return Response.json({
    records,
    today: todayRecord,
    stats,
    team,
    members,
    canManage: isSuperAdmin(user) || user.role === 'ADMIN',
    canViewTeam,
    serverDate: today,
  })
})

// POST /api/attendance — admin manual mark/upsert for a member and date
export const POST = handler(async (req: Request) => {
  const user = await requirePermission('attendance:manage')
  const body = await req.json().catch(() => null)
  if (!body) throw new ApiError(400, 'Invalid request body')

  const userId = sanitize(body.userId)
  const date = sanitize(body.date)
  const status = sanitize(body.status)?.toUpperCase()
  const note = sanitize(body.note)

  if (!userId || !date) throw new ApiError(400, 'Team member and date are required')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'Date must be YYYY-MM-DD')
  if (date > riyadhToday()) throw new ApiError(400, 'Cannot mark attendance for a future date')
  if (!status || !ATTENDANCE_STATUSES.includes(status as (typeof ATTENDANCE_STATUSES)[number])) {
    throw new ApiError(400, `Status must be one of ${ATTENDANCE_STATUSES.join(', ')}`)
  }

  const target = await db.user.findUnique({ where: { id: userId } })
  if (!target) throw new ApiError(404, 'Team member not found')

  const record = await db.attendanceRecord.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, status, note },
    update: { status, note },
  })

  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'attendance',
    entityId: record.id,
    summary: `Attendance marked for ${target.name} on ${date}: ${status}${note ? ` — ${note}` : ''}`,
  })

  return Response.json({ record })
})

// DELETE /api/attendance?userId=&date= — admin clears a manual mark
export const DELETE = handler(async (req: Request) => {
  const user = await requirePermission('attendance:manage')
  const url = new URL(req.url)
  const userId = sanitize(url.searchParams.get('userId'))
  const date = sanitize(url.searchParams.get('date'))
  if (!userId || !date) throw new ApiError(400, 'userId and date are required')

  const existing = await db.attendanceRecord.findUnique({ where: { userId_date: { userId, date } } })
  if (!existing) throw new ApiError(404, 'No attendance record for that day')
  await db.attendanceRecord.delete({ where: { id: existing.id } })

  await logActivity({
    userId: user.id,
    action: 'delete',
    entity: 'attendance',
    entityId: existing.id,
    summary: `Attendance record cleared for ${date}`,
  })
  return Response.json({ ok: true })
})
