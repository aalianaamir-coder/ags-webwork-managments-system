'use client'

import { useEffect, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard, Users, FolderKanban, ListChecks, Receipt, Wallet, Wrench, UserCog,
  FolderOpen, BarChart3, Bell, Settings, Sparkles, Menu, Sun, Moon, Sunrise, Globe, LogOut,
  ChevronDown, Search, CalendarCheck, Check,
} from 'lucide-react'
import { useApp, navGroupsForRole, type SessionUser, type ViewId } from '@/lib/store'
import { t } from '@/lib/i18n'
import { api, timeAgo, displayRole } from '@/lib/client-utils'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// PERFORMANCE: every view is code-split and loaded on demand. The initial
// bundle stays small (shell + dashboard only), so first paint and tab
// switching are fast. Each view is fetched once and then cached by the bundler.
function ViewLoading() {
  return (
    <div className="flex items-center justify-center py-24" aria-label="Loading…">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  )
}
const DashboardView = dynamic(() => import('@/components/app/views/DashboardView'), { ssr: false, loading: ViewLoading })
const ClientsView = dynamic(() => import('@/components/app/views/ClientsView'), { ssr: false, loading: ViewLoading })
const OrdersView = dynamic(() => import('@/components/app/views/OrdersView'), { ssr: false, loading: ViewLoading })
const TasksView = dynamic(() => import('@/components/app/views/TasksView'), { ssr: false, loading: ViewLoading })
const AttendanceView = dynamic(() => import('@/components/app/views/AttendanceView'), { ssr: false, loading: ViewLoading })
const PaymentsView = dynamic(() => import('@/components/app/views/PaymentsView'), { ssr: false, loading: ViewLoading })
const ExpensesView = dynamic(() => import('@/components/app/views/ExpensesView'), { ssr: false, loading: ViewLoading })
const MaintenanceView = dynamic(() => import('@/components/app/views/MaintenanceView'), { ssr: false, loading: ViewLoading })
const TeamView = dynamic(() => import('@/components/app/views/TeamView'), { ssr: false, loading: ViewLoading })
const FilesView = dynamic(() => import('@/components/app/views/FilesView'), { ssr: false, loading: ViewLoading })
const ReportsView = dynamic(() => import('@/components/app/views/ReportsView'), { ssr: false, loading: ViewLoading })
const NotificationsView = dynamic(() => import('@/components/app/views/NotificationsView'), { ssr: false, loading: ViewLoading })
const SettingsView = dynamic(() => import('@/components/app/views/SettingsView'), { ssr: false, loading: ViewLoading })
const CreatorView = dynamic(() => import('@/components/app/views/CreatorView'), { ssr: false, loading: ViewLoading })

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, FolderKanban, ListChecks, Receipt, Wallet, Wrench, UserCog,
  FolderOpen, BarChart3, Bell, Settings, Sparkles, CalendarCheck,
}

