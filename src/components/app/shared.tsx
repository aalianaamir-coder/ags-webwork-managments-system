'use client'

// AGS WEBWORKS — shared view components

import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Inbox, TrendingUp, TrendingDown, Send, Loader2 } from 'lucide-react'
import { api, statusVariant, timeAgo } from '@/lib/client-utils'
import { useApp } from '@/lib/store'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'

export function StatCard({
  label, value, hint, icon, trend, trendValue, delay = 0, accent = 'primary',
}: {
  label: string
  value: string | number
  hint?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | null
  trendValue?: string
  delay?: number
  accent?: 'primary' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan'
}) {
  // Minimal professional palette — only the icon carries a hint of color
  const accents: Record<string, string> = {
    primary: 'text-[var(--chart-1)]',
    violet: 'text-[var(--chart-4)]',
    emerald: 'text-[var(--chart-2)]',
    amber: 'text-[var(--chart-3)]',
    rose: 'text-[var(--chart-5)]',
    cyan: 'text-[var(--chart-1)]',
  }
  return (
    <div className="rounded-lg border bg-card transition-colors hover:border-muted-foreground/30" style={{ animationDelay: `${delay}ms` }}>
      <div className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          {icon && <div className={`shrink-0 p-2 rounded-md bg-muted/60 [&_svg]:w-4 [&_svg]:h-4 ${accents[accent]}`}>{icon}</div>}
        </div>
        <p className="text-2xl font-semibold tracking-tight mt-2 truncate">{value}</p>
        {(hint || trend) && (
          <div className="flex items-center gap-2 mt-1.5 min-h-4">
            {trend && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-[var(--chart-2)]' : 'text-[var(--chart-5)]'}`}>
                {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {trendValue ?? (trend === 'up' ? 'Up' : 'Down')}
              </span>
            )}
            {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ title = 'No records yet', hint = 'Records you create will appear here.', icon }: { title?: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-muted-foreground mb-4">
        {icon ?? <Inbox className="w-6 h-6" />}
      </div>
      <p className="font-medium text-sm">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{hint}</p>
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold whitespace-nowrap ${statusVariant(status)}`}>
      {status}
    </Badge>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ConfirmDialog({
  open, onOpenChange, title, description, onConfirm, destructive = true, confirmLabel = 'Confirm', busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  destructive?: boolean
  confirmLabel?: string
  busy?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={busy}
            className={destructive ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export type CommentItem = { id: string; body: string; createdAt: string; user: { id: string; name: string; avatarUrl?: string | null } }

export function CommentThread({
  comments, endpoint, onPosted,
}: {
  comments: CommentItem[]
  endpoint: { orderId?: string; taskId?: string; clientId?: string; ticketId?: string }
  onPosted: () => void
}) {
  const { user } = useApp()
  const { toast } = useToast()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const post = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await api('/api/comments', { method: 'POST', body: JSON.stringify({ ...endpoint, body }) })
      setBody('')
      onPosted()
    } catch (err) {
      toast({ title: 'Could not post comment', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a note or comment…"
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && post()}
        />
        <Button size="icon" onClick={post} disabled={busy || !body.trim()} aria-label="Send comment">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      <div className="space-y-2.5 max-h-72 overflow-y-auto ag-scroll pr-1">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar className="w-7 h-7 mt-0.5">
              {c.user.avatarUrl ? <AvatarImage src={c.user.avatarUrl} alt={c.user.name} /> : null}
              <AvatarFallback className="text-[10px]">{c.user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="rounded-lg bg-muted px-3 py-2 flex-1 min-w-0">
              <p className="text-xs font-medium flex items-center gap-2">
                {c.user.name}
                {user?.id === c.user.id && <Badge variant="secondary" className="text-[9px] h-4">You</Badge>}
                <span className="text-[10px] font-normal text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Modal wrapper with consistent sizing for entity forms/detail dialogs. */
export function EntityDialog({
  open, onOpenChange, title, children, wide,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto ag-scroll`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export { Textarea }
