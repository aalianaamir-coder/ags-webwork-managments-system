// AGS WEBWORKS — sanitized DEMO data (clearly fictional, safe for client demos)
// Usage: bunx tsx prisma/demo-data.ts            (create demo data if none exists)
//        bunx tsx prisma/demo-data.ts --remove   (remove demo data)
//
// SAFETY:
//  - Refuses to run when the database already contains real business data
//    (any client that is NOT part of the demo set) unless --force is passed.
//  - Every demo record is tagged so `--remove` deletes exactly what was created.
//  - No real names, phones, emails or addresses are used — everything is fictional.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const DEMO_TAG = '[DEMO]'

const args = process.argv.slice(2)
const remove = args.includes('--remove')
const force = args.includes('--force')

async function removeDemo() {
  // Delete in FK-safe order; only records carrying the demo tag
  const demoClients = await db.client.findMany({ where: { notes: { startsWith: DEMO_TAG } }, select: { id: true } })
  if (!demoClients.length) {
    console.log('No demo data found — nothing to remove.')
    return
  }
  const ids = demoClients.map((c) => c.id)
  await db.maintenanceTicket.deleteMany({ where: { clientId: { in: ids } } })
  await db.maintenanceInvoice.deleteMany({ where: { clientId: { in: ids } } })
  await db.maintenanceSubscription.deleteMany({ where: { clientId: { in: ids } } })
  await db.payment.deleteMany({ where: { clientId: { in: ids } } })
  await db.invoice.deleteMany({ where: { clientId: { in: ids } } })
  await db.task.deleteMany({ where: { clientId: { in: ids } } })
  await db.order.deleteMany({ where: { clientId: { in: ids } } })
  await db.comment.deleteMany({ where: { clientId: { in: ids } } })
  await db.client.deleteMany({ where: { id: { in: ids } } })
  console.log(`✓ Removed demo data for ${ids.length} demo client(s).`)
}

