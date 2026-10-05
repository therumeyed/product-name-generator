import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";

export const SESSION_COOKIE = "pno_session";
const SESSION_HOURS = 12;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  brandId: string | null;
  brandName: string | null;
};

const key = () => new TextEncoder().encode(env().AUTH_SECRET);

export async function createSessionToken(userId: string, sessionVersion: number) {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the cookie, re-checking the database on every request so
 * disabling a user, resetting their password or disabling their brand takes effect immediately.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await db.user.findUnique({ where: { id: payload.sub }, include: { brand: true } });
    if (!user || !user.active || user.sessionVersion !== payload.sv) return null;
    if (user.brand && !user.brand.active) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      brandId: user.brandId,
      brandName: user.brand?.name ?? null,
    };
  } catch {
    return null;
  }
}
