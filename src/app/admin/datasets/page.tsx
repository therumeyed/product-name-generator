import Link from "next/link";
import { requirePageUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import DatasetsClient from "./DatasetsClient";

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const user = await requirePageUser("admin");
  const brands = await db.brand.findMany({ where: user.role === "owner" ? {} : { id: user.brandId! }, orderBy: { name: "asc" } });
  const datasets = await db.keywordDataset.findMany({
    where: { brandId: { in: brands.map((b) => b.id) } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const activeIds = new Set(brands.map((b) => b.activeKeywordDatasetId));
  return (
    <main>
      <p><Link href="/">← Back</Link></p>
      <h1 style={{ fontSize: 22 }}>Keyword datasets</h1>
      <DatasetsClient
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        datasets={datasets.map((d) => ({
          id: d.id, name: d.name, status: d.status, active: activeIds.has(d.id), brandId: d.brandId,
          accepted: d.rowsAccepted, rejected: d.rowsRejected, duplicate: d.rowsDuplicate,
          created: d.createdAt.toISOString().slice(0, 16).replace("T", " "),
        }))}
      />
    </main>
  );
}