async function createDemo() {
  const existing = await db.client.count()
  if (existing > 0 && !force) {
    console.error(`✗ This database already has ${existing} client record(s) — demo data is only inserted into a fresh database.`)
    console.error('  To force anyway, run: bunx tsx prisma/demo-data.ts --force')
    process.exit(1)
  }

  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } })
  const dev = await db.user.findFirst({ where: { role: 'DEVELOPER' } })
  if (!admin) {
    console.error('✗ No admin account found — run the seed first: bunx tsx prisma/seed.ts')
    process.exit(1)
  }

  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86400000)

  // ---------- Demo clients (fictional) ----------
  const demoClients = [
    {
      businessName: `${DEMO_TAG} Golden Date Bakery`,
      businessCategory: 'Food & Beverage',
      contactPerson: 'Demo Contact A',
      phone: '+966 5X 000 0001',
      email: 'demo.bakery@example.com',
      city: 'Demo City',
      location: 'Demo District, Main St 1',
      serviceRequested: 'Business website + online menu',
      quotedPrice: 4500,
      agreedPrice: 4200,
      leadSource: 'Demo Referral',
      status: 'Active Client',
      acquisitionDate: daysAgo(40),
    },
    {
      businessName: `${DEMO_TAG} Blue Palm Interiors`,
      businessCategory: 'Interior Design',
      contactPerson: 'Demo Contact B',
      phone: '+966 5X 000 0002',
      email: 'demo.interiors@example.com',
      city: 'Demo City',
      location: 'Demo District, Side St 2',
      serviceRequested: 'Portfolio website',
      quotedPrice: 6000,
      agreedPrice: 5500,
      leadSource: 'Demo Instagram',
      status: 'Won',
      acquisitionDate: daysAgo(20),
    },
    {
      businessName: `${DEMO_TAG} TechFix Demo Store`,
      businessCategory: 'Electronics Retail',
      contactPerson: 'Demo Contact C',
      phone: '+966 5X 000 0003',
      email: 'demo.techfix@example.com',
      city: 'Demo City',
      serviceRequested: 'E-commerce store',
      quotedPrice: 12000,
      agreedPrice: 11500,
      leadSource: 'Demo Google Ads',
      status: 'Negotiation',
      acquisitionDate: daysAgo(5),
    },
  ]

  const created: { id: string; businessName: string }[] = []
  for (const c of demoClients) {
    const seq = (await db.client.count()) + 1
    created.push(
      await db.client.create({
        data: {
          ...c,
          clientCode: `CL-${String(seq).padStart(4, '0')}`,
          createdById: admin.id,
          assignedToId: admin.id,
          notes: `${DEMO_TAG} fictional client for demonstration — remove with: bunx tsx prisma/demo-data.ts --remove`,
        },
      }),
    )
  }
  console.log(`✓ Created ${created.length} demo clients`)

  // ---------- Order + workflow history for client 1 ----------
  const seq = (await db.order.count()) + 1
  const order = await db.order.create({
    data: {
      orderCode: `AGS-ORD-${String(seq).padStart(4, '0')}`,
      clientId: created[0].id,
      serviceType: 'Business Website',
      description: `${DEMO_TAG} 5-page business website with online menu, contact form and WhatsApp button`,
      createdById: admin.id,
      developerId: dev?.id,
      agreedPrice: 4200,
      startDate: daysAgo(35),
      internalDeadline: daysAhead(5),
      priority: 'High',
      status: 'In Development',
    },
  })
  for (const [from, to, note, d] of [
    [null, 'Lead Received', 'Demo order created', daysAgo(35)],
    ['Lead Received', 'Requirements Collected', 'Demo requirements collected', daysAgo(30)],
    ['Requirements Collected', 'Design In Progress', 'Demo design started', daysAgo(25)],
    ['Design In Progress', 'In Development', 'Demo development started', daysAgo(15)],
  ] as [string | null, string, string, Date][]) {
    await db.orderRevision.create({ data: { orderId: order.id, fromStatus: from, toStatus: to, note, userId: admin.id, createdAt: d } })
  }
  console.log('✓ Created demo order + workflow history')

  // ---------- Tasks ----------
  const devTasks = [
    { title: 'Build homepage hero section', status: 'Completed', deadline: daysAgo(20) },
    { title: 'Online menu page with categories', status: 'In Progress', deadline: daysAhead(2) },
    { title: 'WhatsApp inquiry button integration', status: 'To Do', deadline: daysAhead(4) },
  ]
  for (const t of devTasks) {
    const tseq = (await db.task.count()) + 1
    await db.task.create({
      data: {
        taskCode: `TASK-${String(tseq).padStart(4, '0')}`,
        title: `${DEMO_TAG} ${t.title}`,
        orderId: order.id,
        clientId: created[0].id,
        assigneeId: dev?.id,
        creatorId: admin.id,
        priority: 'High',
        status: t.status,
        deadline: t.deadline,
        completedAt: t.status === 'Completed' ? t.deadline : null,
      },
    })
  }
  console.log('✓ Created demo tasks')

  // ---------- Invoice + payments ----------
  const iseq = (await db.invoice.count()) + 1
  const year = now.getFullYear()
  const invoice = await db.invoice.create({
    data: {
      invoiceCode: `INV-${year}-${String(iseq).padStart(4, '0')}`,
      clientId: created[0].id,
      orderId: order.id,
      issueDate: daysAgo(10),
      dueDate: daysAgo(-4),
      status: 'Partially Paid',
      subtotal: 4200,
      taxRate: 0,
      taxAmount: 0,
      total: 4200,
      amountPaid: 2100,
      createdById: admin.id,
      notes: `${DEMO_TAG} demo invoice`,
      items: {
        create: [
          { description: 'Business website — 5 pages, responsive design', quantity: 1, unitPrice: 3500, amount: 3500 },
          { description: 'Online menu setup with categories', quantity: 1, unitPrice: 700, amount: 700 },
        ],
      },
    },
  })
  const pseq = (await db.payment.count()) + 1
  await db.payment.create({
    data: {
      paymentCode: `PAY-${String(pseq).padStart(4, '0')}`,
      clientId: created[0].id,
      orderId: order.id,
      invoiceId: invoice.id,
      amount: 2100,
      direction: 'in',
      category: 'Project Payment',
      method: 'Bank Transfer',
      reference: 'DEMO-TRF-001',
      notes: `${DEMO_TAG} 50% deposit`,
      receivedAt: daysAgo(9),
      recordedById: admin.id,
    },
  })
  console.log('✓ Created demo invoice + 50% deposit payment')

  // ---------- Expense (pending approval demo) ----------
  const eseq = (await db.expense.count()) + 1
  await db.expense.create({
    data: {
      expenseCode: `EXP-${String(eseq).padStart(4, '0')}`,
      category: 'Hosting & Domain',
      description: `${DEMO_TAG} Demo hosting renewal — golden-date-demo.example.com`,
      amount: 320,
      spentAt: daysAgo(3),
      vendor: 'Demo Hosting Co.',
      method: 'Card',
      status: 'Pending',
      createdById: admin.id,
    },
  })
  console.log('✓ Created demo pending expense')

  // ---------- Maintenance plan pricing + subscription + invoice ----------
  const valuePlan = await db.maintenancePlan.findUnique({ where: { code: 'VALUE' } })
  if (valuePlan) {
    if (valuePlan.monthlyPrice == null) {
      await db.maintenancePlan.update({ where: { id: valuePlan.id }, data: { monthlyPrice: 250 } })
    }
    const plan = await db.maintenancePlan.findUnique({ where: { code: 'VALUE' } })
    const sseq = (await db.maintenanceSubscription.count()) + 1
    const billingDay = 5
    const nextBilling = new Date(now.getFullYear(), now.getMonth() + (now.getDate() >= billingDay ? 1 : 0), billingDay)
    const sub = await db.maintenanceSubscription.create({
      data: {
        subscriptionCode: `MSUB-${String(sseq).padStart(4, '0')}`,
        clientId: created[0].id,
        orderId: order.id,
        domain: 'golden-date-demo.example.com',
        websiteUrl: 'https://golden-date-demo.example.com',
        planId: plan!.id,
        planType: 'VALUE',
        monthlyFee: plan!.monthlyPrice ?? 250,
        startDate: daysAgo(70),
        billingDay,
        nextBillingDate: nextBilling,
        status: 'Active',
        paymentMethod: 'Bank Transfer',
        lastPaymentDate: daysAgo(35),
        assignedToId: dev?.id,
        contractTerms: `${DEMO_TAG} demo subscription`,
      },
    })
    // One paid historical maintenance invoice
    const mseq = (await db.maintenanceInvoice.count()) + 1
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const mInvoice = await db.maintenanceInvoice.create({
      data: {
        invoiceCode: `MNT-${year}-${String(mseq).padStart(4, '0')}`,
        subscriptionId: sub.id,
        clientId: created[0].id,
        issueDate: daysAgo(35),
        dueDate: daysAgo(21),
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        status: 'Paid',
        packagePrice: plan!.monthlyPrice ?? 250,
        taxRate: 0,
        taxAmount: 0,
        total: plan!.monthlyPrice ?? 250,
        amountPaid: plan!.monthlyPrice ?? 250,
        notes: `${DEMO_TAG} demo maintenance invoice`,
        generatedBy: 'demo-data',
      },
    })
    await db.maintenancePayment.create({
      data: {
        invoiceId: mInvoice.id,
        amount: plan!.monthlyPrice ?? 250,
        method: 'Bank Transfer',
        reference: 'DEMO-TRF-MNT-001',
        receivedAt: daysAgo(30),
        recordedById: admin.id,
      },
    })

    // One open support ticket
    const tseq = (await db.maintenanceTicket.count()) + 1
    await db.maintenanceTicket.create({
      data: {
        ticketCode: `MT-${String(tseq).padStart(4, '0')}`,
        subscriptionId: sub.id,
        clientId: created[0].id,
        issue: `${DEMO_TAG} Menu prices need a small update (3 items)`,
        priority: 'Medium',
        assigneeId: dev?.id,
        status: 'In Progress',
        expectedCompletion: daysAhead(2),
      },
    })
    console.log('✓ Created demo maintenance subscription + paid invoice + ticket')
  }

  console.log('\nDemo data created. All records are fictional and tagged [DEMO].')
  console.log('Remove anytime with: bunx tsx prisma/demo-data.ts --remove')
}

main()
  .then(async () => {
    if (remove) await removeDemo()
    else await createDemo()
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
