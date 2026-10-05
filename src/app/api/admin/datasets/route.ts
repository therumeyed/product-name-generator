import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, requireUser } from "@/lib/auth/guards";

export async function GET(req: Request) {
  try {
    const user = await requireUser("admin");
    const brandId = new URL(req.url).searchParams.get("brandId") ?? user.brandId;
    if (!brandId) return Response.json({ error: "brandId required" }, { status: 400 });
    assertBrandAccess(user, brandId);
    const datasets = await db.keywordDataset.findMany({
      where: { brandId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, status: true, originalFilename: true, rowsAccepted: true, rowsRejected: true, rowsDuplicate: true, createdAt: true, activatedAt: true, validationSummary: true },
    });
    return Response.json({ datasets });
  } catch (e) {
    return errorResponse(e);
  }
}
