import { db } from "@/lib/db";

export async function resetDb() {
  await db.auditEvent.deleteMany();
  await db.feedback.deleteMany();
  await db.generation.deleteMany();
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
