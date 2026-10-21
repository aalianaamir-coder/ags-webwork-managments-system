'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2, Trash2, Receipt, FileDown, Eye, Wallet, ArrowDownUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { api, fmtSAR, fmtDate, PAYMENT_METHODS, INVOICE_STATUSES, SERVICE_TYPES } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { PageHeader, EmptyState, StatusBadge, EntityDialog, ConfirmDialog, StatCard } from '@/components/app/shared'
import { InvoiceDocument, InvoiceActions, type InvoiceDoc } from '@/components/app/InvoiceDocument'

type Payment = {
  id: string; paymentCode: string; amount: number; direction: string; category: string; method: string
  reference?: string | null; notes?: string | null; receivedAt: string; orderId?: string | null; invoiceId?: string | null
  client: { id: string; businessName: string; clientCode: string }
  order?: { id: string; orderCode: string; serviceType: string } | null
}
type Invoice = {
  id: string; invoiceCode: string; issueDate: string; dueDate: string; status: string
  subtotal: number; taxRate: number; taxAmount: number; total: number; amountPaid: number
  notes?: string | null; terms?: string | null; orderId?: string | null
  client: { id: string; businessName: string; clientCode: string; contactPerson?: string | null; phone?: string | null; email?: string | null; location?: string | null; city?: string | null }
  order?: { id: string; orderCode: string; serviceType: string } | null
  items: { id: string; description: string; quantity: number; unitPrice: number; amount: number }[]
}
type ClientOpt = { id: string; businessName: string; clientCode: string }
type OrderOpt = { id: string; orderCode: string; serviceType: string; agreedPrice: number; clientId: string }

