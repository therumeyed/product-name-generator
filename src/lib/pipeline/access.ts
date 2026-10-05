import type { Generation } from "@prisma/client";
import { db } from "../db";
import { HttpError, hasRole } from "../auth/guards";
import type { SessionUser } from "../auth/session";

/** buyers: their own; brand admins: their brand's; owner: everything. 404 (not 403) so ids can't be probed. */
export async function loadGenerationFor(user: SessionUser, id: string): Promise<Generation> {
  const g = await db.generation.findUnique({ where: { id } });
  const allowed = g && (user.role === "owner" || (g.brandId === user.brandId && (g.userId === user.id || hasRole(user, "admin"))));
  if (!g || !allowed) throw new HttpError(404, "Not found");
  return g;
}

/** Shape returned to the browser. Provider error text is admin-only; credentials never exist in this data. */
export function presentGeneration(g: Generation, user: SessionUser) {
  const usage = (g.usage ?? {}) as { errorMessage?: string };
  const isAdmin = hasRole(user, "admin");
  return {
    id: g.id, status: g.status, confidence: g.confidence, createdAt: g.createdAt, durationMs: g.durationMs,
    input: g.originalInput, facts: g.extractedFacts, evidence: g.candidateEvidence, result: g.result,
    errorCode: g.errorCode,
    ...(isAdmin ? { errorMessage: usage.errorMessage ?? null, usage: g.usage, promptVersions: g.promptVersions, modelName: g.modelName } : {}),
  };
}
