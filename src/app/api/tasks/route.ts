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
  parseDateSafe,
  sanitize,
} from "@/lib/helpers";

export const GET = handler(async (req: Request) => {
  const user = await requirePermission("tasks:read");
  const url = new URL(req.url);
  const q = sanitize(url.searchParams.get("q"));
  const status = sanitize(url.searchParams.get("status"));
  const assigneeId = sanitize(url.searchParams.get("assigneeId"));
  const mine = url.searchParams.get("mine") === "true";

  const where = {
    AND: [
      // Developers see tasks assigned to them; others see all
      ...(user.role === "DEVELOPER" ? [{ assigneeId: user.id }] : []),
      ...(mine && user.role !== "DEVELOPER" ? [{ assigneeId: user.id }] : []),
      status ? { status } : {},
      assigneeId ? { assigneeId } : {},
      q
        ? {
            OR: [
              { taskCode: { contains: q } },
              { title: { contains: q } },
              { description: { contains: q } },
              { client: { businessName: { contains: q } } },
              { order: { orderCode: { contains: q } } },
            ],
          }
        : {},
    ],
  };

  const tasks = await db.task.findMany({
    where,
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    include: {
      assignee: {
        select: { id: true, name: true, avatarUrl: true, role: true },
      },
      creator: { select: { id: true, name: true } },
      client: { select: { id: true, businessName: true, clientCode: true } },
      order: {
        select: { id: true, orderCode: true, serviceType: true, status: true },
      },
      _count: { select: { comments: true, files: true } },
    },
  });
  return Response.json({ tasks });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("tasks:write");
  const b = await req.json().catch(() => ({}));
  const title = sanitize(b.title);
  if (!title) throw new ApiError(400, "Task title is required");

  const task = await withCodeRetry("task", "taskCode", (taskCode) =>
    db.task.create({
      data: {
        taskCode,
        title,
        description: sanitize(b.description),
        clientId: sanitize(b.clientId),
        orderId: sanitize(b.orderId),
        assigneeId: sanitize(b.assigneeId),
        creatorId: user.id,
        priority: sanitize(b.priority) ?? "Medium",
        startDate: parseDateSafe(b.startDate),
        deadline: parseDateSafe(b.deadline),
        status: sanitize(b.status) ?? "To Do",
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "task",
    entityId: task.id,
    summary: `Task created: ${task.taskCode} — ${title}`,
  });
  if (task.assigneeId && task.assigneeId !== user.id) {
    await notify({
      userId: task.assigneeId,
      title: "New task assigned to you",
      body: `${task.taskCode} — ${title}${task.deadline ? ` (due ${task.deadline.toDateString()})` : ""}.`,
      type: "task",
      link: "tasks",
    });
  }
  return Response.json({ task }, { status: 201 });
});
