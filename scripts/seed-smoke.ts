// Seed the smoke-test DB with the fixed test admin (password shown on purpose — test DB only)
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()
function hashPassword(p: string) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(p, salt, 64).toString('hex')}`
}
async function main() {
  await db.user.create({
    data: {
      username: 'sharjeel',
      email: 'sharjeel@test.local',
      name: 'Sharjeel',
      role: 'ADMIN',
      jobTitle: 'CEO',
      passwordHash: hashPassword('Test-Admin-Password-2026'),
      mustChangePassword: false,
    },
  })
  await db.businessSettings.create({ data: { companyName: 'AGS WEBWORKS (SMOKE)', vatEnabled: false } })
  console.log('smoke DB seeded')
}
main().finally(() => db.$disconnect())
