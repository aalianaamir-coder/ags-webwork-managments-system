'use client'

import { useEffect, useState } from 'react'
import {
  Users, UserPlus, FolderKanban, CheckCircle2, Wallet, AlertTriangle, TrendingUp, CalendarClock,
  Loader2, Activity, ListChecks, Bug, Wrench, Receipt, Banknote, Clock, ExternalLink, Link2, Plus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatCard, EmptyState, StatusBadge } from '@/components/app/shared'
import { api, fmtSAR, fmtDate, timeAgo, daysUntil } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { t } from '@/lib/i18n'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type Dash = Record<string, unknown> & {
  role: string
  stats: Record<string, number>
}

export default function DashboardView() {
  const { user, lang, dataVersion, setView } = useApp()
  const [data, setData] = useState<Dash | null>(null)
  const [revenueSeries, setRevenueSeries] = useState<{ month: string; revenue: number; expenses: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api<Dash>('/api/dashboard')
        if (!cancelled) setData(res)
        // revenue chart for admin/accountant — reuse reports endpoint lightly
        if (res.role === 'ADMIN') {
          try {
            const rep = await api<{ revenueByMonth: { month: string; value: number }[]; expensesByMonth: { month: string; value: number }[] }>('/api/reports')
            const merged = rep.revenueByMonth.map((r, i) => ({ month: r.month, revenue: r.value, expenses: rep.expensesByMonth[i]?.value ?? 0 }))
            if (!cancelled) setRevenueSeries(merged.slice(-12))
          } catch { /* optional */ }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [dataVersion])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    )
  }
  if (!data || !user) return <EmptyState title="Dashboard unavailable" hint="Please refresh the page." />

  const s = data.stats
  const tr = (k: 'dash.welcome' | 'dash.totalClients') => t(lang, k)

  return (
    <div className="space-y-5">
      {/* Greeting — clean and professional */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <p className="text-xs text-muted-foreground">{tr('dash.welcome')}</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-0.5">{user.name} <span className="text-muted-foreground font-normal text-base">· {user.jobTitle}</span></h1>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Asia/Riyadh
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setView('clients' as never)}><UserPlus className="w-4 h-4 mr-1.5" />Add client</Button>
          <Button size="sm" variant="outline" onClick={() => setView('orders' as never)}><Plus className="w-4 h-4 mr-1.5" />Create order</Button>
          <Button size="sm" onClick={() => setView('tasks' as never)}><ListChecks className="w-4 h-4 mr-1.5" />New task</Button>
        </div>
      </div>

      {data.role === 'ADMIN' && <AdminDashboard data={data} revenueSeries={revenueSeries} setView={setView} lang={lang} />}
      {data.role === 'DEVELOPER' && <DeveloperDashboard data={data} setView={setView} />}
      {data.role === 'ACCOUNTANT' && <AccountantDashboard data={data} setView={setView} />}
    </div>
  )
}

