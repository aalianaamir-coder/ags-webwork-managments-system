'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Download, BarChart3, TrendingUp, Wallet, Users, Target, Wrench, Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts'
import { api, fmtSAR } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { PageHeader, StatCard, EmptyState } from '@/components/app/shared'

type Report = {
  salesByMonth: { month: string; value: number; count: number }[]
  revenueByMonth: { month: string; value: number }[]
  expensesByMonth: { month: string; value: number }[]
  profitByMonth: { month: string; value: number }[]
  ordersByStatus: { status: string; count: number }[]
  deliveryPerformance: { delivered: number; onTime: number; late: number; overdueActive: number }
  clientsAcquiredByMonth: { month: string; value: number }[]
  leadFunnel: { stage: string; count: number }[]
  conversionRate: number
  serviceRevenue: { service: string; amount: number }[]
  workload: { id: string; name: string; avatarUrl?: string; assigned: number; coordinating: number; tasks: number; tickets: number }[]
  maintenance: { mrr: number; collected: number; outstanding: number; activeCount: number; cancelledCount: number; planSplit: { plan: string; count: number }[]; monthlyRevenue: { month: string; value: number }[] }
  summary: { totalSales: number; totalRevenueReceived: number; totalExpenses: number; netProfit: number; ordersCount: number; clientsAcquired: number }
}

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-5)', '#d29922', '#a371f7', '#58a6ff']

