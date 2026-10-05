import { db } from "../db";
import { DUMMY_HASH, normalizeUsername, verifyPassword } from "./password";
import { createSessionToken } from "./session";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type LoginResult = { ok: true; token: string } | { ok: false; error: string };

const GENERIC = "Incorrect username or password";

export async function attemptLogin(rawUsername: string, password: string, now = new Date()): Promise<LoginResult> {
  const username = normalizeUsername(rawUsername);
  const user = await db.user.findUnique({ where: { username }, include: { brand: true } });

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return { ok: false, error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await db.auditEvent.create({
      data: { userId: user.id, brandId: user.brandId, eventType: lock ? "login.locked" : "login.failed" },
    });
    return { ok: false, error: GENERIC };
  }

  // Correct password, but a disabled account gets the same message as a wrong one.
  if (!user.active || (user.brand && !user.brand.active)) return { ok: false, error: GENERIC };

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now },
  });
  await db.auditEvent.create({ data: { userId: user.id, brandId: user.brandId, eventType: "login.success" } });
  return { ok: true, token: await createSessionToken(user.id, user.sessionVersion) };
}
