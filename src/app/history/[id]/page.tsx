import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser, hasRole, HttpError } from "@/lib/auth/guards";
import { loadGenerationFor, presentGeneration } from "@/lib/pipeline/access";
import Header from "@/components/Header";
import ResultView, { type Gen } from "@/components/ResultView";

export const dynamic = "force-dynamic";

export default async function HistoryItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let g;
  try { g = await loadGenerationFor(user, id); } catch (e) { if (e instanceof HttpError) notFound(); throw e; }
  const gen = JSON.parse(JSON.stringify(presentGeneration(g, user))) as Gen & { input: { freeText?: string } };
  return (
    <>
      <Header user={user} />
      <main>
        <p><Link href="/history">← History</Link></p>
        <p className="muted">Input: {gen.input.freeText}</p>
        <ResultView gen={gen} canFeedback={g.userId === user.id} isAdmin={hasRole(user, "admin")} />
      </main>
    </>
  );
}