export default function ReportsView() {
  const { dataVersion } = useApp()
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() - 11, 1).toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [exportType, setExportType] = useState('orders')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<Report>(`/api/reports?from=${from}&to=${to}`)
      setData(res)
    } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load, dataVersion])

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  if (!data) return <EmptyState title="Reports unavailable" />

  const s = data.summary
  const hasData = data.revenueByMonth.some((m) => m.value !== 0) || data.salesByMonth.some((m) => m.value !== 0)

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Sales, revenue, profit, clients and maintenance performance"
        actions={
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/reports/export?type=${exportType}&from=${from}&to=${to}`} download>
              <Download className="w-4 h-4 mr-1.5" />Export CSV
            </a>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col sm:flex-row items-end gap-3">
          <div className="space-y-1 flex-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1 flex-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1 flex-1">
            <Label className="text-xs"><Filter className="w-3 h-3 inline mr-1" />Export dataset</Label>
            <Select value={exportType} onValueChange={setExportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clients">Clients</SelectItem>
                <SelectItem value="orders">Orders</SelectItem>
                <SelectItem value="payments">Payments</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
                <SelectItem value="maintenance-subscriptions">Maintenance subscriptions</SelectItem>
                <SelectItem value="maintenance-invoices">Maintenance invoices</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} size="sm"><BarChart3 className="w-4 h-4 mr-1.5" />Apply</Button>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <StatCard label="Total sales value" value={fmtSAR(s.totalSales, { compact: true })} hint={`${s.ordersCount} orders`} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard label="Revenue received" value={fmtSAR(s.totalRevenueReceived, { compact: true })} icon={<Wallet className="w-5 h-5" />} accent="emerald" delay={0.05} />
        <StatCard label="Expenses (approved)" value={fmtSAR(s.totalExpenses, { compact: true })} icon={<Wallet className="w-5 h-5" />} accent="rose" delay={0.1} />
        <StatCard label="Net profit" value={fmtSAR(s.netProfit, { compact: true })} icon={<TrendingUp className="w-5 h-5" />} accent={s.netProfit >= 0 ? 'emerald' : 'rose'} delay={0.15} />
        <StatCard label="Clients acquired" value={s.clientsAcquired} icon={<Users className="w-5 h-5" />} accent="cyan" delay={0.2} />
        <StatCard label="Lead conversion" value={`${data.conversionRate}%`} icon={<Target className="w-5 h-5" />} accent="violet" delay={0.25} />
      </div>

      {!hasData ? (
        <EmptyState title="No data in this range yet" hint="Add clients, orders and payments — reports build themselves from your real records." icon={<BarChart3 className="w-7 h-7" />} />
      ) : (
        <div className="space-y-4">
          {/* Revenue / expenses / profit */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Revenue, expenses &amp; profit</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.revenueByMonth.map((r, i) => ({ month: r.month, revenue: r.value, expenses: data.expensesByMonth[i]?.value ?? 0, profit: data.profitByMonth[i]?.value ?? 0 }))}>
                    <defs>
                      <linearGradient id="r1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} /></linearGradient>
                      <linearGradient id="r2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.26} /><stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} /></linearGradient>
                      <linearGradient id="r3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12b886" stopOpacity={0.32} /><stop offset="100%" stopColor="#12b886" stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => fmtSAR(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#r1)" />
                    <Area type="monotone" dataKey="expenses" stroke="var(--chart-4)" strokeWidth={2} fill="url(#r2)" />
                    <Area type="monotone" dataKey="profit" stroke="#12b886" strokeWidth={2} fill="url(#r3)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Orders by status */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Orders by status</CardTitle></CardHeader>
              <CardContent>
                {data.ordersByStatus.length === 0 ? <p className="text-xs text-muted-foreground text-center py-10">No orders yet.</p> : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.ordersByStatus} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} stroke="currentColor" opacity={0.4} />
                        <YAxis type="category" dataKey="status" width={130} tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} />
                        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                          {data.ordersByStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Revenue by service */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by service category</CardTitle></CardHeader>
              <CardContent>
                {data.serviceRevenue.length === 0 ? <p className="text-xs text-muted-foreground text-center py-10">No payments recorded yet.</p> : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.serviceRevenue} dataKey="amount" nameKey="service" innerRadius={50} outerRadius={85} paddingAngle={3}>
                          {data.serviceRevenue.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtSAR(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lead funnel */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Lead funnel &amp; conversion</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.leadFunnel}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                      <XAxis dataKey="stage" tick={{ fontSize: 9 }} stroke="currentColor" opacity={0.5} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="currentColor" opacity={0.4} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--chart-1)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">Lead → client conversion: <b className="text-primary">{data.conversionRate}%</b> · On-time delivery: <b className="text-emerald-500">{data.deliveryPerformance.delivered ? Math.round((data.deliveryPerformance.onTime / data.deliveryPerformance.delivered) * 100) : 0}%</b> ({data.deliveryPerformance.onTime}/{data.deliveryPerformance.delivered})</p>
              </CardContent>
            </Card>

            {/* Clients acquired */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Clients acquired</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.clientsAcquiredByMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.4} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} stroke="currentColor" opacity={0.4} />
                      <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-1)' }} name="Clients" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Maintenance reports */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" />Maintenance performance</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-uppercase">Subscription health</p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-muted p-3"><p className="text-lg font-bold text-emerald-500">{data.maintenance.activeCount}</p><p className="text-[10px] text-muted-foreground">Active</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-lg font-bold text-rose-500">{data.maintenance.cancelledCount}</p><p className="text-[10px] text-muted-foreground">Cancelled</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-lg font-bold">{fmtSAR(data.maintenance.mrr, { compact: true })}</p><p className="text-[10px] text-muted-foreground">MRR</p></div>
                  <div className="rounded-xl bg-muted p-3"><p className="text-lg font-bold text-amber-500">{fmtSAR(data.maintenance.outstanding, { compact: true })}</p><p className="text-[10px] text-muted-foreground">Outstanding</p></div>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  {data.maintenance.planSplit.map((p, i) => (
                    <span key={p.plan} className="text-[11px] rounded-full px-2.5 py-1 border" style={{ color: PIE_COLORS[i % PIE_COLORS.length], borderColor: `${PIE_COLORS[i % PIE_COLORS.length]}55` }}>
                      {p.plan}: {p.count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Maintenance revenue collected (monthly)</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.maintenance.monthlyRevenue}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.4} />
                      <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.4} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => fmtSAR(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--chart-4)" name="Collected" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workload */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Workload by team member</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto ag-scroll">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Member</th>
                      <th className="text-center py-2">Dev projects</th>
                      <th className="text-center py-2">Coordinating</th>
                      <th className="text-center py-2">Open tasks</th>
                      <th className="text-center py-2">Maint. tickets</th>
                      <th className="text-center py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workload.map((w) => (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className="py-2.5 flex items-center gap-2">
                          {w.avatarUrl ? (
                             
                            <img src={w.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                          ) : <div className="w-6 h-6 rounded-full bg-muted" />}
                          {w.name}
                        </td>
                        <td className="text-center">{w.assigned}</td>
                        <td className="text-center">{w.coordinating}</td>
                        <td className="text-center">{w.tasks}</td>
                        <td className="text-center">{w.tickets}</td>
                        <td className="text-center font-bold">{w.assigned + w.coordinating + w.tasks + w.tickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
