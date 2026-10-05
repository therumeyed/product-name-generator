import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadGenerationFor } from "@/lib/pipeline/access";

const body = z.object({
  outcome: z.enum(["used", "edited", "rejected"]),
  finalTitle: z.string().trim().max(200).optional(),
  reason: z.string().trim().max(300).optional(),
}).refine((b) => b.outcome !== "edited" || !!b.finalTitle, { message: "finalTitle is required when edited" });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    const g = await loadGenerationFor(user, id);
    if (g.userId !== user.id) return Response.json({ error: "Only the person who generated this can give feedback" }, { status: 403 });
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid feedback" }, { status: 400 });
    const used = (g.result as { recommendation?: { recommended_title?: string } } | null)?.recommendation?.recommended_title;
    const fb = await db.feedback.create({ data: { generationId: id, userId: user.id, outcome: parsed.data.outcome, finalTitle: parsed.data.outcome === "used" ? (parsed.data.finalTitle ?? used ?? null) : parsed.data.finalTitle ?? null, reason: parsed.data.reason ?? null } });
    return Response.json({ id: fb.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
