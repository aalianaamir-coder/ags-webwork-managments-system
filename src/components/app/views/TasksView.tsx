'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Loader2, Pencil, Trash2, ListChecks, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { api, fmtDate, daysUntil, PRIORITIES, TASK_STATUSES } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { PageHeader, EmptyState, StatusBadge, EntityDialog, ConfirmDialog, CommentThread, type CommentItem } from '@/components/app/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type Task = {
  id: string; taskCode: string; title: string; description?: string | null
  clientId?: string | null; orderId?: string | null; assigneeId?: string | null; creatorId?: string | null
  priority: string; startDate?: string | null; deadline?: string | null; status: string; completedAt?: string | null
  createdAt: string
  assignee?: { id: string; name: string; avatarUrl?: string } | null
  creator?: { id: string; name: string } | null
  client?: { id: string; businessName: string } | null
  order?: { id: string; orderCode: string; serviceType: string } | null
  _count?: { comments: number; files: number }
}
type Opt = { id: string; label: string }

const emptyForm = { title: '', description: '', clientId: '', orderId: '', assigneeId: '', priority: 'Medium', startDate: '', deadline: '', status: 'To Do' }

export default function TasksView() {
  const { user, dataVersion, bumpData } = useApp()
  const { toast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Opt[]>([])
  const [orders, setOrders] = useState<Opt[]>([])
  const [team, setTeam] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [mine, setMine] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [detail, setDetail] = useState<Task | null>(null)

  const isDev = user?.role === 'DEVELOPER'
  const canWrite = user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ tasks: Task[] }>(`/api/tasks${mine && !isDev ? '?mine=true' : ''}`)
      setTasks(res.tasks)
      if (canWrite) {
        const [c, o, t] = await Promise.all([
          api<{ clients: { id: string; businessName: string; clientCode: string }[] }>('/api/clients'),
          api<{ orders: { id: string; orderCode: string; serviceType: string }[] }>('/api/orders'),
          api<{ users: { id: string; name: string; role: string }[] }>('/api/team'),
        ])
        setClients(c.clients.map((x) => ({ id: x.id, label: `${x.businessName} (${x.clientCode})` })))
        setOrders(o.orders.map((x) => ({ id: x.id, label: `${x.orderCode} — ${x.serviceType}` })))
        setTeam(t.users.map((x) => ({ id: x.id, label: `${x.name} — ${x.role}` })))
      }
    } catch (err) {
      toast({ title: 'Failed to load tasks', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [mine, isDev, canWrite, toast])

  useEffect(() => { load() }, [load, dataVersion])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (statusF !== 'all' && t.status !== statusF) return false
      if (!term) return true
      return [t.taskCode, t.title, t.description, t.client?.businessName, t.order?.orderCode].some((v) => v?.toLowerCase().includes(term))
    })
  }, [tasks, q, statusF])

  const overdueTasks = tasks.filter((t) => ['To Do', 'In Progress', 'Waiting', 'Review'].includes(t.status) && t.deadline && new Date(t.deadline) < new Date())

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true) }
  const openEdit = (t: Task) => {
    setEditing(t)
    setForm({
      title: t.title, description: t.description ?? '', clientId: t.clientId ?? '', orderId: t.orderId ?? '',
      assigneeId: t.assigneeId ?? '', priority: t.priority,
      startDate: t.startDate?.slice(0, 10) ?? '', deadline: t.deadline?.slice(0, 10) ?? '', status: t.status,
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Task title is required', variant: 'destructive' }); return }
    setBusy(true)
    try {
      if (editing) await api(`/api/tasks/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      else await api('/api/tasks', { method: 'POST', body: JSON.stringify(form) })
      toast({ title: editing ? 'Task updated' : 'Task created' })
      setDialogOpen(false); bumpData()
    } catch (err) {
      toast({ title: 'Could not save task', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api(`/api/tasks/${deleteTarget.id}`, { method: 'DELETE' })
      toast({ title: 'Task deleted' }); setDeleteTarget(null); setDetail(null); bumpData()
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const completeTask = async (t: Task) => {
    try {
      await api(`/api/tasks/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: 'Completed' }) })
      toast({ title: `${t.taskCode} completed 🎉` }); bumpData()
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks & Assignments"
        subtitle={`${tasks.length} task${tasks.length === 1 ? '' : 's'}${overdueTasks.length > 0 ? ` · ${overdueTasks.length} OVERDUE` : ''}`}
        actions={canWrite && (
          <Button size="sm" onClick={openCreate} className="brand-gradient-bg text-white"><Plus className="w-4 h-4 mr-1.5" /> New task</Button>
        )}
      />

      {overdueTasks.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
          <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-4 h-4" /> Overdue tasks — the responsible team member has been notified
          </p>
          <div className="flex flex-wrap gap-1.5">
            {overdueTasks.slice(0, 6).map((t) => (
              <button key={t.id} onClick={() => setDetail(t)} className="text-[11px] bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-full px-2.5 py-1 font-semibold hover:bg-rose-500/25">
                {t.taskCode} · {t.title} ({t.assignee?.name ?? 'unassigned'})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="pl-9" />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isDev && (
          <Button variant={mine ? 'default' : 'outline'} size="sm" onClick={() => setMine(!mine)} className={mine ? 'brand-gradient-bg text-white' : ''}>
            My tasks
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No tasks found" hint={isDev ? 'Tasks assigned to you will appear here.' : 'Create a task and assign it to a team member.'} icon={<ListChecks className="w-7 h-7" />} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto ag-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="hidden md:table-cell">Related to</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="hidden sm:table-cell">Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const dd = daysUntil(t.deadline)
                  const overdue = dd !== null && dd < 0 && !['Completed'].includes(t.status)
                  return (
                    <TableRow key={t.id} className="cursor-pointer group" onClick={() => setDetail(t)}>
                      <TableCell>
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{t.title}</p>
                        <p className="text-[11px] text-muted-foreground">{t.taskCode} · <StatusBadge status={t.priority} /></p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {t.order ? t.order.orderCode : t.client ? t.client.businessName : '—'}
                      </TableCell>
                      <TableCell>
                        {t.assignee ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="w-6 h-6">{t.assignee.avatarUrl ? <AvatarImage src={t.assignee.avatarUrl} /> : null}<AvatarFallback className="text-[9px]">{t.assignee.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                            <span className="text-xs">{t.assignee.name}</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">
                        <span className={overdue ? 'text-rose-500 font-semibold' : ''}>
                          {fmtDate(t.deadline)}{overdue ? ` (${Math.abs(dd!)}d late)` : ''}
                        </span>
                      </TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {!['Completed', 'Closed'].includes(t.status) && (canWrite || t.assigneeId === user?.id) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" onClick={() => completeTask(t)} aria-label="Complete"><CheckCircle2 className="w-4 h-4" /></Button>
                          )}
                          {(canWrite || t.assigneeId === user?.id) && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label="Edit"><Pencil className="w-3.5 h-3.5" /></Button>}
                          {user?.role === 'ADMIN' && <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500" onClick={() => setDeleteTarget(t)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <EntityDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editing ? `Edit ${editing.taskCode}` : 'Create task'}>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Build restaurant homepage" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Assign to</Label>
              <Select value={form.assigneeId || 'none'} onValueChange={(v) => setForm({ ...form, assigneeId: v === 'none' ? '' : v })} disabled={isDev}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {team.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Related client</Label>
              <Select value={form.clientId || 'none'} onValueChange={(v) => setForm({ ...form, clientId: v === 'none' ? '' : v })} disabled={isDev}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Related order</Label>
              <Select value={form.orderId || 'none'} onValueChange={(v) => setForm({ ...form, orderId: v === 'none' ? '' : v })} disabled={isDev}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Start date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="brand-gradient-bg text-white">
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}{editing ? 'Save changes' : 'Create task'}
          </Button>
        </div>
      </EntityDialog>

      <EntityDialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)} title={detail ? `${detail.taskCode} — ${detail.title}` : ''} wide>
        {detail && <TaskDetailBody task={detail} />}
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.taskCode}?`}
        description="This permanently removes the task and its comments."
        onConfirm={doDelete} confirmLabel="Delete task" busy={busy}
      />
    </div>
  )
}

// Task detail body with live comment loading (hooks-safe)
function TaskDetailBody({ task }: { task: Task }) {
  const [data, setData] = useState<{ task: Task & { comments: CommentItem[] } } | null>(null)
  useEffect(() => {
    api<{ task: Task & { comments: CommentItem[] } }>(`/api/tasks/${task.id}`).then(setData).catch(() => {})
  }, [task.id])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={task.status} />
        <StatusBadge status={task.priority} />
        {task.deadline && <span className="text-xs text-muted-foreground">due {fmtDate(task.deadline)}</span>}
      </div>
      {task.description && <p className="text-xs whitespace-pre-wrap rounded-xl bg-muted p-3">{task.description}</p>}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <p><span className="text-muted-foreground">Assignee:</span> {task.assignee?.name ?? '—'}</p>
        <p><span className="text-muted-foreground">Created by:</span> {task.creator?.name ?? '—'}</p>
        <p><span className="text-muted-foreground">Client:</span> {task.client?.businessName ?? '—'}</p>
        <p><span className="text-muted-foreground">Order:</span> {task.order?.orderCode ?? '—'}</p>
      </div>
      <CommentThread
        comments={data?.task.comments ?? []}
        endpoint={{ taskId: task.id }}
        onPosted={async () => {
          const r = await api<{ task: Task & { comments: CommentItem[] } }>(`/api/tasks/${task.id}`)
          setData(r)
        }}
      />
    </div>
  )
}
