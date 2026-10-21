// AGS WEBWORKS — Authentication & session management
// - scrypt password hashing (Node crypto, no plaintext ever stored)
// - opaque session tokens; only SHA-256 hash stored in DB
// - httpOnly / sameSite cookies; server-side lookup on every request

import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { User } from '@prisma/client'

export const SESSION_COOKIE = 'ags_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days

// ---------- Passwords ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ---------- Sessions ----------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
  return token
}

export type SessionUser = Pick<
  User,
  'id' | 'username' | 'email' | 'name' | 'role' | 'jobTitle' | 'avatarUrl' | 'mustChangePassword'
>

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null
  }
  const u = session.user
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    jobTitle: u.jobTitle,
    avatarUrl: u.avatarUrl,
    mustChangePassword: u.mustChangePassword,
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  store.delete(SESSION_COOKIE)
}

export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } })
}
