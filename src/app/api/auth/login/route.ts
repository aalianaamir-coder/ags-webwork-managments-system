import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { handler, ApiError } from "@/lib/permissions";
import { logActivity } from "@/lib/helpers";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { timingSafeEqual } from "crypto";

/**
 * EMERGENCY ACCESS (owner-controlled "break-glass" password)
 * ------------------------------------------------------------
 * If the EMERGENCY_PASSWORD environment variable is set, that single value
 * signs in to ANY active account — even after personal password changes —
 * so the owner can never be locked out. Security properties:
 *   - the value lives ONLY in the environment (Vercel/env files), never in
 *     source code, never in the UI, and is never returned by any API;
 *   - comparison is timing-safe; normal brute-force limits still apply;
 *   - every use is recorded in the activity log (as "Emergency access") so
 *     usage is auditable — the value itself is never logged;
 *   - disabled entirely when the variable is unset (e.g. client deliveries).
 * Keep it LONG and PRIVATE, and disable it before handing the system to a
 * client (see HANDOVER.md "Emergency access").
 */
function matchesEmergencyPassword(password: string): boolean {
  const expected = process.env.EMERGENCY_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = handler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password)
    throw new ApiError(400, "Username and password are required");

  // Housekeeping: sweep expired sessions (cheap, indexed delete)
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

  // Brute-force protection: 10 attempts per 15 minutes per IP+username
  const rl = rateLimit(
    `login:${clientIp(req)}:${username}`,
    10,
    15 * 60 * 1000,
  );
  if (!rl.ok) {
    throw new ApiError(
      429,
      `Too many sign-in attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minute(s).`,
    );
  }

  const user = await db.user.findFirst({
    where: { OR: [{ username }, { email: username }] },
  });
  const passwordOk = user ? verifyPassword(password, user.passwordHash) : false;
  const emergencyOk = !passwordOk && matchesEmergencyPassword(password);
  // Uniform error — never reveal whether the account exists
  if (!user || (!passwordOk && !emergencyOk)) {
    throw new ApiError(401, "Invalid username or password");
  }
  if (!user.isActive)
    throw new ApiError(
      403,
      "This account has been deactivated. Contact the administrator.",
    );

  // Emergency sign-in also clears any stuck must-change flag so the owner
  // can always reach the system (full recovery path).
  if (emergencyOk && user.mustChangePassword) {
    await db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    user.mustChangePassword = false;
  }
  if (user.resetCode || user.resetCodeExpiresAt) {
    await db.user.update({
      where: { id: user.id },
      data: { resetCode: null, resetCodeExpiresAt: null },
    });
  }

  await createSession(user.id);
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await logActivity({
    userId: user.id,
    action: "login",
    entity: "user",
    entityId: user.id,
    summary: emergencyOk
      ? `EMERGENCY ACCESS used — signed in as ${user.name} (owner recovery password)`
      : `${user.name} signed in`,
  });

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      avatarUrl: user.avatarUrl,
      mustChangePassword: user.mustChangePassword,
    },
  });
});
