import type { Role } from "@prisma/client";
import { db } from "./db";
import {
  generatePassword,
  hashPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "./auth/password";

export class UserError extends Error {}

export async function createUser(input: {
  username: string;
  displayName: string;
  role: Role;
  brandId: string | null;
  email?: string | null;
  password?: string;
  actorId?: string | null;
}) {
  const username = normalizeUsername(input.username);
  const bad = validateUsername(username);
  if (bad) throw new UserError(bad);
  if (input.role !== "owner" && !input.brandId) throw new UserError("Admin and buyer accounts need a brand");
  if (input.role === "owner" && input.brandId) throw new UserError("Owner accounts are not tied to a brand");

  const password = input.password ?? generatePassword();
  const badPw = validatePassword(password);
  if (badPw) throw new UserError(badPw);

  if (await db.user.findUnique({ where: { username } })) throw new UserError(`Username "${username}" is taken`);

  const user = await db.user.create({
    data: {
      username,
      displayName: input.displayName.trim() || username,
      email: input.email || null,
      role: input.role,
      brandId: input.brandId,
      passwordHash: await hashPassword(password),
    },
  });
  await db.auditEvent.create({
    data: {
      userId: input.actorId ?? null,
      brandId: user.brandId,
      eventType: "user.created",
      targetType: "user",
      targetId: user.id,
      metadata: { username, role: user.role },
    },
  });
  // Plaintext is returned once, so you can pass it to the client. It is never stored.
  return { user, password };
}

export async function resetPassword(username: string, password?: string, actorId?: string | null) {
  const user = await db.user.findUnique({ where: { username: normalizeUsername(username) } });
  if (!user) throw new UserError("No such user");
  const next = password ?? generatePassword();
  const bad = validatePassword(next);
  if (bad) throw new UserError(bad);
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      sessionVersion: { increment: 1 }, // signs the user out everywhere
      failedLogins: 0,
      lockedUntil: null,
    },
  });
  await db.auditEvent.create({
    data: { userId: actorId ?? null, brandId: user.brandId, eventType: "user.password_reset", targetType: "user", targetId: user.id },
  });
  return { user, password: next };
}

export async function setUserActive(username: string, active: boolean, actorId?: string | null) {
  const user = await db.user.findUnique({ where: { username: normalizeUsername(username) } });
  if (!user) throw new UserError("No such user");
  await db.user.update({
    where: { id: user.id },
    data: { active, ...(active ? {} : { sessionVersion: { increment: 1 } }) },
  });
  await db.auditEvent.create({
    data: { userId: actorId ?? null, brandId: user.brandId, eventType: active ? "user.enabled" : "user.disabled", targetType: "user", targetId: user.id },
  });
  return user;
}
