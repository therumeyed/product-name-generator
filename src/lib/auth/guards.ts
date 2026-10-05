import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// owner > admin > buyer
const RANK: Record<Role, number> = { buyer: 1, admin: 2, owner: 3 };
export const hasRole = (user: Pick<SessionUser, "role">, min: Role) => RANK[user.role] >= RANK[min];

/** For API routes: throws HttpError(401/403). */
export async function requireUser(min: Role = "buyer"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Not signed in");
  if (!hasRole(user, min)) throw new HttpError(403, "Not allowed");
  return user;
}

/** For pages: redirects instead of throwing. */
export async function requirePageUser(min: Role = "buyer"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRole(user, min)) redirect("/");
  return user;
}

/**
 * Brand scoping: owners may act on any brand, everyone else only on their own.
 * Every brand-owned query must go through this.
 */
export function assertBrandAccess(user: SessionUser, brandId: string) {
  if (user.role === "owner") return;
  if (user.brandId !== brandId) throw new HttpError(403, "Not allowed");
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
