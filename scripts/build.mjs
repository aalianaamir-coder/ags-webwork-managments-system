#!/usr/bin/env node
// AGS WEBWORKS — cross-platform production build
//
// Replaces the old Unix-only build command ("cp -r ..." fails on Windows) so
// the SAME `npm run build` works on Windows (PowerShell/cmd), macOS, Linux,
// and Vercel:
//
//   1. prisma generate  — create the Prisma client (no database needed)
//   2. next build       — production build (extra CLI args pass through,
//                         e.g. `npm run build -- --webpack`)
//   3. assemble the standalone bundle for `npm start` / self-hosting
//      (Vercel builds its own runtime — this step is harmless there).

import { spawn } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = process.env.NEXT_DIST_DIR || '.next'

// Windows: .cmd/.exe shims; Unix: the extensionless bin script.
function resolveCommand(cmd) {
  const binDir = path.join(ROOT, 'node_modules', '.bin')
  if (process.platform === 'win32') {
    for (const c of [`${cmd}.cmd`, `${cmd}.exe`]) {
      if (existsSync(path.join(binDir, c))) return path.join(binDir, c)
    }
  }
  const bin = path.join(binDir, cmd)
  if (existsSync(bin)) return bin
  return cmd
}

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(resolveCommand(cmd), args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    })
    child.on('error', (e) => {
      console.error(`[build] failed to run "${cmd}":`, e.message)
      process.exit(1)
    })
    child.on('close', (code) => {
      if (code !== 0) process.exit(code ?? 1)
      resolve()
    })
  })
}

// prisma generate never connects to a database; a placeholder URL keeps the
// toolchain happy when none is configured yet (e.g. first build on Vercel).
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://build:build@127.0.0.1:5433/build',
}

console.log('\n==> prisma generate')
await run('prisma', ['generate'], env)

console.log('\n==> next build')
await run('next', ['build', ...process.argv.slice(2)], env)

// Assemble the standalone bundle used by `npm start` (self-hosting).
const standaloneDir = path.join(ROOT, distDir, 'standalone')
if (existsSync(standaloneDir)) {
  console.log('\n==> assembling standalone bundle')
  cpSync(path.join(ROOT, distDir, 'static'), path.join(standaloneDir, distDir, 'static'), { recursive: true })
  cpSync(path.join(ROOT, 'public'), path.join(standaloneDir, 'public'), { recursive: true })
  console.log('    standalone server ready — start it with: npm start')
}

console.log('\n==> build complete')
