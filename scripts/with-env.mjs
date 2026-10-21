#!/usr/bin/env node
// AGS WEBWORKS — universal env + command wrapper
//
// Makes the SAME codebase run in every environment with ZERO changes:
//
//   1. Vercel / production:  DATABASE_URL comes from the platform (Supabase).
//      Passed straight through — nothing is overridden, no local Postgres.
//   2. Local with .env:      A postgres:// URL (e.g. Supabase) passes through.
//   3. Sandbox / bare local: When DATABASE_URL is missing or points at a
//      sqlite file (the sandbox default), we transparently start the bundled
//      embedded PostgreSQL and use it instead.
//
// Env precedence: real process env > .env.local > .env > local-pg fallback.
//
// Usage: node scripts/with-env.mjs [--no-pg] <command> [args...]
//   --no-pg   skip embedded-postgres startup (e.g. for `next build`)

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------- tiny .env parser (no deps) ----------
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

// Load: .env.local wins over .env; never overwrite real process env.
const fileEnv = { ...parseEnv(path.join(ROOT, '.env')), ...parseEnv(path.join(ROOT, '.env.local')) }
const env = { ...fileEnv, ...process.env } // process.env (platform/Vercel) wins

let skipPg = false
const argv = process.argv.slice(2)
if (argv[0] === '--no-pg') { skipPg = true; argv.shift() }
const [command, ...args] = argv
if (!command) {
  console.error('usage: node scripts/with-env.mjs [--no-pg] <command> [args...]')
  process.exit(1)
}

// ---------- decide the database URL ----------
const current = env.DATABASE_URL || ''
const isSandboxSqlite = !current || current.startsWith('file:')
if (isSandboxSqlite && !skipPg) {
  const pg = await import('./local-pg.mjs')
  const ok = await pg.ensure()
  if (!ok) {
    console.error('[with-env] embedded PostgreSQL failed to start — aborting.')
    process.exit(1)
  }
  env.DATABASE_URL = pg.PG.url
} else if (isSandboxSqlite && skipPg) {
  // Build-time: no DB connection needed; give prisma generate a valid URL shape.
  env.DATABASE_URL = env.DATABASE_URL || 'postgresql://build:build@127.0.0.1:5433/build'
}

// Dev-only convenience keys (never used when the real env provides them).
if (!env.SCHEDULER_KEY) env.SCHEDULER_KEY = 'dev-only-scheduler-key'

// ---------- resolve the command (node_modules/.bin first) ----------
function resolveCommand(cmd) {
  const bin = path.join(ROOT, 'node_modules', '.bin', cmd)
  if (existsSync(bin)) return bin
  return cmd // rely on PATH
}

const child = spawn(resolveCommand(command), args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
})

child.on('error', (e) => { console.error(`[with-env] failed to run "${command}":`, e.message); process.exit(1) })
child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
