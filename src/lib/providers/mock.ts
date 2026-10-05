import type { FactExtractor, ProductFacts, SerpProvider, SerpResponse } from "./types";

const empty = (): ProductFacts => ({
  product_type: null, colour: [], material: [], pattern: [], fit_or_silhouette: [], length: [],
  features: [], occasion_or_style: [], audience: null, buyer_terms: [], unknowns: [], conflicts: [],
});

/** Deterministic stand-in for Claude extraction. Clearly mock: only recognises a tiny vocabulary. */
export class MockFactExtractor implements FactExtractor {
  async extract({ freeText, fields }: { freeText: string; fields: Record<string, string | undefined> }) {
    const text = `${freeText} ${Object.values(fields).filter(Boolean).join(" ")}`.toLowerCase();
    const f = empty();
    f.product_type = fields.productType?.toLowerCase() || (["dress", "top", "skirt", "jacket"].find((t) => text.includes(t)) ?? null);
    f.colour = ["black", "white", "red", "blue"].filter((c) => text.includes(c));
    f.length = ["mini", "midi", "maxi"].filter((c) => text.includes(c));
    f.material = ["mesh", "satin", "linen", "denim"].filter((c) => text.includes(c));
    f.features = ["ruched", "ruching"].filter((c) => text.includes(c)).map(() => "ruched");
    f.buyer_terms = freeText.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    return f;
  }
}

export class MockSerpProvider implements SerpProvider {
  calls: string[] = [];
  async search({ query }: { query: string }): Promise<SerpResponse> {
    this.calls.push(query);
    return {
      query,
      checkedAt: new Date().toISOString(),
      costUsd: 0,
      results: [{ rank: 1, title: `${query} | Example Store`, domain: "example.com", url: "https://example.com/p", resultType: "organic", snippet: "", pageClass: "product" }],
    };
  }
}