export default function PaymentsView() {
  const { dataVersion, bumpData } = useApp()

  return (
    <div>
      <PageHeader title="Payments & Invoices" subtitle="Record payments, generate invoices and track outstanding balances" />
      <Tabs defaultValue="payments">
        <TabsList><TabsTrigger value="payments"><Wallet className="w-4 h-4 mr-1.5" />Payments</TabsTrigger><TabsTrigger value="invoices"><Receipt className="w-4 h-4 mr-1.5" />Invoices</TabsTrigger></TabsList>
        <TabsContent value="payments"><PaymentsTab dataVersion={dataVersion} bumpData={bumpData} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab dataVersion={dataVersion} bumpData={bumpData} /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------- Payments ---------------- */
function PaymentsTab({ dataVersion, bumpData }: { dataVersion: number; bumpData: () => void }) {
  const { user } = useApp()
  const { toast } = useToast()
  const [payments, setPayments] = useState<Payment[]>([])
  const [totals, setTotals] = useState({ received: 0, refunded: 0 })
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [orders, setOrders] = useState<OrderOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null)

  const [form, setForm] = useState({
    clientId: '', orderId: '', amount: '', direction: 'in', category: 'Project Payment',
    method: 'Bank Transfer', reference: '', notes: '', receivedAt: new Date().toISOString().slice(0, 10),
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ payments: Payment[]; totals: { received: number; refunded: number } }>('/api/payments')
      setPayments(res.payments)
      setTotals(res.totals)
      const [c, o] = await Promise.all([
        api<{ clients: ClientOpt[] }>('/api/clients'),
        api<{ orders: OrderOpt[] }>('/api/orders'),
      ])
      setClients(c.clients)
      setOrders(o.orders)
    } catch (err) {
      toast({ title: 'Failed to load payments', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { load() }, [load, dataVersion])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return payments
    return payments.filter((p) => [p.paymentCode, p.client.businessName, p.reference, p.order?.orderCode].some((v) => v?.toLowerCase().includes(term)))
  }, [payments, q])

  const save = async () => {
    if (!form.clientId) { toast({ title: 'Select a client', variant: 'destructive' }); return }
    if (!form.amount || Number(form.amount) <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await api('/api/payments', { method: 'POST', body: JSON.stringify(form) })
      toast({ title: 'Payment recorded', description: `${fmtSAR(Number(form.amount))} from ${clients.find((c) => c.id === form.clientId)?.businessName}` })
      setDialogOpen(false)
      setForm({ ...form, clientId: '', orderId: '', amount: '', reference: '', notes: '' })
      bumpData()
    } catch (err) {
      toast({ title: 'Could not record payment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api(`/api/payments/${deleteTarget.id}`, { method: 'DELETE' })
      toast({ title: 'Payment deleted' }); setDeleteTarget(null); bumpData()
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const canDelete = user?.role === 'ADMIN'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total received" value={fmtSAR(totals.received, { compact: true })} icon={<Wallet className="w-5 h-5" />} accent="emerald" />
        <StatCard label="Refunds" value={fmtSAR(totals.refunded, { compact: true })} icon={<ArrowDownUp className="w-5 h-5" />} accent="rose" delay={0.05} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payments…" className="pl-9" />
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="brand-gradient-bg text-white"><Plus className="w-4 h-4 mr-1.5" /> Record payment</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No payments recorded" hint="Record the first payment received from a client." icon={<Wallet className="w-7 h-7" />} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Order</TableHead>
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="text-xs font-bold">{p.paymentCode}</p>
                      <p className="text-[10px] text-muted-foreground">{p.category}</p>
                    </TableCell>
                    <TableCell className="text-xs">{p.client.businessName}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.order?.orderCode ?? '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{p.method}{p.reference ? ` · ${p.reference}` : ''}</TableCell>
                    <TableCell className="text-xs">{fmtDate(p.receivedAt)}</TableCell>
                    <TableCell className={`text-xs font-bold ${p.direction === 'in' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {p.direction === 'in' ? '+' : '−'}{fmtSAR(p.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setDeleteTarget(p)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Record a payment">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Client *</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v, orderId: '' })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.businessName} ({c.clientCode})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Related order (optional)</Label>
              <Select value={form.orderId || 'none'} onValueChange={(v) => setForm({ ...form, orderId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="No specific order" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific order</SelectItem>
                  {orders.filter((o) => !form.clientId || o.clientId === form.clientId).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.orderCode} — {o.serviceType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (SAR) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Payment received</SelectItem>
                  <SelectItem value="out">Refund sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Project Payment', 'Advance Payment', 'Final Payment', 'Maintenance Subscription', 'Hosting', 'Other'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment method</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference number</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Bank transfer ref…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date received</Label>
              <Input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="brand-gradient-bg text-white">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Record payment</Button>
        </div>
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete payment ${deleteTarget?.paymentCode}?`}
        description="This removes the transaction and recalculates linked invoices and order balances."
        onConfirm={doDelete} confirmLabel="Delete" busy={busy}
      />
    </div>
  )
}

/* ---------------- Invoices ---------------- */
function InvoicesTab({ dataVersion, bumpData }: { dataVersion: number; bumpData: () => void }) {
  const { user } = useApp()
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [orders, setOrders] = useState<OrderOpt[]>([])
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<Invoice | null>(null)
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', method: 'Bank Transfer', reference: '' })

  const [form, setForm] = useState({
    clientId: '', orderId: '', dueDate: '', notes: '',
    items: [{ description: '', quantity: '1', unitPrice: '' }] as { description: string; quantity: string; unitPrice: string }[],
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inv, c, o, s] = await Promise.all([
        api<{ invoices: Invoice[] }>('/api/invoices'),
        api<{ clients: ClientOpt[] }>('/api/clients'),
        api<{ orders: OrderOpt[] }>('/api/orders'),
        api<{ settings: Record<string, unknown> }>('/api/settings'),
      ])
      setInvoices(inv.invoices)
      setClients(c.clients)
      setOrders(o.orders)
      setSettings(s.settings)
    } catch (err) {
      toast({ title: 'Failed to load invoices', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { load() }, [load, dataVersion])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return invoices
    return invoices.filter((i) => [i.invoiceCode, i.client.businessName, i.order?.orderCode].some((v) => v?.toLowerCase().includes(term)))
  }, [invoices, q])

  const addItem = () => setForm({ ...form, items: [...form.items, { description: '', quantity: '1', unitPrice: '' }] })
  const setItem = (i: number, k: 'description' | 'quantity' | 'unitPrice', v: string) => {
    const items = [...form.items]
    items[i] = { ...items[i], [k]: v }
    setForm({ ...form, items })
  }

  const save = async () => {
    if (!form.clientId) { toast({ title: 'Select a client', variant: 'destructive' }); return }
    const items = form.items.filter((it) => it.description && it.unitPrice)
    if (!items.length) { toast({ title: 'Add at least one line item', variant: 'destructive' }); return }
    setBusy(true)
    try {
      await api('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          clientId: form.clientId, orderId: form.orderId, dueDate: form.dueDate, notes: form.notes,
          items: items.map((it) => ({ description: it.description, quantity: Number(it.quantity) || 1, unitPrice: Number(it.unitPrice) })),
        }),
      })
      toast({ title: 'Invoice created' })
      setDialogOpen(false)
      setForm({ clientId: '', orderId: '', dueDate: '', notes: '', items: [{ description: '', quantity: '1', unitPrice: '' }] })
      bumpData()
    } catch (err) {
      toast({ title: 'Could not create invoice', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const markStatus = async (inv: Invoice, status: string) => {
    try {
      await api(`/api/invoices/${inv.id}`, { method: 'PUT', body: JSON.stringify({ status }) })
      toast({ title: `${inv.invoiceCode} → ${status}` })
      bumpData()
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  const recordInvoicePayment = async () => {
    if (!payInvoice || !payForm.amount) return
    setBusy(true)
    try {
      await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          clientId: payInvoice.client.id, orderId: payInvoice.orderId ?? '', invoiceId: payInvoice.id,
          amount: payForm.amount, method: payForm.method, reference: payForm.reference,
          category: 'Invoice Payment', receivedAt: new Date().toISOString().slice(0, 10),
        }),
      })
      toast({ title: 'Payment recorded against invoice' })
      setPayInvoice(null); setPayForm({ amount: '', method: 'Bank Transfer', reference: '' })
      bumpData()
    } catch (err) {
      toast({ title: 'Could not record payment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  // prefill from order
  const fromOrder = (orderId: string) => {
    const o = orders.find((x) => x.id === orderId)
    if (o) {
      setForm({
        ...form, orderId, clientId: o.clientId,
        items: [{ description: `${o.serviceType} — ${o.orderCode}`, quantity: '1', unitPrice: String(o.agreedPrice) }],
      })
    } else {
      setForm({ ...form, orderId: '' })
    }
  }

  const docFor = (inv: Invoice): InvoiceDoc => ({
    kind: 'project',
    invoiceCode: inv.invoiceCode,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    clientName: inv.client.businessName,
    clientContact: inv.client.contactPerson,
    clientPhone: inv.client.phone,
    clientEmail: inv.client.email,
    clientLocation: [inv.client.location, inv.client.city].filter(Boolean).join(', '),
    items: inv.items.map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.amount })),
    subtotal: inv.subtotal,
    taxRate: inv.taxRate,
    taxAmount: inv.taxAmount,
    total: inv.total,
    amountPaid: inv.amountPaid,
    notes: inv.notes,
    terms: inv.terms,
    preparedBy: user ? { name: user.name, role: user.jobTitle, avatarUrl: user.avatarUrl ?? null } : null,
    settings: settings as InvoiceDoc['settings'],
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoices…" className="pl-9" />
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="brand-gradient-bg text-white"><Plus className="w-4 h-4 mr-1.5" /> Create invoice</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No invoices yet" hint="Create an invoice for a client order or service." icon={<Receipt className="w-7 h-7" />} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden md:table-cell">Due</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <p className="text-xs font-bold">{inv.invoiceCode}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtDate(inv.issueDate)}</p>
                    </TableCell>
                    <TableCell className="text-xs">{inv.client.businessName}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs">{fmtDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-xs font-semibold">{fmtSAR(inv.total)}</TableCell>
                    <TableCell className="text-xs text-emerald-500">{fmtSAR(inv.amountPaid)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewing(inv)} aria-label="View"><Eye className="w-3.5 h-3.5" /></Button>
                        {['Issued', 'Partially Paid', 'Overdue'].includes(inv.status) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" title="Record payment" onClick={() => setPayInvoice(inv)}><Wallet className="w-3.5 h-3.5" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Create invoice */}
      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Create invoice" wide>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Prefill from order</Label>
              <Select value={form.orderId || 'none'} onValueChange={fromOrder}>
                <SelectTrigger><SelectValue placeholder="Manual invoice" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manual (no order)</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode} — {o.serviceType} ({fmtSAR(o.agreedPrice)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Client *</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.businessName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Line items *</Label>
            {form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-6" placeholder="Description (e.g. Business website development)" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                <Input className="col-span-2" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
                <Input className="col-span-3" type="number" placeholder="Unit price" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
                <Button variant="ghost" size="icon" className="col-span-1 text-rose-500" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })} aria-label="Remove line"><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1.5" />Add line</Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            VAT is applied automatically if enabled in Settings (currently {settings?.vatEnabled ? `${settings.vatRate}%` : 'disabled'}).
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="brand-gradient-bg text-white">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Create invoice</Button>
        </div>
      </EntityDialog>

      {/* View invoice (document) */}
      <EntityDialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)} title={`Invoice ${viewing?.invoiceCode ?? ''}`}>
        {viewing && (
          <div className="space-y-3">
            <InvoiceActions doc={docFor(viewing)} />
            <div className="overflow-x-auto -mx-2 px-2">
              <InvoiceDocument doc={docFor(viewing)} />
            </div>
            <div className="flex flex-wrap gap-2 no-print pt-2">
              {['Issued', 'Overdue', 'Void'].map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => markStatus(viewing, s)}>Mark {s}</Button>
              ))}
            </div>
          </div>
        )}
      </EntityDialog>

      {/* Record payment against invoice */}
      <EntityDialog open={!!payInvoice} onOpenChange={(v) => !v && setPayInvoice(null)} title={`Record payment — ${payInvoice?.invoiceCode ?? ''}`}>
        {payInvoice && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Total {fmtSAR(payInvoice.total)} · already paid {fmtSAR(payInvoice.amountPaid)} · balance <b className="text-amber-500">{fmtSAR(payInvoice.total - payInvoice.amountPaid)}</b>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount (SAR)</Label>
                <Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Reference</Label>
                <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayInvoice(null)}>Cancel</Button>
              <Button onClick={recordInvoicePayment} disabled={busy} className="brand-gradient-bg text-white">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Record payment</Button>
            </div>
          </div>
        )}
      </EntityDialog>
    </div>
  )
}
