#!/usr/bin/env node
// AGS WEBWORKS — embedded PostgreSQL manager (local development only)
//
// Provides a zero-config PostgreSQL for local development on machines that
// have no Postgres installed. The database lives in the gitignored
// `db-pg-data/` folder and survives restarts. When a real DATABASE_URL is
// configured (Supabase / production), this module is never used.
//
// API (imported by with-env.mjs / db-setup.mjs / start.mjs / tests):
//   import pg from './local-pg.mjs'
//   await pg.ensure()      // idempotent: start if not running, self-heal once
//   pg.PG                  // { url, host, port, user, password, database }
//
// CLI:
//   node scripts/local-pg.mjs stop      // shut the local server down
//   node scripts/local-pg.mjs status    // is it running?
//
// Port: 5433 by default (avoids clashing with a system Postgres on 5432);
// override with AGS_PG_PORT for parallel instances.

import { existsSync, rmSync } from 'node:fs'
import { connect as tcpConnect } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const PG = {
  host: '127.0.0.1',
  port: Number(process.env.AGS_PG_PORT || 5433),
  user: 'ags',
  password: 'ags',
  database: 'ags',
  get url() {
    return `postgresql://${this.user}:${this.password}@${this.host}:${this.port}/${this.database}`
  },
}

const DATA_DIR = path.join(ROOT, 'db-pg-data')

// ---------- TCP probe: can we connect? ----------
function isUp(timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = tcpConnect({ host: PG.host, port: PG.port })
    const done = (v) => {
      try { socket.destroy() } catch {}
      resolve(v)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    setTimeout(() => done(false), timeoutMs)
  })
}

// ---------- embedded-postgres bootstrap ----------
async function boot({ wipe }) {
  if (wipe && existsSync(DATA_DIR)) {
    console.log('[local-pg] data directory looks damaged — recreating db-pg-data/ (one retry)')
    rmSync(DATA_DIR, { recursive: true, force: true })
  }
  const { default: Embedded } = await import('embedded-postgres')
  const instance = new Embedded({
    databaseDir: DATA_DIR,
    user: PG.user,
    password: PG.password,
    port: PG.port,
    persistent: true, // keep files across restarts
  })
  if (!existsSync(DATA_DIR)) await instance.initialise()
  await instance.start()
  // Create the app database; tolerate "already exists" so re-runs are safe.
  try {
    await instance.createDatabase(PG.database)
  } catch (e) {
    const msg = String(e?.message ?? e)
    if (!/already exists/i.test(msg)) throw e
  }
  // NOTE: the postgres child is intentionally kept alive — it is a detached
  // process managed by pg_ctl, not tied to this script's lifetime.
}

/**
 * Ensure the local embedded PostgreSQL is running. Idempotent.
 * Self-healing: if a start attempt fails, the data directory is wiped once
 * and the start is retried (recovers from sandbox resets / corrupt files).
 * @returns {Promise<boolean>} true when the server is accepting connections
 */
export async function ensure() {
  if (await isUp()) {
    console.log(`[local-pg] PostgreSQL already running on ${PG.host}:${PG.port}`)
    return true
  }
  try {
    await import('embedded-postgres')
  } catch {
    console.error('')
    console.error('[local-pg] The embedded PostgreSQL package is not installed on this machine.')
    console.error('[local-pg] Local no-setup databases are a development convenience only.')
    console.error('')
    console.error('[local-pg] For production use a hosted PostgreSQL:')
    console.error('[local-pg]   1. Create a free database at https://supabase.com')
    console.error('[local-pg]   2. Put its connection string in .env as DATABASE_URL')
    console.error('[local-pg]   3. Run: npm run db:push')
    console.error('[local-pg] Full step-by-step guide: DEPLOY-VERCEL.md')
    console.error('')
    return false
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await boot({ wipe: attempt > 0 })
      // Wait until the port actually accepts connections (start resolves
      // slightly before the listener is ready on some systems).
      for (let i = 0; i < 30; i++) {
        if (await isUp(400)) {
          console.log(`[local-pg] PostgreSQL ready on ${PG.host}:${PG.port} (data: db-pg-data/)`)
          return true
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      throw new Error('server did not start listening in time')
    } catch (e) {
      console.error(`[local-pg] start attempt ${attempt + 1} failed:`, e?.message ?? e)
      if (attempt === 1) return false
    }
  }
  return false
}

// ---------- CLI (stop / status) ----------
import { readdirSync } from 'node:fs'

function findPgCtl() {
  // Locate the platform binary directly (the embedded-postgres package does
  // not export its binary module, so we resolve @embedded-postgres/*/native/bin).
  const base = path.join(ROOT, 'node_modules', '@embedded-postgres')
  if (!existsSync(base)) return null
  for (const pkg of readdirSync(base)) {
    for (const bin of ['pg_ctl', 'pg_ctl.exe']) {
      const p = path.join(base, pkg, 'native', 'bin', bin)
      if (existsSync(p)) return p
    }
  }
  return null
}

async function pgCtl(args) {
  const bin = findPgCtl()
  if (!bin) throw new Error('pg_ctl binary not found (embedded-postgres not installed)')
  const child = spawn(bin, ['-D', DATA_DIR, ...args], { stdio: 'inherit' })
  child.on('error', (e) => { console.error('[local-pg] pg_ctl failed:', e.message); process.exit(1) })
  child.on('close', (code) => process.exit(code ?? 0))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? 'status'
  if (cmd === 'stop') {
    pgCtl(['stop', '-m', 'fast'])
  } else if (cmd === 'status') {
    const up = await isUp()
    console.log(up ? `running on ${PG.host}:${PG.port}` : 'not running')
    process.exit(up ? 0 : 1)
  } else {
    console.error('usage: node scripts/local-pg.mjs [stop|status]')
    process.exit(1)
  }
}
