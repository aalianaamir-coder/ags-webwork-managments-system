import { db } from "@/lib/db";
import {
  handler,
  ApiError,
  requirePermission,
  requireUser,
} from "@/lib/permissions";
import {
  logActivity,
  notify,
  withCodeRetry,
  sanitize,
  parseDateSafe,
} from "@/lib/helpers";

const TICKET_STATUSES = [
  "New",
  "In Progress",
  "Waiting for Client",
  "Completed",
  "Closed",
];

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const status = sanitize(url.searchParams.get("status"));
  const q = sanitize(url.searchParams.get("q"));
  const mine = url.searchParams.get("mine") === "true";

  let tickets = await db.maintenanceTicket.findMany({
    where: {
      AND: [
        status ? { status } : {},
        q
          ? {
              OR: [
                { ticketCode: { contains: q } },
                { issue: { contains: q } },
                { client: { businessName: { contains: q } } },
                { subscription: { domain: { contains: q } } },
              ],
            }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
          clientCode: true,
          phone: true,
          whatsapp: true,
        },
      },
      subscription: { include: { plan: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { comments: true, files: true } },
    },
  });

  if (user.role === "DEVELOPER" || mine) {
    tickets = tickets.filter((t) => t.assigneeId === user.id);
  }

  // Attach remaining support allowance from the plan (for this calendar month)
  const enriched = await Promise.all(
    tickets.map(async (t) => {
      if (!t.subscriptionId)
        return { ...t, supportUsedThisMonth: null, supportRemaining: null };
      const monthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      );
      const used = await db.maintenanceTicket.count({
        where: {
          subscriptionId: t.subscriptionId,
          createdAt: { gte: monthStart },
        },
      });
      const limit = t.subscription?.plan?.supportLimit ?? null;
      return {
        ...t,
        supportUsedThisMonth: used,
        supportRemaining: limit === null ? null : Math.max(0, limit - used),
      };
    }),
  );
  return Response.json({ tickets, statuses: TICKET_STATUSES });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("tickets:write");
  const b = await req.json().catch(() => ({}));
  const clientId = sanitize(b.clientId);
  const issue = sanitize(b.issue);
  if (!clientId) throw new ApiError(400, "Client is required");
  if (!issue) throw new ApiError(400, "Issue description is required");

  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ApiError(404, "Client not found");

  let planSnapshot: string | null = null;
  if (sanitize(b.subscriptionId)) {
    const sub = await db.maintenanceSubscription.findUnique({
      where: { id: sanitize(b.subscriptionId)! },
      include: { plan: true },
    });
    if (sub) planSnapshot = sub.plan.name;
  }

  const ticket = await withCodeRetry("ticket", "ticketCode", (ticketCode) =>
    db.maintenanceTicket.create({
      data: {
        ticketCode,
        subscriptionId: sanitize(b.subscriptionId),
        clientId,
        orderId: sanitize(b.orderId),
        planSnapshot,
        issue,
        priority: sanitize(b.priority) ?? "Medium",
        assigneeId: sanitize(b.assigneeId),
        expectedCompletion: parseDateSafe(b.expectedCompletion),
        status: "New",
        outOfScope: Boolean(b.outOfScope),
      },
      include: { client: { select: { businessName: true } } },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "ticket",
    entityId: ticket.id,
    summary: `Maintenance ticket created: ${ticket.ticketCode} — ${client.businessName}${ticket.outOfScope ? " (OUT OF SCOPE — needs quotation)" : ""}`,
  });
  if (ticket.assigneeId && ticket.assigneeId !== user.id) {
    await notify({
      userId: ticket.assigneeId,
      title: "New maintenance request assigned to you",
      body: `${ticket.ticketCode} — ${client.businessName}: ${issue.slice(0, 80)}`,
      type: "maintenance",
      link: "maintenance-tickets",
    });
  }
  return Response.json({ ticket }, { status: 201 });
});
