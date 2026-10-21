'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, Loader2, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { api, timeAgo, fmtDateTime } from '@/lib/client-utils'
import { useApp, type ViewId } from '@/lib/store'
import { PageHeader, EmptyState } from '@/components/app/shared'

type Notif = { id: string; title: string; body?: string | null; type: string; link?: string | null; isRead: boolean; createdAt: string }

const TYPE_ICONS: Record<string, string> = {
  order: '📦', task: '✅', payment: '💰', deadline: '⏰', maintenance: '🔧', alert: '🚨', info: '🔔',
}

export default function NotificationsView({ onOpened }: { onOpened: () => void }) {
  const { setView } = useApp()
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api<{ notifications: Notif[] }>('/api/notifications')
      setNotifications(res.notifications)
    } catch (err) {
      toast({ title: 'Failed to load notifications', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { load() }, [load])

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead)
    await Promise.all(unread.map((n) => api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null)))
    toast({ title: 'All notifications marked as read' })
    load()
    onOpened()
  }

  const open = async (n: Notif) => {
    if (!n.isRead) {
      await api(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null)
      onOpened()
    }
    if (n.link) setView(n.link as ViewId)
  }

  const unread = notifications.filter((n) => !n.isRead).length

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'You are all caught up'}
        actions={unread > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead}><CheckCheck className="w-4 h-4 mr-1.5" />Mark all read</Button>
        )}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : notifications.length === 0 ? (
        <EmptyState title="No notifications yet" hint="Order, task, payment and maintenance events will appear here." icon={<Bell className="w-7 h-7" />} />
      ) : (
        <div className="space-y-2 max-w-3xl">
          {notifications.map((n) => (
            <Card key={n.id} className={`cursor-pointer hover:shadow-md transition-all ${!n.isRead ? 'border-primary/40 bg-primary/5' : ''}`} onClick={() => open(n)}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-lg shrink-0">
                  {TYPE_ICONS[n.type] ?? '🔔'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.isRead ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground/70 mt-1" title={fmtDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
