'use client'

// AGS WEBWORKS — Attendance tracker with a GitHub-style contribution heatmap.
// Self check-in / check-out (Asia/Riyadh), streaks, team overview, admin manual marks.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, CalendarCheck, LogIn, LogOut, Flame, Clock, UserX, UserPlus, Timer,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { t } from '@/lib/i18n'
import { PageHeader, EntityDialog, StatusBadge } from '@/components/app/shared'

type AttRecord = {
  id: string
  date: string
  checkInAt: string | null
  checkOutAt: string | null
  status: string
  workedMinutes: number
  note: string | null
}

type TeamRow = {
  user: { id: string; name: string; role: string; jobTitle: string; avatarUrl?: string | null }
  today: AttRecord | null
  month: { present: number; late: number; absent: number; leave: number }
}

type AttResponse = {
  records: AttRecord[]
  today: AttRecord | null
  stats: {
    presentDays: number; lateDays: number; absentDays: number; leaveDays: number; halfDays: number
    avgMinutes: number; currentStreak: number; longestStreak: number; totalHours: number
  }
  team: TeamRow[]
  members: { id: string; name: string; role: string }[]
  canManage: boolean
  canViewTeam: boolean
  serverDate: string
}

const RIYADH_OFFSET = 3 * 60 * 60 * 1000

function riyadhTodayStr(): string {
  return new Date(Date.now() + RIYADH_OFFSET).toISOString().slice(0, 10)
}
function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' })
}
function fmtHM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
function fmtDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Heatmap cell class from a record (GitHub greens by hours; distinct hues for exceptions). */
function cellClass(r: AttRecord | undefined): string {
  if (!r) return 'hm-cell'
  if (r.status === 'LATE') return 'hm-cell hm-late'
  if (r.status === 'ABSENT') return 'hm-cell hm-absent'
  if (r.status === 'LEAVE') return 'hm-cell hm-leave'
  if (r.status === 'HALF_DAY') return 'hm-cell hm-half'
  const mins = r.workedMinutes
  const level = mins >= 480 ? 4 : mins >= 360 ? 3 : mins >= 180 ? 2 : 1
  return `hm-cell hm-p${level}`
}

function cellTitle(r: AttRecord | undefined, dateStr: string, lang: 'en' | 'ar'): string {
  const statusLabel = r
    ? t(lang, `att.${r.status.toLowerCase().replace('_', '')}` as 'att.present')
    : t(lang, 'att.noRecord')
  const hours = r && r.workedMinutes > 0 ? ` · ${fmtHM(r.workedMinutes)}` : ''
  return `${fmtDateLabel(dateStr)} — ${statusLabel}${hours}`
}

