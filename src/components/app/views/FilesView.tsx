'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload, Search, Loader2, Trash2, FolderOpen, File as FileIcon, Download } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { api, fmtDate, FILE_CATEGORIES, isAdminRole } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { PageHeader, EmptyState, EntityDialog, ConfirmDialog } from '@/components/app/shared'

type FileRec = {
  id: string; fileName: string; mimeType: string; size: number; category: string; createdAt: string
  clientId?: string | null; orderId?: string | null; taskId?: string | null
  uploader?: { id: string; name: string; avatarUrl?: string } | null
  client?: { id: string; businessName: string } | null
  order?: { id: string; orderCode: string } | null
}
type ClientOpt = { id: string; businessName: string; clientCode: string }
type OrderOpt = { id: string; orderCode: string; serviceType: string }

export default function FilesView() {
  const { user, dataVersion, bumpData } = useApp()
  const { toast } = useToast()
  const [files, setFiles] = useState<FileRec[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [orders, setOrders] = useState<OrderOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [catF, setCatF] = useState('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FileRec | null>(null)

  const [form, setForm] = useState({ category: FILE_CATEGORIES[3], clientId: '', orderId: '', file: null as File | null })

  const isAdmin = isAdminRole(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ files: FileRec[] }>('/api/files')
      setFiles(res.files)
      const [c, o] = await Promise.all([
        api<{ clients: ClientOpt[] }>('/api/clients'),
        api<{ orders: OrderOpt[] }>('/api/orders'),
      ])
      setClients(c.clients)
      setOrders(o.orders)
    } catch (err) {
      toast({ title: 'Failed to load files', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { load() }, [load, dataVersion])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return files.filter((f) => {
      if (catF !== 'all' && f.category !== catF) return false
      if (!term) return true
      return [f.fileName, f.client?.businessName, f.order?.orderCode, f.uploader?.name].some((v) => v?.toLowerCase().includes(term))
    })
  }, [files, q, catF])

  const upload = async () => {
    if (!form.file) { toast({ title: 'Choose a file first', variant: 'destructive' }); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', form.file)
      fd.append('category', form.category)
      if (form.clientId) fd.append('clientId', form.clientId)
      if (form.orderId) fd.append('orderId', form.orderId)
      const res = await fetch('/api/files', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      toast({ title: 'File uploaded', description: form.file.name })
      setUploadOpen(false)
      setForm({ ...form, file: null, clientId: '', orderId: '' })
      bumpData()
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      // Soft-delete: mark as removed by clearing metadata is not supported — admin-only hard delete via API
      await fetch(`/api/files/${deleteTarget.id}`, { method: 'DELETE' })
      toast({ title: 'File deleted' })
      setDeleteTarget(null)
      bumpData()
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`)
  const isImage = (m: string) => m.startsWith('image/')

  return (
    <div>
      <PageHeader
        title="Files & Documents"
        subtitle={`${files.length} file${files.length === 1 ? '' : 's'} in secure private storage`}
        actions={<Button size="sm" onClick={() => setUploadOpen(true)} className="brand-gradient-bg text-white"><Upload className="w-4 h-4 mr-1.5" />Upload file</Button>}
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="pl-9" />
        </div>
        <Select value={catF} onValueChange={setCatF}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {FILE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No files yet" hint="Upload client logos, photos, content, quotations and delivery files." icon={<FolderOpen className="w-7 h-7" />} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((f) => (
            <Card key={f.id} className="group hover:shadow-lg transition-all hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {isImage(f.mimeType) ? (
                       
                      <img src={`/api/files/${f.id}/download`} alt={f.fileName} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <FileIcon className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setDeleteTarget(f)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
                <p className="text-xs font-semibold truncate mt-2.5" title={f.fileName}>{f.fileName}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{f.category} · {fmtSize(f.size)}</p>
                <p className="text-[10px] text-muted-foreground truncate">{f.client?.businessName ?? f.order?.orderCode ?? 'General'} · {fmtDate(f.createdAt)}</p>
                <Button size="sm" variant="outline" className="w-full mt-2.5" asChild>
                  <a href={`/api/files/${f.id}/download`} download><Download className="w-3.5 h-3.5 mr-1.5" />Download</a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EntityDialog open={uploadOpen} onOpenChange={setUploadOpen} title="Upload file">
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">File (max 4 MB)</Label>
            <Input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            <p className="text-[10px] text-muted-foreground">Images, PDFs, documents, spreadsheets, archives, video &amp; audio.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FILE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Client (optional)</Label>
              <Select value={form.clientId || 'none'} onValueChange={(v) => setForm({ ...form, clientId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.businessName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Order / project (optional)</Label>
              <Select value={form.orderId || 'none'} onValueChange={(v) => setForm({ ...form, orderId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.orderCode} — {o.serviceType}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Files are stored in private server storage — downloads require a signed-in team account.</p>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
          <Button onClick={upload} disabled={busy || !form.file} className="brand-gradient-bg text-white">{busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}Upload</Button>
        </div>
      </EntityDialog>

      <ConfirmDialog
        open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.fileName}?`}
        description="The file is removed from secure storage permanently."
        onConfirm={doDelete} confirmLabel="Delete" busy={busy}
      />
    </div>
  )
}
