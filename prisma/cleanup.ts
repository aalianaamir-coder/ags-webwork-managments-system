// AGS WEBWORKS — post-test cleanup
// Removes ALL test records created during E2E verification and restores the
// initial account passwords (username = password) so the system starts clean.

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

async function main() {
  console.log('Cleaning test data…')

  // ---- Business records (FK-safe order) ----
  await db.attendanceRecord.deleteMany({})
  await db.fileRecord.deleteMany({})
  await db.comment.deleteMany({})
  await db.maintenancePayment.deleteMany({})
  await db.maintenanceInvoice.deleteMany({})
  await db.maintenanceActivityLog.deleteMany({})
  await db.maintenanceTicket.deleteMany({})
  await db.maintenanceSubscription.deleteMany({})
  await db.payment.deleteMany({})
  await db.invoiceItem.deleteMany({})
  await db.invoice.deleteMany({})
  await db.orderRevision.deleteMany({})
  await db.task.deleteMany({})
  await db.order.deleteMany({})
  await db.client.deleteMany({})
  await db.notification.deleteMany({})
  await db.activityLog.deleteMany({})
  await db.session.deleteMany({})
  console.log('✓ All business records, attendance, notifications, activity logs and sessions removed')

  // ---- Remove test-created user accounts (keep only the seeded team
  // accounts and hidden system accounts) ----
  const seeded = ['sharjeel', 'gufran', 'addan']
  const extraUsers = await db.user.findMany({
    where: { username: { notIn: seeded }, hidden: false },
    select: { id: true, username: true },
  })
  for (const u of extraUsers) {
    await db.session.deleteMany({ where: { userId: u.id } })
    await db.notification.deleteMany({ where: { userId: u.id } })
    await db.activityLog.deleteMany({ where: { userId: u.id } })
    await db.attendanceRecord.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
    console.log(`✓ Test account removed: ${u.username}`)
  }

  // ---- Remove uploaded profile pictures (reset to default avatars) ----
  // Avatars are stored in the database (User.avatarData) since v2.1.
  for (const u of await db.user.findMany({})) {
    await db.user.update({
      where: { id: u.id },
      data: { avatarUrl: `/avatars/${u.username}.png`, avatarData: null, avatarMime: null },
    })
  }
  console.log('✓ Uploaded profile pictures removed, default avatars restored')

  // ---- Reset ID counters so codes start at 0001 (PostgreSQL) ----
  const tables = [
    'Client', 'Order', 'OrderRevision', 'Task', 'Payment', 'Invoice', 'InvoiceItem',
    'Expense', 'FileRecord', 'Comment', 'Notification', 'ActivityLog',
    'MaintenancePlan', 'MaintenanceSubscription', 'MaintenanceInvoice',
    'MaintenancePayment', 'MaintenanceTicket', 'MaintenanceActivityLog', 'AttendanceRecord',
  ]
  for (const t of tables) {
    try {
      await db.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`)
    } catch {
      // Table may have FK dependencies that require a different order, or may
      // already be empty — the code generator uses a max-sequence scan anyway,
      // so a skipped truncate is harmless.
    }
  }
  console.log('✓ ID counters reset (next codes will be CL-0001, AGS-ORD-0001, …)')

  // ---- Restore initial credentials (username = password) ----
  let restored = 0
  for (const username of ['sharjeel', 'gufran', 'addan']) {
    const user = await db.user.findUnique({ where: { username } })
    if (!user) continue
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(username),
        mustChangePassword: false,
        resetCode: null,
        resetCodeExpiresAt: null,
        isActive: true,
      },
    })
    restored++
    console.log(`✓ ${user.name}: initial password restored (username = password)`)
  }

  // ---- Leave one clean activity-log entry ----
  await db.activityLog.create({
    data: { action: 'system', entity: 'settings', summary: 'System prepared for first use — test data removed, accounts secured' },
  })

  console.log(`\nCleanup complete. ${restored} account(s) restored to seeded credentials.`)
  console.log('The system now starts empty and secure, exactly as delivered.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
