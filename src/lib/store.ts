'use client'

// AGS WEBWORKS — global client state (SPA navigation, session, UI prefs)

import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'

export type ViewId =
  | 'dashboard'
  | 'clients'
  | 'orders'
  | 'tasks'
  | 'attendance'
  | 'payments'
  | 'expenses'
  | 'team'
  | 'files'
  | 'reports'
  | 'notifications'
  | 'maintenance'
  | 'settings'
  | 'creator'

export type SessionUser = {
  id: string
  username: string
  email: string
  name: string
  role: 'ADMIN' | 'DEVELOPER' | 'ACCOUNTANT'
  jobTitle: string
  avatarUrl?: string | null
  mustChangePassword: boolean
}

export type Lang = 'en' | 'ar'

type AppState = {
  user: SessionUser | null
  authChecked: boolean
  view: ViewId
  sidebarOpen: boolean
  lang: Lang
  dataVersion: number
  focusId: string | null // open detail for a specific record (e.g. order detail)
  setUser: (u: SessionUser | null) => void
  setAuthChecked: (v: boolean) => void
  setView: (v: ViewId, focusId?: string | null) => void
  setSidebarOpen: (v: boolean) => void
  setLang: (l: Lang) => void
  bumpData: () => void
}

// HMR-safe store: cache the instance on globalThis so Fast Refresh (dev)
// re-evaluating this module does NOT reset navigation/session state.
type AppStore = UseBoundStore<StoreApi<AppState>>
const globalForStore = globalThis as unknown as { __agsAppStore?: AppStore }

export const useApp: AppStore =
  globalForStore.__agsAppStore ??
  create<AppState>((set) => ({
    user: null,
    authChecked: false,
    view: 'dashboard',
    sidebarOpen: false,
    lang: 'en',
    dataVersion: 0,
    focusId: null,
    setUser: (user) => set({ user }),
    setAuthChecked: (authChecked) => set({ authChecked }),
    setView: (view, focusId = null) => set({ view, focusId, sidebarOpen: false }),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setLang: (lang) => set({ lang }),
    bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  }))

globalForStore.__agsAppStore = useApp

// Role-based navigation, grouped like a professional SaaS sidebar
export type NavGroup = { label: string; items: { id: ViewId; labelKey: string; icon: string }[] }

export function navGroupsForRole(role: string | undefined): NavGroup[] {
  const isAdmin = role === 'ADMIN'
  const isAccountant = role === 'ACCOUNTANT'

  const groups: NavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { id: 'dashboard', labelKey: 'nav.dashboard', icon: 'LayoutDashboard' },
        { id: 'clients', labelKey: 'nav.clients', icon: 'Users' },
        { id: 'orders', labelKey: 'nav.orders', icon: 'FolderKanban' },
        { id: 'tasks', labelKey: 'nav.tasks', icon: 'ListChecks' },
        { id: 'attendance', labelKey: 'nav.attendance', icon: 'CalendarCheck' },
      ],
    },
  ]

  const finance: NavGroup = { label: 'Finance', items: [] }
  if (isAdmin || isAccountant) {
    finance.items.push(
      { id: 'payments', labelKey: 'nav.payments', icon: 'Receipt' },
      { id: 'expenses', labelKey: 'nav.expenses', icon: 'Wallet' },
    )
  }
  finance.items.push({ id: 'maintenance', labelKey: 'nav.maintenance', icon: 'Wrench' })
  if (finance.items.length) groups.push(finance)

  groups.push({
    label: 'Operations',
    items: [
      { id: 'team', labelKey: 'nav.team', icon: 'UserCog' },
      { id: 'files', labelKey: 'nav.files', icon: 'FolderOpen' },
      ...(isAdmin || isAccountant ? [{ id: 'reports' as ViewId, labelKey: 'nav.reports', icon: 'BarChart3' }] : []),
    ],
  })

  groups.push({
    label: 'System',
    items: [
      { id: 'notifications', labelKey: 'nav.notifications', icon: 'Bell' },
      { id: 'settings', labelKey: 'nav.settings', icon: 'Settings' },
      { id: 'creator', labelKey: 'nav.creator', icon: 'Sparkles' },
    ],
  })

  return groups
}

/** Flat navigation list (used by notification deep-links etc.) */
export function navForRole(role: string | undefined): { id: ViewId; labelKey: string; icon: string }[] {
  return navGroupsForRole(role).flatMap((g) => g.items)
}
