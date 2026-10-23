import { db } from "@/lib/db";
import { handler, requireUser, isAdminRole, isSuperAdmin } from "@/lib/permissions";

const ACTIVE_STATUSES = [
  "Order Confirmed",
  "Development in Progress",
  "Internal Review",
  "Client Review",
  "Revisions",
  "Ready for Delivery",
];
const DONE_STATUSES = ["Delivered", "Payment Completed", "Closed"];

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

export const GET = handler(async () => {
  const user = await requireUser();
  const now = new Date();
  const monthStart = startOfMonth();

  // ---------- Shared financial aggregates ----------
  const paymentsIn = await db.payment.aggregate({
    where: { direction: "in", receivedAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const paymentsOut = await db.payment.aggregate({
    where: { direction: "out", receivedAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const monthRevenue =
    (paymentsIn._sum.amount ?? 0) - (paymentsOut._sum.amount ?? 0);

  const allTimeIn = await db.payment.aggregate({
    where: { direction: "in" },
    _sum: { amount: true },
  });
  const allTimeOut = await db.payment.aggregate({
    where: { direction: "out" },
    _sum: { amount: true },
  });
  const totalRevenue =
    (allTimeIn._sum.amount ?? 0) - (allTimeOut._sum.amount ?? 0);

  const approvedExpenses = await db.expense.aggregate({
    where: { status: "Approved" },
    _sum: { amount: true },
  });
  const monthExpenses = await db.expense.aggregate({
    where: { status: "Approved", spentAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const pendingExpenses = await db.expense.count({
    where: { status: "Pending" },
  });

  // Outstanding balances per order
  const orders = await db.order.findMany({
    select: {
      id: true,
      agreedPrice: true,
      status: true,
      internalDeadline: true,
      deliveryDate: true,
      orderCode: true,
      serviceType: true,
      priority: true,
      developerId: true,
      coordinatorId: true,
      clientId: true,
      createdAt: true,
      client: { select: { businessName: true } },
    },
  });
  const paymentsByOrder = await db.payment.groupBy({
    by: ["orderId"],
    where: { orderId: { not: null } },
    _sum: { amount: true },
  });
  const paidMap = new Map(
    paymentsByOrder.map((p) => [p.orderId, p._sum.amount ?? 0]),
  );
  const ordersWithBalance = orders.map((o) => ({
    ...o,
    paid: paidMap.get(o.id) ?? 0,
    balance: Math.max(0, o.agreedPrice - (paidMap.get(o.id) ?? 0)),
  }));
  const totalOutstanding = ordersWithBalance.reduce((s, o) => s + o.balance, 0);

  // ---------- Maintenance aggregates (all roles that may see them) ----------
  const subs = await db.maintenanceSubscription.findMany({
    include: {
      plan: { select: { code: true, name: true } },
      client: { select: { businessName: true } },
    },
  });
  const activeSubs = subs.filter((s) => s.status === "Active");
  const mrr = activeSubs.reduce((s, x) => s + x.monthlyFee, 0);
  const mInvoices = await db.maintenanceInvoice.findMany({
    select: { status: true, total: true, amountPaid: true, createdAt: true },
  });
  const mInvMonth = mInvoices.filter((i) => i.createdAt >= monthStart);
  const mPaymentsRows = await db.maintenancePayment.findMany({
    where: { receivedAt: { gte: monthStart } },
    select: { amount: true },
  });
  const maintenanceStats = {
    activeClients: activeSubs.length,
    valuePlan: activeSubs.filter((s) => s.planType === "VALUE").length,
    proPlan: activeSubs.filter((s) => s.planType === "PRO").length,
    customPlan: activeSubs.filter((s) => s.planType === "CUSTOM").length,
    mrr,
    pausedSubs: subs.filter((s) => s.status === "Paused").length,
    overdueSubs: subs.filter((s) => s.status === "Overdue").length,
    paymentDueSubs: subs.filter((s) => s.status === "Payment Due").length,
    upcomingBilling: subs
      .filter(
        (s) =>
          ["Active", "Payment Due", "Overdue"].includes(s.status) &&
          s.nextBillingDate <= addDays(now, 7),
      )
      .sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime())
      .slice(0, 8)
      .map((s) => ({
        id: s.id,
        code: s.subscriptionCode,
        client: s.client.businessName,
        date: s.nextBillingDate,
        fee: s.monthlyFee,
        status: s.status,
      })),
    openTickets: await db.maintenanceTicket.count({
      where: { status: { in: ["New", "In Progress", "Waiting for Client"] } },
    }),
    invoicesThisMonth: mInvMonth.length,
    outstandingInvoices: mInvoices
      .filter((i) => ["Issued", "Partially Paid", "Overdue"].includes(i.status))
      .reduce((s, i) => s + (i.total - i.amountPaid), 0),
    paymentsReceivedMonth: mPaymentsRows.reduce((s, p) => s + p.amount, 0),
  };

  const unreadNotifications = await db.notification.count({
    where: { userId: user.id, isRead: false },
  });

  // ---------- Role-specific dashboards ----------
  if (isAdminRole(user)) {
    const [totalClients, newLeads, archived] = await Promise.all([
      db.client.count({ where: { archived: false } }),
      db.client.count({ where: { status: "Lead", archived: false } }),
      db.client.count({ where: { archived: true } }),
    ]);
    const recentActivity = await db.activityLog.findMany({
      where: isSuperAdmin(user) ? {} : { user: { hidden: false } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        user: { select: { name: true, avatarUrl: true, role: true } },
      },
    });
    const team = await db.user.findMany({
      // hidden (system) accounts never appear on the dashboard team panel
      where: { isActive: true, hidden: false },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true,
        jobTitle: true,
      },
    });
    const teamWorkload = await Promise.all(
      team.map(async (t) => ({
        ...t,
        openOrders: orders.filter(
          (o) => o.developerId === t.id && ACTIVE_STATUSES.includes(o.status),
        ).length,
        openTasks: await db.task.count({
          where: {
            assigneeId: t.id,
            status: { in: ["To Do", "In Progress", "Waiting", "Review"] },
          },
        }),
        overdueTasks: await db.task.count({
          where: {
            assigneeId: t.id,
            status: { in: ["To Do", "In Progress", "Waiting", "Review"] },
            deadline: { lt: now },
          },
        }),
      })),
    );
    return Response.json({
      role: "ADMIN",
      stats: {
        totalClients,
        newLeads,
        archivedClients: archived,
        activeProjects: orders.filter((o) => ACTIVE_STATUSES.includes(o.status))
          .length,
        completedProjects: orders.filter((o) =>
          DONE_STATUSES.includes(o.status),
        ).length,
        totalOrders: orders.length,
        paymentsThisMonth: monthRevenue,
        monthExpenses: monthExpenses._sum.amount ?? 0,
        pendingExpenseApprovals: pendingExpenses,
        totalRevenue,
        totalExpenses: approvedExpenses._sum.amount ?? 0,
        netProfit: totalRevenue - (approvedExpenses._sum.amount ?? 0),
        totalOutstanding,
        unreadNotifications,
      },
      approachingDeadlines: ordersWithBalance
        .filter(
          (o) =>
            ACTIVE_STATUSES.includes(o.status) &&
            o.internalDeadline &&
            o.internalDeadline <= addDays(now, 7),
        )
        .sort(
          (a, b) =>
            (a.internalDeadline!.getTime() ?? 0) -
            (b.internalDeadline!.getTime() ?? 0),
        )
        .slice(0, 8)
        .map((o) => ({
          id: o.id,
          code: o.orderCode,
          service: o.serviceType,
          client: o.client.businessName,
          deadline: o.internalDeadline,
          priority: o.priority,
          overdue: o.internalDeadline! < now,
        })),
      teamWorkload,
      recentActivity,
      maintenance: maintenanceStats,
    });
  }

  if (user.role === "DEVELOPER") {
    const myOrders = orders.filter(
      (o) => o.developerId === user.id || o.coordinatorId === user.id,
    );
    const myTasks = await db.task.findMany({
      where: { assigneeId: user.id },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      include: {
        client: { select: { businessName: true } },
        order: { select: { orderCode: true } },
      },
    });
    return Response.json({
      role: "DEVELOPER",
      stats: {
        myActiveProjects: myOrders.filter((o) =>
          ACTIVE_STATUSES.includes(o.status),
        ).length,
        myCompletedProjects: myOrders.filter((o) =>
          DONE_STATUSES.includes(o.status),
        ).length,
        tasksInProgress: myTasks.filter((t) => t.status === "In Progress")
          .length,
        tasksTodo: myTasks.filter((t) => t.status === "To Do").length,
        awaitingReview: myOrders.filter((o) =>
          ["Internal Review", "Client Review"].includes(o.status),
        ).length,
        overdueTasks: myTasks.filter(
          (t) =>
            ["To Do", "In Progress", "Waiting", "Review"].includes(t.status) &&
            t.deadline &&
            t.deadline < now,
        ).length,
        unreadNotifications,
      },
      myProjects: myOrders
        .filter((o) => ACTIVE_STATUSES.includes(o.status))
        .map((o) => ({
          id: o.id,
          code: o.orderCode,
          service: o.serviceType,
          client: o.client.businessName,
          status: o.status,
          priority: o.priority,
          internalDeadline: o.internalDeadline,
          deliveryDate: o.deliveryDate,
        })),
      upcomingDeadlines: myTasks
        .filter(
          (t) =>
            ["To Do", "In Progress", "Waiting", "Review"].includes(t.status) &&
            t.deadline,
        )
        .slice(0, 8)
        .map((t) => ({
          id: t.id,
          code: t.taskCode,
          title: t.title,
          deadline: t.deadline,
          status: t.status,
          overdue: t.deadline! < now,
        })),
      recentlyAssigned: myOrders
        .filter((o) => o.createdAt >= addDays(now, -14))
        .slice(0, 6)
        .map((o) => ({
          id: o.id,
          code: o.orderCode,
          service: o.serviceType,
          client: o.client.businessName,
          status: o.status,
          createdAt: o.createdAt,
        })),
      maintenanceTickets: await db.maintenanceTicket.count({
        where: {
          assigneeId: user.id,
          status: { in: ["New", "In Progress", "Waiting for Client"] },
        },
      }),
    });
  }

  // ACCOUNTANT
  const recentPayments = await db.payment.findMany({
    orderBy: { receivedAt: "desc" },
    take: 10,
    include: {
      client: { select: { businessName: true } },
      order: { select: { orderCode: true } },
    },
  });
  const overdueInvoices = await db.invoice.count({
    where: {
      status: { in: ["Issued", "Partially Paid"] },
      dueDate: { lt: now },
    },
  });
  const pendingOrders = ordersWithBalance.filter((o) =>
    ACTIVE_STATUSES.includes(o.status),
  );
  return Response.json({
    role: "ACCOUNTANT",
    stats: {
      paymentsReceivedMonth: monthRevenue,
      pendingPayments: totalOutstanding,
      overdueInvoices,
      monthExpenses: monthExpenses._sum.amount ?? 0,
      monthNet: monthRevenue - (monthExpenses._sum.amount ?? 0),
      totalRevenue,
      totalExpenses: approvedExpenses._sum.amount ?? 0,
      netProfit: totalRevenue - (approvedExpenses._sum.amount ?? 0),
      pendingExpenseApprovals: pendingExpenses,
      unreadNotifications,
    },
    ordersAwaitingTracking: pendingOrders
      .sort(
        (a, b) =>
          (a.deliveryDate?.getTime() ?? Infinity) -
          (b.deliveryDate?.getTime() ?? Infinity),
      )
      .slice(0, 10)
      .map((o) => ({
        id: o.id,
        code: o.orderCode,
        service: o.serviceType,
        client: o.client.businessName,
        status: o.status,
        deliveryDate: o.deliveryDate,
        internalDeadline: o.internalDeadline,
        balance: o.balance,
        overdue:
          (o.deliveryDate ?? o.internalDeadline ?? null) !== null &&
          (o.deliveryDate ?? o.internalDeadline)! < now,
      })),
    ordersAwaitingClosure: ordersWithBalance
      .filter((o) => o.status === "Delivered" && o.balance > 0)
      .slice(0, 10)
      .map((o) => ({
        id: o.id,
        code: o.orderCode,
        client: o.client.businessName,
        balance: o.balance,
        deliveredAt: o.status,
      })),
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      code: p.paymentCode,
      client: p.client.businessName,
      amount: p.amount,
      direction: p.direction,
      method: p.method,
      receivedAt: p.receivedAt,
    })),
    maintenance: maintenanceStats,
  });
});
