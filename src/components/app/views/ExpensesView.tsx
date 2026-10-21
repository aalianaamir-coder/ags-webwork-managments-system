'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2, Trash2, Check, X, Banknote, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { api, fmtSAR, fmtDate, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { PageHeader, EmptyState, StatusBadge, EntityDialog, ConfirmDialog, StatCard } from '@/components/app/shared'

type Expense = {
  id: string; expenseCode: string; category: string; description: string; amount: number
  spentAt: string; vendor?: string | null; method?: string | null; reference?: string | null; notes?: string | null
  status: string; approvedAt?: string | null
  creator?: { id: string; name: string; avatarUrl?: string } | null
}

const emptyForm = { category: EXPENSE_CATEGORIES[0], description: '', amount: '', spentAt: new Date().toISOString().slice(0, 10), vendor: '', method: 'Bank Transfer', reference: '', notes: '' }

export default function ExpensesView() {
  const { user, dataVersion, bumpData } = useApp()
  const { toast } = useToast()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [totals, setTotals] = useState({ approved: 0, pending: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [catF, setCatF] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  const isAdmin = user?.role === 'ADMIN'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ expenses: Expense[]; totals: typeof totals }>(`/api/expenses${catF !== 'all' ? `?category=${encodeURIComponent(catF)}` : ''}`)
      setExpenses(res.expenses)
      setTotals(res.totals)
    } catch (err) {
      toast({ title: 'Failed to load expenses', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [catF, toast])
  useEffect(() => { load() }, [load, dataVersion])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return expenses
    return expenses.filter((e) => [e.expenseCode, e.description, e.vendor].some((v) => v?.toLowerCase().includes(term)))
  }, [expenses, q])

  const save = async () => {
    if (!form.description || !form.amount) { toast({ title: 'Description and amount are required', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await api('/api/expenses', { method: 'POST', body: JSON.stringify(form) })
      toast({ title: 'Expense recorded', description: 'Awaiting CEO approval.' })
      setDialogOpen(false)
      setForm({ ...emptyForm })
      bumpData()
    } catch (err) {
      toast({ title: 'Could not save expense', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const approve = async (e: Expense, decision: 'Approved' | 'Rejected') => {
    try {
      await api(`/api/expenses/${e.id}/approve`, { method: 'POST', body: JSON.stringify({ decision }) })
      toast({ title: `Expense ${decision.toLowerCase()}` })
      bumpData()
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' }).catch(() => api(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' }))
      toast({ title: 'Expense deleted' }); setDeleteTarget(null); bumpData()
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader
        title="Expenses & Profit"
        subtitle="Business expenses require CEO approval before counting toward profit"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><a href="/api/reports/export?type=expenses" download><Download className="w-4 h-4 mr-1.5" />Export</a></Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="brand-gradient-bg text-white"><Plus className="w-4 h-4 mr-1.5" />Record expense</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Approved expenses" value={fmtSAR(totals.approved, { compact: true })} icon={<Banknote className="w-5 h-5" />} accent="rose" />
        <StatCard label="Pending approval" value={fmtSAR(totals.pending, { compact: true })} icon={<Banknote className="w-5 h-5" />} accent="amber" delay={0.05} />
        <StatCard label="Rejected" value={fmtSAR(totals.rejected, { compact: true })} icon={<X className="w-5 h-5" />} accent="cyan" delay={0.1} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search expenses…" className="pl-9" />
        </div>
        <Select value={catF} onValueChange={setCatF}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No expenses recorded" hint="Hosting, marketing, tools and other operating costs appear here." icon={<Banknote className="w-7 h-7" />} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden lg:table-cell">By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="text-xs font-semibold max-w-52 truncate">{e.description}</p>
                      <p className="text-[10px] text-muted-foreground">{e.expenseCode}{e.vendor ? ` · ${e.vendor}` : ''}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{e.category}</TableCell>
                    <TableCell className="text-xs font-bold text-rose-500">−{fmtSAR(e.amount)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{fmtDate(e.spentAt)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{e.creator?.name ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {isAdmin && e.status === 'Pending' && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" onClick={() => approve(e, 'Approved')} aria-label="Approve"><Check className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => approve(e, 'Rejected')} aria-label="Reject"><X className="w-4 h-4" /></Button>
                          </>
                        )}
                        {isAdmin && <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setDeleteTarget(e)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Record business expense">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount (SAR) *</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Description *</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Domain renewal for client website" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.spentAt} onChange={(e) => setForm({ ...form, spentAt: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Namecheap" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payment method</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="brand-gradient-bg text-white">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Record expense</Button>
        </div>
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.expenseCode}?`}
        description="This permanently removes the expense record."
        onConfirm={doDelete} confirmLabel="Delete" busy={busy}
      />
    </div>
  )
}
