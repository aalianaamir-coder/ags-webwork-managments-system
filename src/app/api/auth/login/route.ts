import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { handler, ApiError } from "@/lib/permissions";
import { logActivity } from "@/lib/helpers";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const POST = handler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password)
    throw new ApiError(400, "Username and password are required");

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
  // Uniform error — never reveal whether the account exists
  if (!user || !passwordOk) {
    throw new ApiError(401, "Invalid username or password");
  }
  if (!user.isActive)
    throw new ApiError(
      403,
      "This account has been deactivated. Contact the administrator.",
    );

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
    summary: `${user.name} signed in`,
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
