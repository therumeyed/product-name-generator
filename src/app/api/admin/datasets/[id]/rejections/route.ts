import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, requireUser } from "@/lib/auth/guards";
import { csvSafe } from "@/lib/keywords/normalize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("admin");
    const { id } = await params;
    const ds = await db.keywordDataset.findUnique({ where: { id }, select: { brandId: true } });
    if (!ds) return Response.json({ error: "Not found" }, { status: 404 });
    assertBrandAccess(user, ds.brandId);
    const rows = await db.datasetRejection.findMany({ where: { datasetId: id }, orderBy: { rowNumber: "asc" } });
    const lines = ["row,keyword,reason", ...rows.map((r) => [r.rowNumber, csvSafe(r.keyword), csvSafe(r.reason)].join(","))];
    return new Response(lines.join("\n"), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="rejected-rows-${id}.csv"` } });
  } catch (e) {
    return errorResponse(e);
  }
}
