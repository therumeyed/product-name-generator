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

export interface FactExtractor {
  extract(input: { freeText: string; fields: Record<string, string | undefined> }): Promise<ProductFacts>;
}

export interface SerpProvider {
  search(opts: { query: string; location: string; language: string; device: string; depth: number }): Promise<SerpResponse>;
}

export interface Recommender {
  recommend(bundle: unknown): Promise<unknown>;
}
