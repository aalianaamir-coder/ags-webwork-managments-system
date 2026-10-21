// AGS WEBWORKS — Role-based permission matrix (server-side enforcement)
// Roles: ADMIN (Sharjeel) | DEVELOPER (Gufran) | ACCOUNTANT (Addan)

import { getSessionUser, type SessionUser } from '@/lib/auth'

export type Role = 'ADMIN' | 'DEVELOPER' | 'ACCOUNTANT'

export const PERMISSIONS: Record<string, Role[]> = {
  // Clients
  'clients:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'clients:write': ['ADMIN', 'ACCOUNTANT'], // accountant may update coordination fields
  'clients:delete': ['ADMIN'],
  'clients:export': ['ADMIN', 'ACCOUNTANT'],
  // Orders
  'orders:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'], // developer sees assigned only
  'orders:write': ['ADMIN', 'ACCOUNTANT'],
  'orders:progress': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'], // dev-stage status, urls, notes
  'orders:delete': ['ADMIN'],
  // Tasks
  'tasks:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'tasks:write': ['ADMIN', 'ACCOUNTANT'],
  'tasks:updateAssigned': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'], // status of own tasks
  'tasks:delete': ['ADMIN'],
  // Finance
  'payments:read': ['ADMIN', 'ACCOUNTANT'],
  'payments:write': ['ADMIN', 'ACCOUNTANT'],
  'payments:delete': ['ADMIN'],
  'invoices:read': ['ADMIN', 'ACCOUNTANT'],
  'invoices:write': ['ADMIN', 'ACCOUNTANT'],
  'invoices:delete': ['ADMIN'],
  'expenses:read': ['ADMIN', 'ACCOUNTANT'],
  'expenses:write': ['ADMIN', 'ACCOUNTANT'],
  'expenses:approve': ['ADMIN'],
  'expenses:delete': ['ADMIN'],
  // Files
  'files:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'files:write': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'files:delete': ['ADMIN'],
  // Team & settings
  'team:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'team:manage': ['ADMIN'],
  'settings:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'settings:write': ['ADMIN'],
  'activity:read': ['ADMIN'],
  // Reports
  'reports:read': ['ADMIN', 'ACCOUNTANT'],
  'reports:export': ['ADMIN', 'ACCOUNTANT'],
  // Maintenance — plans
  'plans:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'plans:write': ['ADMIN'],
  // Maintenance — subscriptions
  'subs:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'], // developer sees assigned only
  'subs:manage': ['ADMIN'], // create/renew/pause/upgrade/downgrade/cancel
  'subs:billing': ['ADMIN', 'ACCOUNTANT'], // billing dates & payment records
  // Maintenance — invoices & payments
  'minvoices:read': ['ADMIN', 'ACCOUNTANT'],
  'minvoices:write': ['ADMIN', 'ACCOUNTANT'],
  // Maintenance — tickets
  'tickets:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'],
  'tickets:write': ['ADMIN', 'ACCOUNTANT'],
  'tickets:assigned': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'], // assigned technical updates
  // Scheduler
  'scheduler:run': ['ADMIN', 'ACCOUNTANT'],
  // Attendance (GitHub-style tracker)
  'attendance:read': ['ADMIN', 'DEVELOPER', 'ACCOUNTANT'], // own records; team-wide for ADMIN/ACCOUNTANT
  'attendance:manage': ['ADMIN'], // manual mark/edit for any member
}

export function can(user: { role: string } | null, permission: string): boolean {
  if (!user) return false
  return (PERMISSIONS[permission] ?? []).includes(user.role as Role)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Returns the session user or throws 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, 'Authentication required')
  return user
}

/** Returns the session user if they hold the permission, else throws 401/403. */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser()
  if (!can(user, permission)) throw new ApiError(403, 'You do not have permission to perform this action')
  return user
}

/** Wrap a route handler with uniform JSON error handling. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args)
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json({ error: err.message }, { status: err.status })
      }
      // Log the real error server-side (with stack) but NEVER send internals
      // (Prisma messages, file paths, SQL) to the client.
      console.error('[api]', err)
      return Response.json(
        { error: 'Something went wrong on our side. Please try again — if the problem persists, contact the administrator.' },
        { status: 500 }
      )
    }
  }
}
