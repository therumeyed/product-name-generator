import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { importKeywords } from "@/lib/keywords/import";
import { suggestMapping } from "@/lib/keywords/mapping";
import { openCsv } from "@/lib/keywords/readers";
import { activateDataset } from "@/lib/keywords/versions";

export async function resetDb() {
  await db.auditEvent.deleteMany();
  await db.feedback.deleteMany();
  await db.generation.deleteMany();
  await db.serpCache.deleteMany();
  await db.brand.updateMany({ data: { activeKeywordDatasetId: null } });
  await db.datasetRejection.deleteMany();
  await db.keyword.deleteMany();
  await db.keywordDataset.deleteMany();
  await db.user.deleteMany();
  await db.brand.deleteMany();
}

export const emptyFacts = {
  product_type: null, colour: [], material: [], pattern: [], fit_or_silhouette: [], length: [],
  features: [], occasion_or_style: [], audience: null, buyer_terms: [], unknowns: [], conflicts: [],
};

/** Brand + buyer + active dataset from the synthetic fixture CSV. */
export async function seedBrand(settings: Record<string, unknown> = {}, activate = true) {
  const brand = await db.brand.create({ data: { name: "T", slug: "t", settings: settings as object } });
  const user = await db.user.create({ data: { username: "buyer", displayName: "B", passwordHash: "x", role: "buyer", brandId: brand.id } });
  if (activate) {
    const source = await openCsv(readFileSync("tests/fixtures/keywords.csv"));
    const s = await importKeywords({ brandId: brand.id, name: "v1", filename: "k.csv", source, mapping: suggestMapping(source.headers), volumeRule: "max" });
    await activateDataset(s.datasetId);
  }
  return { brand, user };
}