/* ---------------- CEO (Sharjeel) ---------------- */
function AdminDashboard({ data, revenueSeries, setView, lang }: { data: Dash; revenueSeries: { month: string; revenue: number; expenses: number }[]; setView: (v: never) => void; lang: 'en' | 'ar' }) {
  const s = data.stats
  const deadlines = (data.approachingDeadlines ?? []) as { id: string; code: string; client: string; service: string; deadline: string; priority: string; overdue: boolean }[]
  const workload = (data.teamWorkload ?? []) as { id: string; name: string; avatarUrl?: string; role: string; jobTitle: string; openOrders: number; openTasks: number; overdueTasks: number }[]
  const activity = (data.recentActivity ?? []) as { id: string; summary: string; createdAt: string; user?: { name: string; avatarUrl?: string } }[]
  const maint = (data.maintenance ?? {}) as Record<string, number | { id: string; client: string; date: string; fee: number; status: string }[]>

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard label={t(lang, 'dash.totalClients')} value={s.totalClients} hint={`${s.newLeads} new leads`} icon={<Users className="w-5 h-5" />} delay={0} />
        <StatCard label={t(lang, 'dash.activeProjects')} value={s.activeProjects} hint={`${s.completedProjects} completed`} icon={<FolderKanban className="w-5 h-5" />} accent="cyan" delay={0.05} />
        <StatCard label={t(lang, 'dash.paymentsMonth')} value={fmtSAR(s.paymentsThisMonth, { compact: true })} icon={<Wallet className="w-5 h-5" />} accent="emerald" delay={0.1} />
        <StatCard label={t(lang, 'dash.outstanding')} value={fmtSAR(s.totalOutstanding, { compact: true })} icon={<AlertTriangle className="w-5 h-5" />} accent="amber" delay={0.15} />
        <StatCard label={t(lang, 'dash.expenses')} value={fmtSAR(s.totalExpenses, { compact: true })} hint={`${s.pendingExpenseApprovals} pending approval`} icon={<Banknote className="w-5 h-5" />} accent="rose" delay={0.2} />
        <StatCard label={t(lang, 'dash.netProfit')} value={fmtSAR(s.netProfit, { compact: true })} icon={<TrendingUp className="w-5 h-5" />} accent="emerald" delay={0.25} />
        <StatCard label={t(lang, 'maint.mrr')} value={fmtSAR(maint.mrr as number, { compact: true })} hint={`${maint.activeClients} active clients`} icon={<Wrench className="w-5 h-5" />} accent="violet" delay={0.3} />
        <StatCard label={t(lang, 'maint.openTickets')} value={maint.openTickets as number} hint={`${maint.overdueSubs} overdue subs`} icon={<Bug className="w-5 h-5" />} accent="amber" delay={0.35} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue vs Expenses — last 12 months</CardTitle></CardHeader>
          <CardContent>
            {revenueSeries.length === 0 ? (
              <EmptyState title="No financial data yet" hint="Revenue appears as soon as you record payments." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueSeries}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtSAR(v)} contentStyle={{ borderRadius: 8, fontSize: 12, background: 'var(--popover)', border: '1px solid var(--border)', color: 'var(--popover-foreground)' }} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#rev)" name="Revenue received" />
                    <Area type="monotone" dataKey="expenses" stroke="var(--chart-4)" strokeWidth={2} fill="url(#exp)" name="Expenses" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-500" /> {t(lang, 'dash.deadlines')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto ag-scroll">
            {deadlines.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No deadlines in the next 7 days.</p>}
            {deadlines.map((d) => {
              const days = daysUntil(d.deadline)
              return (
                <button key={d.id} onClick={() => setView('orders' as never)} className="w-full text-left rounded-xl border p-2.5 hover:bg-accent transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{d.code} · {d.client}</p>
                    <StatusBadge status={d.overdue ? 'Overdue' : 'Active'} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtDate(d.deadline)} {days !== null && <span className={d.overdue ? 'text-rose-500 font-semibold' : 'text-amber-500'}>({d.overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`})</span>}
                  </p>
                </button>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> {t(lang, 'dash.teamWorkload')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {workload.map((m) => {
              const total = m.openOrders + m.openTasks
              const max = Math.max(...workload.map((w) => w.openOrders + w.openTasks), 1)
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar className="w-9 h-9 ring-2 ring-primary/20">
                    {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt={m.name} /> : null}
                    <AvatarFallback className="text-xs">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{m.name} <span className="text-muted-foreground font-normal">· {m.jobTitle}</span></p>
                      <p className="text-[11px] text-muted-foreground shrink-0">{m.openOrders} projects · {m.openTasks} tasks {m.overdueTasks > 0 && <span className="text-rose-500 font-semibold">({m.overdueTasks} overdue)</span>}</p>
                    </div>
                    <Progress value={(total / max) * 100} className="h-1.5 mt-1.5" />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> {t(lang, 'dash.recentActivity')}</CardTitle></CardHeader>
          <CardContent className="max-h-64 overflow-y-auto ag-scroll space-y-1">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 py-1.5 border-b last:border-0">
                {a.user?.avatarUrl ? (
                   
                  <img src={a.user.avatarUrl} alt={a.user.name} className="w-6 h-6 rounded-full mt-0.5" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-muted mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-xs">{a.summary}</p>
                  <p className="text-[10px] text-muted-foreground">{a.user?.name} · {timeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

/* ---------------- Developer (Gufran) ---------------- */
function DeveloperDashboard({ data, setView }: { data: Dash; setView: (v: never) => void }) {
  const s = data.stats
  const myProjects = (data.myProjects ?? []) as { id: string; code: string; service: string; client: string; status: string; priority: string; internalDeadline: string | null }[]
  const deadlines = (data.upcomingDeadlines ?? []) as { id: string; code: string; title: string; deadline: string; status: string; overdue: boolean }[]
  const recent = (data.recentlyAssigned ?? []) as { id: string; code: string; service: string; client: string; status: string }[]

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="My Projects" value={s.myActiveProjects} hint={`${s.myCompletedProjects} completed`} icon={<FolderKanban className="w-5 h-5" />} />
        <StatCard label="Tasks In Progress" value={s.tasksInProgress} hint={`${s.tasksTodo} to do`} icon={<ListChecks className="w-5 h-5" />} accent="cyan" delay={0.05} />
        <StatCard label="Awaiting Review" value={s.awaitingReview} icon={<Clock className="w-5 h-5" />} accent="violet" delay={0.1} />
        <StatCard label="Overdue Tasks" value={s.overdueTasks} icon={<AlertTriangle className="w-5 h-5" />} accent={s.overdueTasks > 0 ? 'rose' : 'emerald'} delay={0.15} />
        <StatCard label="Maintenance Tickets" value={s.maintenanceTickets} icon={<Wrench className="w-5 h-5" />} accent="amber" delay={0.2} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setView('orders' as never)}><FolderKanban className="w-4 h-4 mr-2" /> Update project status</Button>
        <Button variant="outline" onClick={() => setView('orders' as never)}><Link2 className="w-4 h-4 mr-2" /> Add website links</Button>
        <Button variant="outline" onClick={() => setView('maintenance' as never)}><Wrench className="w-4 h-4 mr-2" /> Maintenance tickets</Button>
        <Button variant="outline" onClick={() => setView('tasks' as never)}><ListChecks className="w-4 h-4 mr-2" /> My tasks</Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">My assigned projects</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto ag-scroll">
            {myProjects.length === 0 && <EmptyState title="No active projects" hint="Projects assigned to you will appear here." icon={<FolderKanban className="w-7 h-7" />} />}
            {myProjects.map((p) => {
              const days = daysUntil(p.internalDeadline)
              return (
                <button key={p.id} onClick={() => setView('orders' as never)} className="w-full text-left rounded-xl border p-3 hover:bg-accent transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{p.code}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.service} · {p.client}</p>
                  {p.internalDeadline && (
                    <p className={`text-[11px] mt-1 ${days !== null && days < 0 ? 'text-rose-500 font-semibold' : 'text-muted-foreground'}`}>
                      Internal deadline: {fmtDate(p.internalDeadline)}{days !== null && days >= 0 ? ` (in ${days}d)` : days !== null ? ` (${Math.abs(days)}d overdue)` : ''}
                    </p>
                  )}
                </button>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Upcoming task deadlines</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-44 overflow-y-auto ag-scroll">
              {deadlines.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No upcoming deadlines.</p>}
              {deadlines.map((d) => (
                <div key={d.id} className={`rounded-xl border p-2.5 ${d.overdue ? 'border-rose-500/40 bg-rose-500/5' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{d.title}</p>
                    <StatusBadge status={d.overdue ? 'Overdue' : d.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{d.code} · due {fmtDate(d.deadline)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recently assigned</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-44 overflow-y-auto ag-scroll">
              {recent.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">Nothing new in the last 14 days.</p>}
              {recent.map((r) => (
                <button key={r.id} onClick={() => setView('orders' as never)} className="w-full text-left rounded-xl border p-2.5 hover:bg-accent">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">{r.code} · {r.client}</p>
                    <StatusBadge status={r.status} />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

/* ---------------- Accountant (Addan) ---------------- */
function AccountantDashboard({ data, setView }: { data: Dash; setView: (v: never) => void }) {
  const s = data.stats
  const awaiting = (data.ordersAwaitingTracking ?? []) as { id: string; code: string; service: string; client: string; status: string; deliveryDate: string | null; balance: number; overdue: boolean }[]
  const closure = (data.ordersAwaitingClosure ?? []) as { id: string; code: string; client: string; balance: number }[]
  const recent = (data.recentPayments ?? []) as { id: string; code: string; client: string; amount: number; direction: string; method: string; receivedAt: string }[]
  const maint = (data.maintenance ?? {}) as Record<string, number | { id: string; client: string; date: string; fee: number; status: string }[]>
  const billing = (maint.upcomingBilling ?? []) as { id: string; client: string; date: string; fee: number; status: string }[]

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Payments Received (month)" value={fmtSAR(s.paymentsReceivedMonth, { compact: true })} icon={<Wallet className="w-5 h-5" />} accent="emerald" />
        <StatCard label="Pending Payments" value={fmtSAR(s.pendingPayments, { compact: true })} icon={<AlertTriangle className="w-5 h-5" />} accent="amber" delay={0.05} />
        <StatCard label="Overdue Invoices" value={s.overdueInvoices} icon={<Receipt className="w-5 h-5" />} accent="rose" delay={0.1} />
        <StatCard label="Month Net (rev − exp)" value={fmtSAR(s.monthNet, { compact: true })} icon={<TrendingUp className="w-5 h-5" />} accent="emerald" delay={0.15} />
        <StatCard label="Monthly Expenses" value={fmtSAR(s.monthExpenses, { compact: true })} hint={`${s.pendingExpenseApprovals} awaiting CEO approval`} icon={<Banknote className="w-5 h-5" />} accent="rose" delay={0.2} />
        <StatCard label="Maintenance MRR" value={fmtSAR(maint.mrr as number, { compact: true })} hint={`${maint.activeClients} active subs`} icon={<Wrench className="w-5 h-5" />} accent="violet" delay={0.25} />
        <StatCard label="Maint. Outstanding" value={fmtSAR(maint.outstandingInvoices as number, { compact: true })} icon={<Receipt className="w-5 h-5" />} accent="amber" delay={0.3} />
        <StatCard label="Maint. Tickets Open" value={maint.openTickets as number} icon={<Bug className="w-5 h-5" />} accent="cyan" delay={0.35} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setView('payments' as never)}><Receipt className="w-4 h-4 mr-2" /> Record payment</Button>
        <Button variant="outline" onClick={() => setView('payments' as never)}><Receipt className="w-4 h-4 mr-2" /> Create invoice</Button>
        <Button variant="outline" onClick={() => setView('maintenance' as never)}><Wrench className="w-4 h-4 mr-2" /> Maintenance billing</Button>
        <Button variant="outline" onClick={() => setView('reports' as never)}><ExternalLink className="w-4 h-4 mr-2" /> Reports</Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Orders awaiting tracking</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto ag-scroll">
            {awaiting.length === 0 && <EmptyState title="No pending orders" hint="Active orders appear here for coordination." />}
            {awaiting.map((o) => (
              <button key={o.id} onClick={() => setView('orders' as never)} className={`w-full text-left rounded-xl border p-3 hover:bg-accent transition-colors ${o.overdue ? 'border-rose-500/40 bg-rose-500/5' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold truncate">{o.code} · {o.client}</p>
                  <StatusBadge status={o.overdue ? 'Overdue' : o.status} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {o.service} · delivery {fmtDate(o.deliveryDate)} · balance {fmtSAR(o.balance)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Upcoming maintenance billing</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-40 overflow-y-auto ag-scroll">
              {billing.length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">No billing due in the next 7 days.</p>}
              {billing.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{b.client}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtDate(b.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold">{fmtSAR(b.fee)}</p>
                    <StatusBadge status={b.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recent transactions</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-40 overflow-y-auto ag-scroll">
              {recent.length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">No payments recorded yet.</p>}
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 border-b last:border-0 py-1.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{r.client}</p>
                    <p className="text-[10px] text-muted-foreground">{r.code} · {r.method} · {timeAgo(r.receivedAt)}</p>
                  </div>
                  <p className={`text-xs font-bold shrink-0 ${r.direction === 'in' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {r.direction === 'in' ? '+' : '−'}{fmtSAR(r.amount, { compact: true })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          {closure.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Delivered — awaiting payment closure</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 max-h-36 overflow-y-auto ag-scroll">
                {closure.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-xs border-b last:border-0 py-1.5">
                    <span className="truncate">{c.code} · {c.client}</span>
                    <span className="font-semibold text-amber-500 shrink-0">{fmtSAR(c.balance)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