export type Notif = { id: string; title: string; body?: string | null; type: string; link?: string | null; isRead: boolean; createdAt: string }

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, view, setView, lang } = useApp()
  const groups = navGroupsForRole(user?.role)
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b border-[var(--sidebar-border)]">
        <img src="/logo-256.png" alt="AGS WEBWORKS" className="w-8 h-8 rounded-md ring-1 ring-[var(--sidebar-border)]" />
        <div className="leading-tight min-w-0">
          <p className="text-sm font-semibold text-[var(--sidebar-accent-foreground)] tracking-tight">AGS WEBWORKS</p>
          <p className="text-[10px] text-[var(--sidebar-foreground)] tracking-wide">Management System</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto ag-scroll py-3 px-2 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 mb-1 text-[10px] font-medium text-[var(--sidebar-foreground)] uppercase tracking-[0.14em]">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard
                const active = view === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setView(item.id as ViewId)
                      onNavigate?.()
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)] font-medium'
                        : 'text-[var(--sidebar-foreground)] hover:text-[var(--sidebar-accent-foreground)] hover:bg-[var(--sidebar-accent)]/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : ''}`} />
                    <span className="truncate">{t(lang, item.labelKey as 'nav.dashboard')}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-[var(--sidebar-border)] shrink-0">
        <p className="text-[10px] text-[var(--sidebar-foreground)]">Your Website • Our Expertise</p>
        <p className="text-[10px] text-[var(--sidebar-foreground)] mt-0.5">Made by <span className="font-medium text-[var(--sidebar-accent-foreground)]">Aaliyan Aamir</span></p>
      </div>
    </div>
  )
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  // hydration-safe client mount check (no setState inside effect)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const current = mounted ? (theme ?? 'dark') : 'dark'
  const options: { value: string; label: string; icon: React.ReactNode }[] = [
    { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
    { value: 'morning', label: 'Morning', icon: <Sunrise className="w-4 h-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Switch theme" title="Theme">
          {current === 'dark' ? <Moon className="w-4.5 h-4.5" /> : current === 'morning' ? <Sunrise className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => setTheme(o.value)} className="text-sm justify-between">
            <span className="flex items-center gap-2">{o.icon}{o.label}</span>
            {current === o.value && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AppShell({ user, onLogout, onPasswordChanged }: { user: SessionUser; onLogout: () => void; onPasswordChanged: (u: SessionUser) => void }) {
  const { view, setView, sidebarOpen, setSidebarOpen, lang, setLang } = useApp()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const schedulerBusy = useRef(false)

  // ---- Notification polling (every 30s) ----
  const pollNotifs = useCallback(async () => {
    try {
      const res = await api<{ notifications: Notif[]; unreadCount: number }>('/api/notifications')
      setNotifs(res.notifications.slice(0, 6))
      setUnread(res.unreadCount)
    } catch { /* silent */ }
  }, [])
  useEffect(() => {
    pollNotifs()
    const iv = setInterval(pollNotifs, 30000)
    return () => clearInterval(iv)
  }, [pollNotifs, useApp.getState().dataVersion])

  // ---- Maintenance scheduler auto-trigger (every 5 min while a billing role is online) ----
  useEffect(() => {
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN' && user.role !== 'ACCOUNTANT') return
    const run = async () => {
      if (schedulerBusy.current) return
      schedulerBusy.current = true
      try {
        const status = await api<{ schedulerEnabled: boolean; subscriptionsDue: number }>('/api/maintenance/scheduler/run')
        if (status.schedulerEnabled && status.subscriptionsDue > 0) {
          await api('/api/maintenance/scheduler/run', { method: 'POST' })
          pollNotifs()
        }
      } catch { /* silent */ } finally {
        schedulerBusy.current = false
      }
    }
    const timeout = setTimeout(run, 8000) // shortly after login
    const iv = setInterval(run, 300000)
    return () => { clearTimeout(timeout); clearInterval(iv) }
  }, [user.role, pollNotifs])

  const openNotification = async (n: Notif) => {
    if (!n.isRead) {
      try {
        await api(`/api/notifications/${n.id}/read`, { method: 'POST' })
        pollNotifs()
      } catch { /* ignore */ }
    }
    if (n.link) setView(n.link as ViewId)
  }

  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 start-0 w-60 bg-[var(--sidebar)] border-r border-[var(--sidebar-border)] z-40">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-[var(--sidebar)] border-[var(--sidebar-border)]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:ps-60 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-14 border-b bg-background/85 backdrop-blur flex items-center gap-2 md:gap-4 px-3 md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </Button>

          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground flex-1 max-w-md">
            <Search className="w-4 h-4 shrink-0" />
            <span className="truncate">AGS WEBWORKS — {user.jobTitle} workspace · Asia/Riyadh · SAR</span>
          </div>
          <div className="md:hidden flex-1 text-sm font-semibold truncate">AGS WEBWORKS</div>

          <div className="flex items-center gap-0.5">
            {/* Language */}
            <Button variant="ghost" size="icon" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} aria-label="Toggle language" title={lang === 'en' ? 'العربية' : 'English'}>
              <Globe className="w-4.5 h-4.5" />
            </Button>
            {/* Theme (Dark / Morning / Light) */}
            <ThemeSwitch />
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                  <Bell className="w-4.5 h-4.5" />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-[var(--destructive)] text-white text-[10px] font-semibold flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
                <div className="px-3 py-2.5 border-b flex items-center justify-between">
                  <p className="text-sm font-medium">Notifications</p>
                  <Badge variant="secondary" className="text-[10px]">{unread} unread</Badge>
                </div>
                <div className="max-h-80 overflow-y-auto ag-scroll">
                  {notifs.length === 0 && <p className="px-3 py-8 text-center text-xs text-muted-foreground">You&apos;re all caught up.</p>}
                  {notifs.map((n) => (
                    <button key={n.id} onClick={() => openNotification(n)} className="w-full text-left px-3 py-2.5 hover:bg-accent border-b last:border-0 transition-colors">
                      <div className="flex items-start gap-2">
                        {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
                        <div className="min-w-0">
                          <p className={`text-xs ${n.isRead ? 'text-muted-foreground' : 'font-medium'}`}>{n.title}</p>
                          {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setView('notifications')} className="w-full px-3 py-2.5 text-xs font-medium text-primary hover:bg-accent border-t">
                  View all notifications
                </button>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-accent transition-colors" aria-label="Account menu">
                  <Avatar className="w-8 h-8 ring-1 ring-border">
                    {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
                    <AvatarFallback className="bg-muted text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground font-normal">{user.email}</p>
                  <Badge variant="secondary" className="mt-1.5 text-[10px]">{displayRole(user.role)}</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView('settings')}><Settings className="w-4 h-4 mr-2" /> Settings &amp; profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setView('creator')}><Sparkles className="w-4 h-4 mr-2" /> The Creator</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-[var(--destructive)] focus:text-[var(--destructive)]"><LogOut className="w-4 h-4 mr-2" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-3 md:p-6">
          {view === 'dashboard' && <DashboardView />}
          {view === 'clients' && <ClientsView />}
          {view === 'orders' && <OrdersView />}
          {view === 'tasks' && <TasksView />}
          {view === 'attendance' && <AttendanceView />}
          {view === 'payments' && <PaymentsView />}
          {view === 'expenses' && <ExpensesView />}
          {view === 'maintenance' && <MaintenanceView />}
          {view === 'team' && <TeamView onPasswordChanged={onPasswordChanged} />}
          {view === 'files' && <FilesView />}
          {view === 'reports' && <ReportsView />}
          {view === 'notifications' && <NotificationsView onOpened={pollNotifs} />}
          {view === 'settings' && <SettingsView onPasswordChanged={onPasswordChanged} user={user} />}
          {view === 'creator' && <CreatorView />}
        </main>

        <footer className="mt-auto border-t px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} AGS WEBWORKS — Dammam &amp; Al Khobar, Saudi Arabia</p>
          <p className="text-xs text-muted-foreground">Made by <span className="font-medium">Aaliyan Aamir</span></p>
        </footer>
      </div>
    </div>
  )
}
