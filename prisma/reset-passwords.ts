// AGS WEBWORKS — reset the three team account passwords.
// Usage: bunx tsx prisma/reset-passwords.ts
// Resets each account to its initial password (username = password, per owner
// policy v2.1) and signs out all sessions. Leaves all other data untouched.
// For STRONG random passwords instead (recommended for client handover),
// run with: --strong

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync, randomInt } from 'crypto'
import { writeFileSync } from 'fs'

const db = new PrismaClient()

const PASSWORD_CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxy',
  digits: '23456789',
  safe: '!@%-_',
}

function generateStrongPassword(name: string): string {
  const all = PASSWORD_CHARSETS.upper + PASSWORD_CHARSETS.lower + PASSWORD_CHARSETS.digits + PASSWORD_CHARSETS.safe
  let pwd = ''
  for (let i = 0; i < 16; i++) pwd += all[randomInt(0, all.length)]
  return `AGS-${name}-${pwd}`
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

async function main() {
  const accounts = [
    { username: 'sharjeel', name: 'Sharjeel' },
    { username: 'gufran', name: 'Gufran' },
    { username: 'addan', name: 'Addan' },
  ]

  const strong = process.argv.includes('--strong')

  const lines: string[] = [
    '==============================================================',
    ' AGS WEBWORKS — Initial Login Credentials (PRIVATE)',
    ' Generated ' + new Date().toISOString(),
    strong
      ? ' Strong random passwords generated — change at first login.'
      : ' Sign-in: username = password (e.g. sharjeel / sharjeel).',
    ' Regenerate with: bunx tsx prisma/reset-passwords.ts [--strong]',
    '==============================================================',
    '',
  ]

  for (const acc of accounts) {
    const user = await db.user.findUnique({ where: { username: acc.username } })
    if (!user) {
      console.error(`✗ Account "${acc.username}" not found — run the seed first`)
      continue
    }
    const password = strong ? generateStrongPassword(acc.name) : acc.username
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        mustChangePassword: strong,
        resetCode: null,
        resetCodeExpiresAt: null,
        isActive: true,
      },
    })
    await db.session.deleteMany({ where: { userId: user.id } })
    console.log(`✓ ${acc.name}: password reset${strong ? ' (strong, change at first login)' : ' (username = password)'}`)
    lines.push(`${acc.name.padEnd(10)} username: ${acc.username}`)
    lines.push(`${''.padEnd(10)} password: ${password}`)
    lines.push(`${''.padEnd(10)} role: ${user.role} — ${user.jobTitle}`)
    lines.push('')
  }

  writeFileSync('CREDENTIALS.txt', lines.join('\n') + '\n', { mode: 0o600 })
  console.log('\nCredentials saved to CREDENTIALS.txt')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
