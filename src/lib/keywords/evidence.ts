import { db } from "../db";
import type { ProductFacts } from "../providers/types";
import { attributeTerms, retrieveCandidates } from "./retrieve";
import { rankCandidates, type BrandRules, type ScoredKeyword, type Weights } from "./score";
import { activeDatasetId } from "./versions";

export type KeywordEvidence = { datasetId: string | null; rawCount: number; top: ScoredKeyword[]; limited: boolean };

/** Stage 3: retrieve from the brand's ACTIVE dataset and keep the best 20-40 for the model. */
export async function keywordEvidenceFor(brandId: string, facts: ProductFacts, opts: { keep?: number; weights?: Weights } = {}): Promise<KeywordEvidence> {
  const datasetId = await activeDatasetId(brandId);
  if (!datasetId) return { datasetId: null, rawCount: 0, top: [], limited: true };
  const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId }, select: { settings: true } });
  const s = (brand.settings ?? {}) as BrandRules;
  const raw = await retrieveCandidates(datasetId, facts);
  const top = rankCandidates(raw, facts, { prohibitedTerms: s.prohibitedTerms, avoidWords: s.avoidWords, attributeOrder: s.attributeOrder }, opts.weights, opts.keep ?? 30);
  // "Limited keyword evidence": nothing found, or (when the buyer gave attributes) nothing reflects any of them.
  const hasAttrs = attributeTerms(facts).length > 0;
  const limited = top.length === 0 || (hasAttrs && top.every((k) => k.coverage === 0));
  return { datasetId, rawCount: raw.length, top, limited };
}
