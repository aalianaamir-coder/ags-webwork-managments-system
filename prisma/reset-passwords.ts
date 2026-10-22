// AGS WEBWORKS — reset the three team account passwords.
// Generates temporary random credentials and requires a change at next sign-in.

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

  const lines: string[] = [
    '==============================================================',
    ' AGS WEBWORKS — Initial Login Credentials (PRIVATE)',
    ' Generated ' + new Date().toISOString(),
    ' Random temporary passwords generated — change at first sign-in.',
    ' Regenerate with: bunx tsx prisma/reset-passwords.ts',
    '==============================================================',
    '',
  ]

  for (const acc of accounts) {
    const user = await db.user.findUnique({ where: { username: acc.username } })
    if (!user) {
      console.error(`✗ Account "${acc.username}" not found — run the seed first`)
      continue
    }
    const password = generateStrongPassword(acc.name)
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        resetCode: null,
        resetCodeExpiresAt: null,
        isActive: true,
      },
    })
    await db.session.deleteMany({ where: { userId: user.id } })
    console.log(`✓ ${acc.name}: random temporary password set; change it at first sign-in`)
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
