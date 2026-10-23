'use client'

// AGS WEBWORKS — client-side fetch + formatting helpers

export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  return data as T
}

export function fmtSAR(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined) return '—'
  if (opts?.compact && Math.abs(n) >= 1000) {
    return `SAR ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`
  }
  return `SAR ${new Intl.NumberFormat('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(d: string | Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return fmtDate(d)
}

export function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null
  const diff = new Date(d).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

export function isOverdue(d: string | Date | null | undefined): boolean {
  const days = daysUntil(d)
  return days !== null && days < 0
}

export function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

// ---------- Status badge colors ----------

export function statusVariant(status: string): string {
  const s = status.toLowerCase()
  if (['lead', 'new', 'to do', 'pending', 'draft'].includes(s)) return 'bg-slate-500/12 text-slate-600 dark:text-slate-300 border-slate-500/25'
  if (['contacted', 'interested', 'issued', 'in progress'].includes(s)) return 'bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/25'
  if (['negotiation', 'partially paid', 'waiting', 'waiting for client', 'payment due', 'review'].includes(s)) return 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/25'
  if (['won', 'active client', 'active', 'paid', 'completed', 'closed', 'delivered', 'payment completed'].includes(s)) return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25'
  if (['lost', 'overdue', 'cancelled', 'expired', 'void', 'rejected', 'urgent'].includes(s)) return 'bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/25'
  if (['paused', 'internal review', 'client review', 'revisions'].includes(s)) return 'bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/25'
  return 'bg-primary/10 text-primary border-primary/25'
}

export function priorityVariant(priority: string): string {
  const p = priority.toLowerCase()
  if (p === 'urgent') return 'bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/25'
  if (p === 'high') return 'bg-orange-500/12 text-orange-600 dark:text-orange-300 border-orange-500/25'
  if (p === 'medium') return 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/25'
  return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/25'
}

export const CLIENT_STATUSES = ['Lead', 'Contacted', 'Interested', 'Negotiation', 'Won', 'Active Client', 'Lost']
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
export const TASK_STATUSES = ['To Do', 'In Progress', 'Waiting', 'Review', 'Completed']
export const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Mada', 'Apple Pay', 'STC Pay', 'Other']
export const EXPENSE_CATEGORIES = ['Hosting & Domain', 'Marketing', 'Software', 'Tools', 'Equipment', 'Salaries', 'Transport', 'Other']
export const FILE_CATEGORIES = ['Client Logo', 'Photos', 'Content', 'Project Document', 'Quotation', 'Invoice', 'Screenshot', 'Delivery File', 'Other']
export const SERVICE_TYPES = [
  'Business Website Development',
  'Restaurant Website Development',
  'Website Redesign',
  'Website Maintenance',
  'Google Business Profile Setup',
  'Promotional Video Editing',
  'Landing Page',
  'Website Hosting & Deployment',
  'Other Custom Digital Service',
]
export const INVOICE_STATUSES = ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Void']
export const SUB_STATUSES = ['Pending', 'Active', 'Payment Due', 'Overdue', 'Paused', 'Cancelled', 'Expired']
export const TICKET_STATUSES = ['New', 'In Progress', 'Waiting for Client', 'Completed', 'Closed']

// ---------- Roles ----------

/** True for roles with admin-level authority (ADMIN and the hidden oversight role). */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'SUPERADMIN'
}

/** Role label shown in the UI. The hidden oversight role is displayed as ADMIN
 *  so nothing in the interface ever reveals a special account exists. */
export function displayRole(role: string | null | undefined): string {
  return role === 'SUPERADMIN' ? 'ADMIN' : (role ?? '')
}
