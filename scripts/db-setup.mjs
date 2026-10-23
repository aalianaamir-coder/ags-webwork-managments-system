#!/usr/bin/env node
// AGS WEBWORKS — one-command database bootstrap
//
// Runs: embedded-PG ensure (local only) -> prisma db push -> idempotent seed.
// On Supabase/Vercel (DATABASE_URL already postgres) the embedded PG is
// skipped and it pushes+seeds the remote database instead.
//
// Idempotent: safe to run repeatedly. Never overwrites existing data
// (seed only creates missing accounts/settings and repairs system flags).

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
    // Windows: npm creates .cmd shims — cmd.exe cannot run the extensionless
    // Unix shell scripts that also live in node_modules/.bin.
    const binDir = path.join(ROOT, 'node_modules', '.bin')
    let bin = path.join(binDir, cmd)
    if (process.platform === 'win32') {
      if (existsSync(path.join(binDir, `${cmd}.cmd`))) bin = path.join(binDir, `${cmd}.cmd`)
      else if (existsSync(path.join(binDir, `${cmd}.exe`))) bin = path.join(binDir, `${cmd}.exe`)
      else if (!existsSync(bin)) bin = cmd
    } else if (!existsSync(bin)) {
      bin = cmd
    }
    const child = spawn(bin, args, {
      stdio: 'inherit',
      env: { ...env, ...extraEnv },
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', (e) => { console.error(`failed: ${cmd}`, e.message); resolve(1) })
  })
}

// 1. Local embedded postgres (sandbox/bare-local only — never when a real
//    DATABASE_URL like Supabase is configured).
if (isSandboxSqlite) {
  const pg = await import('./local-pg.mjs')
  const ok = await pg.ensure()
  if (!ok) process.exit(1)
  env.DATABASE_URL = pg.PG.url
}

// 2. Schema
console.log('\n==> prisma db push')
if (await run('prisma', ['db', 'push', '--accept-data-loss']) !== 0) process.exit(1)

// 3. Seed (idempotent — safe on databases that already have data):
//    - business settings / plans / team accounts are only created when missing
//    - system accounts are repaired (never password-reset) when flags changed
//    - nothing existing is ever overwritten or deleted
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
  console.log(`\n==> Database already has ${userCount} user account(s) — existing data preserved.`)
}

console.log('\n==> seeding (idempotent — ensures accounts, plans & settings exist)')
if (await run('tsx', ['prisma/seed.ts']) !== 0) process.exit(1)
console.log('\n==> Database ready. Default sign-in: username = password (sharjeel / gufran / addan).')
console.log('    Next: npm run dev   (local)   —   deploy guide: DEPLOY-VERCEL.md')
// The persistent embedded-PG child process keeps the Node event loop alive —
// exit explicitly (schema + seed are already committed at this point).
process.exit(0)
