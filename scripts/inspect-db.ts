// Inspect DB row counts per table (no data values printed)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const counts = {
    users: await db.user.count(),
    sessions: await db.session.count(),
    clients: await db.client.count(),
    orders: await db.order.count(),
    tasks: await db.task.count(),
    invoices: await db.invoice.count(),
    payments: await db.payment.count(),
    expenses: await db.expense.count(),
    files: await db.fileRecord.count(),
    comments: await db.comment.count(),
    notifications: await db.notification.count(),
    activityLogs: await db.activityLog.count(),
    attendance: await db.attendanceRecord.count(),
    mPlans: await db.maintenancePlan.count(),
    mSubs: await db.maintenanceSubscription.count(),
    mInvoices: await db.maintenanceInvoice.count(),
    mPayments: await db.maintenancePayment.count(),
    mTickets: await db.maintenanceTicket.count(),
    settings: await db.businessSettings.count(),
  }
  console.log(JSON.stringify(counts, null, 2))
  // usernames + roles only (not secrets)
  const users = await db.user.findMany({ select: { username: true, name: true, role: true, mustChangePassword: true, isActive: true } })
  console.log('users:', JSON.stringify(users))
  const files = await db.fileRecord.findMany({ select: { fileName: true, size: true } })
  console.log('files:', JSON.stringify(files))
}

main().catch(console.error).finally(() => db.$disconnect())
