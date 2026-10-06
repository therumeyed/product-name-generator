import { z } from "zod";
import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser, hasRole } from "@/lib/auth/guards";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { rateLimit } from "@/lib/rateLimit";

// Start a generation. Runs in the background (single long-lived Node service); the client polls GET /api/generations/:id.
export async function POST(req: Request) {
  try {
    const user = await requireUser("buyer");
    if (!rateLimit(`gen:${user.id}`, 40, 3_600_000)) throw new HttpError(429, "Too many requests this hour. Try again later.");
    const body = await req.json().catch(() => null);
    if (!body) throw new HttpError(400, "Invalid request");
    const brandId = user.brandId ?? body.brandId; // owners pick a brand
    if (!brandId || typeof brandId !== "string") throw new HttpError(400, "brandId required");
    assertBrandAccess(user, brandId);
    const id = await createGeneration(user, brandId, body);
    void runPipeline(id).catch((e) => console.error("runPipeline crashed", id, e instanceof Error ? e.message : e));
    return Response.json({ id }, { status: 202 });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: "Enter what you'd call the product and choose a product type", issues: e.issues.map((i) => i.path.join(".")) }, { status: 400 });
    return errorResponse(e);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser("buyer");
    const url = new URL(req.url);
    const take = Math.min(50, Number(url.searchParams.get("limit") ?? 20) || 20);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const where = user.role === "owner" ? {} : hasRole(user, "admin") ? { brandId: user.brandId! } : { userId: user.id };
    const rows = await db.generation.findMany({
      where, orderBy: { createdAt: "desc" }, take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { displayName: true } }, feedback: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const page = rows.slice(0, take);
    return Response.json({
      items: page.map((g) => {
        const r = g.result as { recommendation?: { recommended_title?: string } } | null;
        const fb = g.feedback[0];
        return { id: g.id, createdAt: g.createdAt, input: (g.originalInput as { freeText?: string }).freeText, recommended: r?.recommendation?.recommended_title ?? null, finalTitle: fb?.finalTitle ?? (fb?.outcome === "used" ? r?.recommendation?.recommended_title : null) ?? null, outcome: fb?.outcome ?? null, user: g.user.displayName, datasetId: g.datasetId, confidence: g.confidence, status: g.status };
      }),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
