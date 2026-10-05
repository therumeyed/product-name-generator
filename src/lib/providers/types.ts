// Provider interfaces. The pipeline depends on these, never on a vendor SDK directly,
// so mocks, caching and a future background worker slot in without touching domain logic.

export type ProductFacts = {
  product_type: string | null;
  colour: string[];
  material: string[];
  pattern: string[];
  fit_or_silhouette: string[];
  length: string[];
  features: string[];
  occasion_or_style: string[];
  audience: string | null;
  buyer_terms: string[];
  unknowns: string[];
  conflicts: string[];
};

export type SerpResult = {
  rank: number;
  title: string;
  domain: string;
  url: string;
  resultType: string;
  snippet: string;
  pageClass: "product" | "category" | "editorial" | "marketplace" | "other";
};

export type SerpResponse = { query: string; checkedAt: string; results: SerpResult[]; costUsd?: number };

export type AiUsage = { inputTokens: number; outputTokens: number };

export class AiError extends Error {
  constructor(message: string, public code: "ai_unavailable" | "ai_refusal" | "ai_invalid") {
    super(message);
  }
}

export interface FactExtractor {
  extract(input: { freeText: string; fields: Record<string, string | undefined> }): Promise<{ facts: ProductFacts; usage: AiUsage }>;
}

export interface SerpProvider {
  search(opts: { query: string; location: string; language: string; device: string; depth: number }): Promise<SerpResponse>;
}

/** `payload` is the compact JSON evidence bundle. `repair` is set on the single repair attempt. */
export interface Recommender {
  recommend(payload: Record<string, unknown>, repair?: { errors: string[]; previous: unknown }): Promise<{ recommendation: import("../pipeline/types").Recommendation; usage: AiUsage }>;
}
