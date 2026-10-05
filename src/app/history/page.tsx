import Link from "next/link";
import { requirePageUser, hasRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import Header from "@/components/Header";

export const dynamic = "force-dynamic";
const PAGE = 25;

export default async function History({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePageUser();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const where = user.role === "owner" ? {} : hasRole(user, "admin") ? { brandId: user.brandId! } : { userId: user.id };
  const [rows, total] = await Promise.all([
    db.generation.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { displayName: true } }, feedback: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.generation.count({ where }),
  ]);
  const rec = (r: unknown) => (r as { recommendation?: { recommended_title?: string } } | null)?.recommendation?.recommended_title ?? "—";
  return (
    <>
      <Header user={user} />
      <main style={{ maxWidth: 1100 }}>
        <h1 style={{ fontSize: 22 }}>History</h1>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Date</th><th>Input</th><th>Recommended</th><th>Final</th><th>User</th><th>Confidence</th><th>Status</th></tr></thead>
            <tbody>{rows.map((g) => {
              const fb = g.feedback[0];
              return (
                <tr key={g.id}>
                  <td><Link href={`/history/${g.id}`}>{g.createdAt.toISOString().slice(0, 16).replace("T", " ")}</Link></td>
                  <td>{(g.originalInput as { freeText?: string }).freeText}</td>
                  <td>{rec(g.result)}</td>
                  <td>{fb ? (fb.outcome === "rejected" ? <span className="muted">rejected</span> : fb.finalTitle ?? rec(g.result)) : <span className="muted">—</span>}</td>
                  <td>{g.user.displayName}</td>
                  <td>{g.confidence ?? "—"}</td>
                  <td>{g.status}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="muted">Nothing yet.</p>}
        <p>{page > 1 && <Link href={`/history?page=${page - 1}`}>← Newer</Link>} {page * PAGE < total && <Link href={`/history?page=${page + 1}`}>Older →</Link>}</p>
      </main>
    </>
  );
}
