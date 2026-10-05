import { errorResponse, requireUser } from "@/lib/auth/guards";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import { failIfStale } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser("buyer");
    const { id } = await params;
    await loadGenerationFor(user, id);
    await failIfStale(id);
    return Response.json(presentGeneration(await loadGenerationFor(user, id), user));
  } catch (e) {
    return errorResponse(e);
  }
}
