import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, requireUser } from "@/lib/auth/guards";
import { activateDataset, DatasetError } from "@/lib/keywords/versions";

// Also used for rollback: activating a previously-active (archived) version restores it.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("admin");
    const { id } = await params;
    const ds = await db.keywordDataset.findUnique({ where: { id }, select: { brandId: true } });
    if (!ds) return Response.json({ error: "Not found" }, { status: 404 });
    assertBrandAccess(user, ds.brandId);
    await activateDataset(id, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof DatasetError) return Response.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
