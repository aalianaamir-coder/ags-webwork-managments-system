#!/usr/bin/env node
// AGS WEBWORKS — cross-platform production start
//
// Boots the standalone production server produced by `npm run build`.
// Works with npm on Windows (PowerShell/cmd), macOS and Linux.
// (Vercel does not use this script — it runs the build output directly.)

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = process.env.NEXT_DIST_DIR || '.next'
const server = path.join(ROOT, distDir, 'standalone', 'server.js')

if (!existsSync(server)) {
  console.error('No production build found. Run this first:  npm run build')
  process.exit(1)
}

// Same env resolution as scripts/with-env.mjs: process env wins,
// then .env.local, then .env.
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
const fileEnv = { ...parseEnv(path.join(ROOT, '.env')), ...parseEnv(path.join(ROOT, '.env.local')) }
const env = { ...fileEnv, ...process.env }

// Local-only convenience: when no real DATABASE_URL is configured, start the
// embedded PostgreSQL (production/Supabase URLs pass straight through).
const current = env.DATABASE_URL || ''
if (!current || current.startsWith('file:')) {
  const pg = await import('./local-pg.mjs')
  if (!(await pg.ensure())) process.exit(1)
  env.DATABASE_URL = pg.PG.url
}
if (!env.SCHEDULER_KEY) env.SCHEDULER_KEY = 'dev-only-scheduler-key'

const port = env.PORT || '3000'
console.log(`==> starting production server on port ${port}`)
const child = spawn(process.execPath, [server], {
  stdio: 'inherit',
  env: { ...env, NODE_ENV: 'production' },
})

child.on('error', (e) => { console.error('[start] failed:', e.message); process.exit(1) })
child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
