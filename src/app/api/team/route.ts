import { db } from "@/lib/db";
import {
  handler,
  ApiError,
  requirePermission,
  isSuperAdmin,
  isAdminRole,
  ASSIGNABLE_ROLES,
} from "@/lib/permissions";
import { logActivity, sanitize } from "@/lib/helpers";
import { hashPassword } from "@/lib/auth";
import { randomBytes } from "crypto";

const ROLES: string[] = [...ASSIGNABLE_ROLES];
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = handler(async (_req: Request) => {
  const user = await requirePermission("team:read");
  // Hidden (system oversight) accounts are only visible to themselves.
  const users = await db.user.findMany({
    where: isSuperAdmin(user) ? {} : { hidden: false },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      jobTitle: true,
      avatarUrl: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      hidden: true,
    },
    orderBy: { createdAt: "asc" },
  });
  // Workload stats (visible to everyone — helps understand team load)
  const withLoad = await Promise.all(
    users.map(async (u) => {
      const openOrders = await db.order.count({
        where: {
          OR: [{ developerId: u.id }, { coordinatorId: u.id }],
          status: {
            in: [
              "Order Confirmed",
              "Development in Progress",
              "Internal Review",
              "Client Review",
              "Revisions",
              "Ready for Delivery",
            ],
          },
        },
      });
      const openTasks = await db.task.count({
        where: {
          assigneeId: u.id,
          status: { in: ["To Do", "In Progress", "Waiting", "Review"] },
        },
      });
      const overdueTasks = await db.task.count({
        where: {
          assigneeId: u.id,
          status: { in: ["To Do", "In Progress", "Waiting", "Review"] },
          deadline: { lt: new Date() },
        },
      });
      return { ...u, openOrders, openTasks, overdueTasks };
    }),
  );
  return Response.json({ users: withLoad, canManage: isAdminRole(user) });
});

/** Create a new team member. A temporary password is generated and shown ONCE. */
export const POST = handler(async (req: Request) => {
  const user = await requirePermission("team:manage");
  const b = await req.json().catch(() => ({}));

  const name = sanitize(b.name);
  const username = sanitize(b.username)?.toLowerCase() ?? "";
  const email = sanitize(b.email)?.toLowerCase() ?? null;
  const role = sanitize(b.role) ?? "DEVELOPER";
  const jobTitle = sanitize(b.jobTitle) ?? "";

  if (!name) throw new ApiError(400, "Full name is required");
  if (!username || !USERNAME_RE.test(username)) {
    throw new ApiError(
      400,
      "Username must be 3-30 characters (lowercase letters, numbers, dot, dash, underscore)",
    );
  }
  if (email && !EMAIL_RE.test(email))
    throw new ApiError(400, "Email address is not valid");
  if (!ROLES.includes(role)) throw new ApiError(400, "Invalid role");

  const clash = await db.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true, email: true },
  });
  if (clash) {
    throw new ApiError(
      409,
      clash.username === username
        ? `Username “${username}” is already taken`
        : `Email “${email}” is already in use`,
    );
  }

  // Temporary password: strong, shown once, must be changed at first sign-in
  const tempPassword = `AGS-${name.split(" ")[0]}-${randomBytes(12).toString("base64url")}`;
  const created = await db.user.create({
    data: {
      username,
      email: email ?? `${username}@agswebworks.local`,
      name,
      role,
      jobTitle:
        jobTitle ||
        (role === "ADMIN"
          ? "Administrator"
          : role === "DEVELOPER"
            ? "Web Developer"
            : "Accountant"),
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: true,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      jobTitle: true,
      email: true,
    },
  });
  await logActivity({
    userId: user.id,
    action: "create",
    entity: "user",
    entityId: created.id,
    summary: `Team member created: ${created.name} (${created.username}) — role ${created.role}`,
  });
  return Response.json(
    {
      user: created,
      tempPassword,
      message: `Share the temporary password with ${created.name} securely. They must change it at first sign-in.`,
    },
    { status: 201 },
  );
});

/** Update an existing team member (role, job title, active flag). */
export const PUT = handler(async (req: Request) => {
  const user = await requirePermission("team:manage");
  const b = await req.json().catch(() => ({}));
  const userId = sanitize(b.userId);
  if (!userId) throw new ApiError(400, "User is required");
  const target = await db.user.findUnique({ where: { id: userId } });
  // Hidden (system oversight) accounts do not exist as far as other users
  // are concerned — and even the oversight role cannot be re-roled from here
  // (protects the recovery path).
  if (!target || (target.hidden && !isSuperAdmin(user)))
    throw new ApiError(404, "Team member not found");
  if (target.hidden && "role" in b)
    throw new ApiError(400, "This account's role cannot be changed");

  const data: Record<string, unknown> = {};
  if ("jobTitle" in b) data.jobTitle = sanitize(b.jobTitle) ?? target.jobTitle;
  if ("isActive" in b) {
    // The hidden oversight account cannot be deactivated (lockout guard)
    if (target.hidden && !b.isActive)
      throw new ApiError(400, "This account cannot be deactivated");
    data.isActive = Boolean(b.isActive);
  }
  if ("role" in b && sanitize(b.role)) {
    const role = sanitize(b.role)!;
    if (!ROLES.includes(role)) throw new ApiError(400, "Invalid role");
    // Never allow removing the last active admin
    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await db.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (adminCount <= 1)
        throw new ApiError(409, "Cannot demote the last active administrator");
    }
    data.role = role;
  }

  const updated = await db.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      role: true,
      jobTitle: true,
      isActive: true,
    },
  });
  await logActivity({
    userId: user.id,
    action: "update",
    entity: "user",
    entityId: userId,
    summary: `Team member updated: ${updated.name} — role ${updated.role}, ${updated.isActive ? "active" : "inactive"}`,
  });
  return Response.json({ user: updated });
});
