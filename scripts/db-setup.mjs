#!/usr/bin/env node
// AGS WEBWORKS — one-command database bootstrap
//
// Runs: embedded-PG ensure (local only) -> prisma db push -> seed if empty.
// On Supabase/Vercel (DATABASE_URL already postgres) the embedded PG is
// skipped and it pushes+seeds the remote database instead.
//
// Idempotent: safe to run repeatedly. Never overwrites existing data
// (seed only runs when the users table is empty).

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Same env resolution as with-env.mjs
function parseEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}
const fileEnv = { ...parseEnv(path.join(ROOT, '.env')), ...parseEnv(path.join(ROOT, '.env.local')) }
const env = { ...fileEnv, ...process.env }

const isSandboxSqlite = !env.DATABASE_URL || env.DATABASE_URL.startsWith('file:')

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve) => {
    const bin = path.join(ROOT, 'node_modules', '.bin', cmd)
    const child = spawn(existsSync(bin) ? bin : cmd, args, {
      stdio: 'inherit',
      env: { ...env, ...extraEnv },
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', (e) => { console.error(`failed: ${cmd}`, e.message); resolve(1) })
  })
}

// 1. Local embedded postgres (sandbox/bare-local only)
if (isSandboxSqlite) {
  const pg = await import('./local-pg.mjs')
  const ok = await pg.ensure()
  if (!ok) process.exit(1)
  env.DATABASE_URL = pg.PG.url
}

// 2. Schema
console.log('\n==> prisma db push')
if (await run('prisma', ['db', 'push', '--accept-data-loss']) !== 0) process.exit(1)

// 3. Seed only when the users table is empty (protects existing data)
const { PrismaClient } = await import('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })
let userCount = 0
try {
  userCount = await db.user.count()
} catch (e) {
  console.error('Could not read the users table:', e?.message ?? e)
  process.exit(1)
} finally {
  await db.$disconnect()
}
if (userCount > 0) {
  console.log(`\n==> Database already has ${userCount} user account(s) — seed skipped (data preserved).`)
  console.log('==> Database ready.')
  process.exit(0)
}

console.log('\n==> empty database — seeding initial accounts, plans & settings')
if (await run('tsx', ['prisma/seed.ts']) !== 0) process.exit(1)
console.log('\n==> Database ready. Default sign-in: username = password (sharjeel / gufran / addan).')
