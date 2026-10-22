// AGS WEBWORKS — seed script
// Creates the three team accounts, the maintenance plans, and business
// settings. NO fake business data is seeded.
//
// Each new account receives a random temporary password and must change it at
// first sign-in. Credentials are written to the ignored CREDENTIALS.txt file.
//
// SAFETY: the output file defaults to CREDENTIALS.txt but can be overridden with
// the CREDENTIALS_FILE env var — e.g. when seeding an isolated TEST database:
//   CREDENTIALS_FILE=CREDENTIALS.test.txt DATABASE_URL=... bunx tsx prisma/seed.ts

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync, randomInt } from 'crypto'
import { writeFileSync, existsSync, readFileSync } from 'fs'

const db = new PrismaClient()

const PASSWORD_CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  digits: '23456789',
  special: '!@#$%&*?',
}

function generateStrongPassword(name: string): string {
  // ~20 chars: Name prefix + 16 random chars across charsets (for rotations)
  const all = PASSWORD_CHARSETS.upper + PASSWORD_CHARSETS.lower + PASSWORD_CHARSETS.digits + PASSWORD_CHARSETS.special
  let pwd = ''
  for (let i = 0; i < 16; i++) pwd += all[randomInt(0, all.length)]
  return `AGS-${name}-${pwd}`
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

async function main() {
  console.log('Seeding AGS WEBWORKS management system...')

  // ---------- Preflight: schema must exist ----------
  try {
    await db.businessSettings.count()
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code
    if (code === 'P2021' || code === 'P2022') {
      console.error('\n✗ The database schema does not exist yet.')
      console.error('  Initialize it first with:   bun run db:push')
      console.error('  Then run the seed again:    bunx tsx prisma/seed.ts\n')
      process.exit(1)
    }
    throw e
  }

  // ---------- Business settings ----------
  const settingsCount = await db.businessSettings.count()
  if (settingsCount === 0) {
    await db.businessSettings.create({
      data: {
        companyName: 'AGS WEBWORKS',
        tagline: 'Your Website • Our Expertise',
        website: 'https://agswebworks.com',
        email: 'info@agswebworks.com',
        city: 'Dammam',
        country: 'Saudi Arabia',
        currency: 'SAR',
        timezone: 'Asia/Riyadh',
        defaultLanguage: 'en',
        paymentInstructions:
          'Bank transfer details are shared separately. Please mention the invoice number when making the transfer.',
        invoiceFooter: 'Thank you for trusting AGS WEBWORKS with your online presence.',
      },
    })
    console.log('✓ Business settings created')
  }

  // ---------- Team accounts ----------
  const accounts = [
    {
      username: 'sharjeel',
      email: 'sharjeel@agswebworks.com',
      name: 'Sharjeel',
      role: 'ADMIN',
      jobTitle: 'CEO & Marketing',
      avatarUrl: '/avatars/sharjeel.png',
    },
    {
      username: 'gufran',
      email: 'gufran@agswebworks.com',
      name: 'Gufran',
      role: 'DEVELOPER',
      jobTitle: 'Web Developer',
      avatarUrl: '/avatars/gufran.png',
    },
    {
      username: 'addan',
      email: 'addan@agswebworks.com',
      name: 'Addan',
      role: 'ACCOUNTANT',
      jobTitle: 'Accountant & Order Tracking',
      avatarUrl: '/avatars/addan.png',
    },
  ]

  const credentials: string[] = []
  credentials.push('==============================================================')
  credentials.push(' AGS WEBWORKS — Initial Login Credentials (PRIVATE)')
  credentials.push(' Generated ' + new Date().toISOString())
  credentials.push(' Random temporary passwords; change each password at first sign-in.')
  credentials.push('==============================================================')
  credentials.push('')

  for (const acc of accounts) {
    const existing = await db.user.findUnique({ where: { username: acc.username } })
    if (existing) {
      credentials.push(`${acc.name.padEnd(10)} — existing account kept (username: ${acc.username})`)
      continue
    }
    const password = generateStrongPassword(acc.name)
    const user = await db.user.create({
      data: {
        ...acc,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
      },
    })
    await db.activityLog.create({
      data: {
        userId: user.id,
        action: 'create',
        entity: 'user',
        entityId: user.id,
        summary: `Account created: ${user.name} (${user.role}) via secure seed process`,
      },
    })
    credentials.push(`${acc.name.padEnd(10)} username: ${acc.username}`)
    credentials.push(`${''.padEnd(10)} password: ${password}`)
    credentials.push(`${''.padEnd(10)} role: ${acc.role} — ${acc.jobTitle}`)
    credentials.push('')
  }

  // ---------- Maintenance plans ----------
  const planCount = await db.maintenancePlan.count()
  if (planCount === 0) {
    const admin = await db.user.findUnique({ where: { username: 'sharjeel' } })
    await db.maintenancePlan.create({
      data: {
        code: 'VALUE',
        name: 'Value Maintenance Plan',
        description: 'Essential monthly care to keep your website healthy, secure and up to date.',
        monthlyPrice: null, // CEO configures pricing before offering to clients
        features: JSON.stringify([
          'Basic website maintenance and health checks',
          'Minor text and image updates',
          'Basic bug fixes',
          'Website uptime and functionality checks',
          'Basic technical support',
          'Monthly maintenance summary',
        ]),
        exclusions: 'New feature development, major redesigns, third-party licence costs, and content creation are not included.',
        sortOrder: 1,
        updatedById: admin?.id,
      },
    })
    await db.maintenancePlan.create({
      data: {
        code: 'PRO',
        name: 'Pro Maintenance Plan',
        description: 'Everything in Value, plus priority support and deeper monthly care.',
        monthlyPrice: null, // CEO configures pricing before offering to clients
        features: JSON.stringify([
          'Everything included in the Value plan',
          'Priority technical support',
          'More frequent website checks',
          'Minor design and layout improvements',
          'Content and image updates',
          'Performance and functionality checks',
          'Backup checks and recovery assistance (where supported by hosting)',
          'Monthly maintenance report',
          'Priority handling of reported issues',
        ]),
        exclusions: 'New feature development, major redesigns, third-party licence and hosting upgrade costs are not included.',
        sortOrder: 2,
        updatedById: admin?.id,
      },
    })
    console.log('✓ Maintenance plans created (prices to be configured by CEO)')
  }

  // Persist credentials file (path overridable for test databases)
  const credFile = process.env.CREDENTIALS_FILE || 'CREDENTIALS.txt'
  writeFileSync(credFile, credentials.join('\n') + '\n', { mode: 0o600 })
  console.log('\n' + credentials.join('\n'))
  console.log(`Credentials saved to ${credFile}`)
  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
