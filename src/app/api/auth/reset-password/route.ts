import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroyAllUserSessions,
} from "@/lib/auth";
import {
  handler,
  ApiError,
  requirePermission,
  requireUser,
  isSuperAdmin,
} from "@/lib/permissions";
import { logActivity, notify } from "@/lib/helpers";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { randomBytes, timingSafeEqual } from "crypto";

/**
 * Password reset process (no public email service in this deployment):
 * - Step 1 (request): a logged-in administrator generates a one-time reset
 *   code for a team member from Team Management. The code is shown ONCE,
 *   who shares it with the member over a secure channel.
 * - Step 2 (confirm): the member logs in with the old password (or uses the
 *   reset flow on the login screen) and sets a new password with the code.
 * - admin-set: the hidden oversight role may set a new password for any
 *   visible account directly (sessions revoked, member notified).
 *
 * POST /api/auth/reset-password
 *   { action: "generate", userId }            — admin only, returns one-time code
 *   { action: "confirm", username, code, newPassword }  — public, code-gated
 *   { action: "admin-set", userId, newPassword }         — oversight role only
 */
export const POST = handler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "generate") {
    const admin = await requirePermission("team:manage");
    const target = await db.user.findUnique({
      where: { id: String(body.userId ?? "") },
    });
    // Hidden (system) accounts are invisible to everyone except the
    // oversight role itself.
    if (!target || (target.hidden && !isSuperAdmin(admin)))
      throw new ApiError(404, "Team member not found");
    const code = randomBytes(5).toString("hex").toUpperCase(); // 10-char code
    await db.user.update({
      where: { id: target.id },
      data: {
        resetCode: code,
        resetCodeExpiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });
    await logActivity({
      userId: admin.id,
      action: "update",
      entity: "user",
      entityId: target.id,
      summary: `Password reset code generated for ${target.name}`,
    });
    return Response.json({
      ok: true,
      code,
      expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      message: `Share this code with ${target.name} securely. It expires in 30 minutes.`,
    });
  }

  if (action === "admin-set") {
    // Direct password set — hidden oversight role only.
    const admin = await requireUser();
    if (!isSuperAdmin(admin))
      throw new ApiError(403, "You do not have permission to perform this action");
    const target = await db.user.findUnique({
      where: { id: String(body.userId ?? "") },
    });
    if (!target || (target.hidden && target.id !== admin.id))
      throw new ApiError(404, "Team member not found");
    const newPassword = String(body.newPassword ?? "");
    if (newPassword.length < 8)
      throw new ApiError(400, "New password must be at least 8 characters");
    if (verifyPassword(newPassword, target.passwordHash))
      throw new ApiError(
        400,
        "New password must be different from the previous one",
      );

    await db.user.update({
      where: { id: target.id },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        resetCode: null,
        resetCodeExpiresAt: null,
      },
    });
    // Force re-authentication everywhere (except the acting account itself,
    // so an oversight session is never accidentally killed).
    if (target.id !== admin.id) await destroyAllUserSessions(target.id);

    await logActivity({
      userId: admin.id,
      action: "update",
      entity: "user",
      entityId: target.id,
      summary:
        target.id === admin.id
          ? `Oversight account password changed`
          : `Password set for ${target.name} by the system administrator`,
    });
    if (target.id !== admin.id) {
      await notify({
        userId: target.id,
        title: "Password changed",
        body: "Your password was changed by the administrator. Use the new password at next sign-in.",
        type: "alert",
      });
    }
    return Response.json({ ok: true });
  }

  if (action === "confirm") {
    const username = String(body.username ?? "")
      .trim()
      .toLowerCase();
    const code = String(body.code ?? "")
      .trim()
      .toUpperCase();
    const newPassword = String(body.newPassword ?? "");
    if (!username || !code || !newPassword)
      throw new ApiError(400, "All fields are required");
    if (newPassword.length < 8)
      throw new ApiError(400, "New password must be at least 8 characters");

    // Code-guessing protection: 6 attempts per 15 minutes per IP+username
    const rl = rateLimit(
      `reset:${clientIp(req)}:${username}`,
      6,
      15 * 60 * 1000,
    );
    if (!rl.ok) {
      throw new ApiError(
        429,
        `Too many attempts. Try again in ${Math.ceil(rl.retryAfterSec / 60)} minute(s).`,
      );
    }

    const user = await db.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });
    if (!user || !user.resetCode || !user.resetCodeExpiresAt)
      throw new ApiError(400, "No reset code was issued for this account");
    if (user.resetCodeExpiresAt < new Date())
      throw new ApiError(
        400,
        "This reset code has expired. Ask the administrator for a new one.",
      );
    // Constant-time comparison (codes are fixed-length hex)
    const codeBuf = Buffer.from(code);
    const storedBuf = Buffer.from(user.resetCode);
    if (
      codeBuf.length !== storedBuf.length ||
      !timingSafeEqual(codeBuf, storedBuf)
    )
      throw new ApiError(400, "Invalid reset code");
    if (verifyPassword(newPassword, user.passwordHash))
      throw new ApiError(
        400,
        "New password must be different from the previous one",
      );

    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        resetCode: null,
        resetCodeExpiresAt: null,
      },
    });
    await logActivity({
      userId: user.id,
      action: "update",
      entity: "user",
      entityId: user.id,
      summary: `${user.name} reset their password using a reset code`,
    });
    await notify({
      userId: user.id,
      title: "Password changed",
      body: "Your password was reset successfully.",
      type: "alert",
    });
    // Auto-login after successful reset
    await createSession(user.id);
    return Response.json({ ok: true });
  }

  throw new ApiError(400, "Unknown action");
});
