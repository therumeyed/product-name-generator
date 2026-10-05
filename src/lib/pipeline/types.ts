import { z } from "zod";

const field = z.string().trim().max(120).optional();

/** Stage 1 input. Only freeText and productType are required; empty optional fields stay "unknown". */
export const GenerationInput = z.object({
  freeText: z.string().trim().min(2).max(500),
  productType: z.string().trim().min(2).max(60),
  colour: field, material: field, pattern: field, fit: field, length: field,
  feature: field, occasion: field, audience: field,
  extra: z.string().trim().max(2000).optional(),
});
export type GenerationInput = z.infer<typeof GenerationInput>;

/** Stage 2 output (also the Claude structured-output schema). */
export const ExtractedFacts = z.object({
  product_type: z.string().nullable(),
  colour: z.array(z.string()),
  material: z.array(z.string()),
  pattern: z.array(z.string()),
  fit_or_silhouette: z.array(z.string()),
  length: z.array(z.string()),
  features: z.array(z.string()),
  occasion_or_style: z.array(z.string()),
  audience: z.string().nullable(),
  buyer_terms: z.array(z.string()),
  unknowns: z.array(z.string()),
  conflicts: z.array(z.string()),
});

/** Stage 7 output (Claude structured-output schema). Evidence ids are short labels: K1.. keywords, S1.. SERP results. */
export const Recommendation = z.object({
  recommended_title: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  primary_keyword: z.string().nullable(),
  supporting_keywords: z.array(z.string()),
  title_structure: z.array(z.string()),
  alternatives: z.array(z.object({ title: z.string(), trade_off: z.string() })),
  reason: z.string(),
  warnings: z.array(z.string()),
  evidence_keyword_ids: z.array(z.string()),
  evidence_serp_result_ids: z.array(z.string()),
});
export type Recommendation = z.infer<typeof Recommendation>;

export type KeywordEvidenceItem = {
  id: string; // K1..
  keyword: string;
  searchVolume: number | null; // null = "volume unavailable"
  category: string | null;
  score: number;
  flags: string[];
};

export type SerpEvidenceItem = {
  id: string; // S1..
  query: string;
  rank: number;
  title: string;
  domain: string;
  pageClass: string;
  snippet: string;
  checkedAt: string;
  cached: boolean;
};

export type SerpPatterns = {
  resultsAnalysed: number;
  intent: "product_led" | "category_led" | "mixed" | "none";
  productNouns: { term: string; count: number }[];
  attributeWording: { term: string; count: number }[];
  /** Buyer words in the order search results use them (null when results don't show them together). */
  serpOrder: string[] | null;
  /** Frequent in relevant titles but NOT supplied by the buyer: don't use. */
  unsupportedFrequent: string[];
};

export type OrderGuidance = {
  keywordOrder: string[]; // from the keyword list
  serpOrder: string[] | null;
  final: string[]; // blended: keyword list, unless SERPs clearly disagree
  suggestedTitle: string;
};

export type EvidenceBundle = {
  datasetId: string | null;
  limitedKeywordEvidence: boolean;
  keywords: KeywordEvidenceItem[];
  queries: { query: string; reason: string }[];
  serp: SerpEvidenceItem[];
  serpStatus: "ok" | "partial" | "unavailable" | "skipped";
  patterns: SerpPatterns | null;
  order: OrderGuidance;
};