export default function AttendanceView() {
  const { user, lang, bumpData } = useApp()
  const { toast } = useToast()
  const [data, setData] = useState<AttResponse | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null) // null = self
  const [busy, setBusy] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [tick, setTick] = useState(0) // live timer refresh

  const load = useCallback(async (userId: string | null) => {
    try {
      const res = await api<AttResponse>(`/api/attendance${userId ? `?userId=${userId}` : ''}`)
      setData(res)
    } catch (err) {
      toast({ title: 'Failed to load attendance', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => { load(selectedUserId) }, [load, selectedUserId])

  // live "worked today" ticker
  useEffect(() => {
    const iv = setInterval(() => setTick((v) => v + 1), 30000)
    return () => clearInterval(iv)
  }, [])

  const today = data?.today ?? null
  const viewingSelf = !selectedUserId || selectedUserId === user?.id
  const stats = data?.stats

  const checkIn = async () => {
    setBusy(true)
    try {
      const res = await api<{ record: AttRecord; isLate: boolean }>('/api/attendance/check-in', { method: 'POST' })
      toast({ title: res.isLate ? 'Checked in — late' : 'Checked in', description: `Check-in time: ${fmtTime(res.record.checkInAt)} (Asia/Riyadh)` })
      load(selectedUserId)
      bumpData()
    } catch (err) {
      toast({ title: 'Check-in failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const checkOut = async () => {
    setBusy(true)
    try {
      const res = await api<{ record: AttRecord }>('/api/attendance/check-out', { method: 'POST' })
      toast({ title: 'Checked out', description: `${fmtHM(res.record.workedMinutes)} logged today` })
      load(selectedUserId)
      bumpData()
    } catch (err) {
      toast({ title: 'Check-out failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  // ---------- heatmap grid ----------
  const weeks = useMemo(() => {
    const todayStr = data?.serverDate ?? riyadhTodayStr()
    const endDow = new Date(`${todayStr}T00:00:00Z`).getUTCDay() // 0 = Sunday
    const lastSunday = addDaysStr(todayStr, -endDow)
    const startStr = addDaysStr(lastSunday, -7 * 52)
    const grid: { date: string; record?: AttRecord }[][] = []
    const byDate = new Map((data?.records ?? []).map((r) => [r.date, r]))
    const todayStr2 = todayStr
    for (let w = 0; w < 53; w++) {
      const week: { date: string; record?: AttRecord }[] = []
      for (let d = 0; d < 7; d++) {
        const date = addDaysStr(startStr, w * 7 + d)
        week.push({ date, record: date > todayStr2 ? undefined : byDate.get(date) })
      }
      grid.push(week)
    }
    return grid
  }, [data])

  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = []
    let prevMonth = -1
    weeks.forEach((week, i) => {
      const m = new Date(`${week[0].date}T00:00:00Z`).getUTCMonth()
      if (m !== prevMonth) {
        labels.push({ week: i, label: new Date(`${week[0].date}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) })
        prevMonth = m
      }
    })
    return labels
  }, [weeks])

  const dayLabels = useMemo(() => t(lang, 'att.dow').split(','), [lang])

  const recent = useMemo(() => [...(data?.records ?? [])].reverse().slice(0, 12), [data])

  // live worked minutes today (self view)
  const liveMinutes = useMemo(() => {
    void tick
    if (!today?.checkInAt) return 0
    const end = today.checkOutAt ? new Date(today.checkOutAt).getTime() : Date.now()
    return Math.max(0, Math.round((end - new Date(today.checkInAt).getTime()) / 60000))
  }, [today, tick])

  if (!data) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  const isMyToday = viewingSelf
  const todayStatusBadge = today ? <StatusBadge status={today.status.replace('_', ' ')} /> : null

  return (
    <div>
      <PageHeader
        title={t(lang, 'nav.attendance')}
        subtitle="Daily check-ins, streaks and team availability — Asia/Riyadh"
        actions={
          <>
            {data.canViewTeam && data.members.length > 0 && (
              <Select value={selectedUserId ?? 'me'} onValueChange={(v) => setSelectedUserId(v === 'me' ? null : v)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">{user?.name} (me)</SelectItem>
                  {data.members.filter((m) => m.id !== user?.id).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {data.canManage && (
              <Button variant="outline" size="sm" onClick={() => setMarkOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" />{t(lang, 'att.mark')}
              </Button>
            )}
          </>
        }
      />

      {/* Today + quick stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t(lang, 'att.today')}</p>
              <CalendarCheck className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold mt-2">{fmtDateLabel(data.serverDate)}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {todayStatusBadge}
              {isMyToday && today?.status === 'LATE' && <Badge variant="outline" className="text-[10px] border-[var(--chart-3)]/40 text-[var(--chart-3)]">after 09:30</Badge>}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t(lang, 'att.checkIn')}</p>
                <p className="text-sm font-medium mt-0.5 tabular-nums">{fmtTime(today?.checkInAt)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t(lang, 'att.checkOut')}</p>
                <p className="text-sm font-medium mt-0.5 tabular-nums">{fmtTime(today?.checkOutAt)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">{t(lang, 'att.workedToday')}</p>
                <p className="text-sm font-medium mt-0.5 tabular-nums">{today?.checkInAt ? fmtHM(liveMinutes) : '—'}</p>
              </div>
            </div>

            {isMyToday && (
              <div className="flex gap-2 mt-4">
                {!today?.checkInAt ? (
                  <Button size="sm" className="flex-1" onClick={checkIn} disabled={busy}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <LogIn className="w-4 h-4 mr-1.5" />}
                    {t(lang, 'att.checkIn')}
                  </Button>
                ) : !today?.checkOutAt ? (
                  <Button size="sm" variant="outline" className="flex-1" onClick={checkOut} disabled={busy}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <LogOut className="w-4 h-4 mr-1.5" />}
                    {t(lang, 'att.checkOut')}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 w-full justify-center py-1.5">
                    <Timer className="w-3.5 h-3.5" />{t(lang, 'att.dayComplete')} — {fmtHM(today.workedMinutes)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{t(lang, 'att.presentDays')}</p><CalendarCheck className="w-4 h-4 text-[var(--chart-2)]" /></div>
            <p className="text-2xl font-semibold mt-2">{stats?.presentDays ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t(lang, 'att.lastYear')}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{t(lang, 'att.currentStreak')}</p><Flame className="w-4 h-4 text-[var(--chart-3)]" /></div>
            <p className="text-2xl font-semibold mt-2">{stats?.currentStreak ?? 0}<span className="text-sm text-muted-foreground font-normal"> {t(lang, 'att.days')}</span></p>
            <p className="text-[11px] text-muted-foreground mt-1">{t(lang, 'att.longestStreak')}: {stats?.longestStreak ?? 0}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{t(lang, 'att.avgDay')}</p><Clock className="w-4 h-4 text-[var(--chart-1)]" /></div>
            <p className="text-2xl font-semibold mt-2">{stats?.avgMinutes ? fmtHM(stats.avgMinutes) : '—'}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t(lang, 'att.totalHours')}: {stats?.totalHours ?? 0}h</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">{t(lang, 'att.absentDays')}</p><UserX className="w-4 h-4 text-[var(--chart-5)]" /></div>
            <p className="text-2xl font-semibold mt-2">{stats?.absentDays ?? 0}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t(lang, 'att.leaveDays')}: {stats?.leaveDays ?? 0} · {t(lang, 'att.halfday')}: {stats?.halfDays ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Contribution heatmap */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{viewingSelf ? t(lang, 'att.activity') : `${t(lang, 'att.activity')} — ${data.members.find((m) => m.id === selectedUserId)?.name ?? ''}`}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto ag-scroll pb-2">
            <div className="min-w-[800px]">
              {/* month labels */}
              <div className="flex gap-[3px] mb-1.5 ps-8 relative h-4">
                {weeks.map((_, i) => {
                  const label = monthLabels.find((m) => m.week === i)
                  return (
                    <div key={i} className="w-[11px] shrink-0">
                      {label && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{label.label}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-[3px]">
                {/* weekday labels */}
                <div className="flex flex-col gap-[3px] w-8 shrink-0">
                  {dayLabels.map((d, i) => (
                    <div key={i} className="h-[11px] text-[9px] text-muted-foreground leading-[11px]">{i % 2 === 0 ? d.slice(0, 3) : ''}</div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {week.map((day) => (
                      <div
                        key={day.date}
                        className={cellClass(day.record)}
                        title={cellTitle(day.record, day.date, lang)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="hm-cell hm-p3 inline-block" /> {t(lang, 'att.present')}</span>
              <span className="flex items-center gap-1.5"><span className="hm-cell hm-late inline-block" /> {t(lang, 'att.late')}</span>
              <span className="flex items-center gap-1.5"><span className="hm-cell hm-half inline-block" /> {t(lang, 'att.halfday')}</span>
              <span className="flex items-center gap-1.5"><span className="hm-cell hm-leave inline-block" /> {t(lang, 'att.leave')}</span>
              <span className="flex items-center gap-1.5"><span className="hm-cell hm-absent inline-block" /> {t(lang, 'att.absent')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {t(lang, 'att.less')}
              <span className="hm-cell inline-block" />
              <span className="hm-cell hm-p1 inline-block" />
              <span className="hm-cell hm-p2 inline-block" />
              <span className="hm-cell hm-p3 inline-block" />
              <span className="hm-cell hm-p4 inline-block" />
              {t(lang, 'att.more')}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 mt-4 lg:grid-cols-2">
        {/* Recent records */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t(lang, 'att.recent')}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase">{t(lang, 'att.date')}</TableHead>
                  <TableHead className="text-[10px] uppercase">{t(lang, 'att.checkIn')}</TableHead>
                  <TableHead className="text-[10px] uppercase">{t(lang, 'att.checkOut')}</TableHead>
                  <TableHead className="text-[10px] uppercase">{t(lang, 'att.hours')}</TableHead>
                  <TableHead className="text-[10px] uppercase">{t(lang, 'common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">{t(lang, 'att.noRecordYet')}</TableCell></TableRow>
                )}
                {recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</TableCell>
                    <TableCell className="text-xs tabular-nums">{fmtTime(r.checkInAt)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{fmtTime(r.checkOutAt)}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.workedMinutes > 0 ? fmtHM(r.workedMinutes) : '—'}</TableCell>
                    <TableCell><StatusBadge status={r.status.replace('_', ' ')} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Team today (admin / accountant) */}
        {data.canViewTeam && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t(lang, 'att.teamToday')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">{t(lang, 'att.member')}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t(lang, 'common.status')}</TableHead>
                    <TableHead className="text-[10px] uppercase">{t(lang, 'att.hours')}</TableHead>
                    <TableHead className="text-[10px] uppercase text-end">{t(lang, 'att.month')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.team.map((row) => (
                    <TableRow key={row.user.id}>
                      <TableCell>
                        <button className="flex items-center gap-2 text-left hover:underline underline-offset-2" onClick={() => setSelectedUserId(row.user.id)}>
                          <Avatar className="w-6 h-6">
                            {row.user.avatarUrl ? <AvatarImage src={row.user.avatarUrl} alt={row.user.name} /> : null}
                            <AvatarFallback className="text-[9px]">{row.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium">{row.user.name}</span>
                        </button>
                      </TableCell>
                      <TableCell>{row.today ? <StatusBadge status={row.today.status.replace('_', ' ')} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.today && row.today.workedMinutes > 0 ? fmtHM(row.today.workedMinutes) : '—'}</TableCell>
                      <TableCell className="text-xs text-end text-muted-foreground">
                        {row.month.present}P · {row.month.late}L · {row.month.absent}A
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Admin manual mark dialog */}
      <MarkAttendanceDialog
        open={markOpen}
        onOpenChange={setMarkOpen}
        members={data.members}
        onDone={() => { load(selectedUserId); bumpData() }}
      />
    </div>
  )
}

function MarkAttendanceDialog({
  open, onOpenChange, members, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  members: { id: string; name: string; role: string }[]
  onDone: () => void
}) {
  const { toast } = useToast()
  const [userId, setUserId] = useState('')
  const [date, setDate] = useState(riyadhTodayStr())
  const [status, setStatus] = useState('PRESENT')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setUserId(members[0]?.id ?? '')
      setDate(riyadhTodayStr())
      setStatus('PRESENT')
      setNote('')
    }
  }, [open, members])

  const submit = async () => {
    setBusy(true)
    try {
      await api('/api/attendance', { method: 'POST', body: JSON.stringify({ userId, date, status, note: note || undefined }) })
      toast({ title: 'Attendance marked', description: `${members.find((m) => m.id === userId)?.name} — ${date} — ${status}` })
      onOpenChange(false)
      onDone()
    } catch (err) {
      toast({ title: 'Could not mark attendance', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <EntityDialog open={open} onOpenChange={onOpenChange} title="Mark attendance">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Team member</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} — {m.role}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} max={riyadhTodayStr()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENT">Present</SelectItem>
                <SelectItem value="LATE">Late</SelectItem>
                <SelectItem value="HALF_DAY">Half day</SelectItem>
                <SelectItem value="LEAVE">Leave</SelectItem>
                <SelectItem value="ABSENT">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Note (optional)</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. approved leave, sick day…" />
        </div>
        <Button className="w-full" onClick={submit} disabled={busy || !userId || !date}>
          {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Save record
        </Button>
        <p className="text-[11px] text-muted-foreground">Manual marks override the member&apos;s own check-in for that day. The action is recorded in the audit log.</p>
      </div>
    </EntityDialog>
  )
}
