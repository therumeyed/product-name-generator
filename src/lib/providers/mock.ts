import { deterministicFacts } from "../pipeline/facts";
import type { GenerationInput } from "../pipeline/types";
import { Recommendation } from "../pipeline/types";
import { classify } from "../vocab/fashion";
import type { FactExtractor, Recommender, SerpProvider, SerpResponse } from "./types";
import { classifyPage } from "../serp/reduce";

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

/** Deterministic stand-in for Claude extraction: structured fields + vocabulary scan. MOCK, not AI. */
export class MockFactExtractor implements FactExtractor {
  async extract({ freeText, fields }: { freeText: string; fields: Record<string, string | undefined> }) {
    const input = { freeText, productType: fields.productType ?? "", colour: fields.colour, material: fields.material, pattern: fields.pattern, fit: fields.fit, length: fields.length, feature: fields.feature, occasion: fields.occasion, audience: fields.audience, extra: fields.extra } as GenerationInput;
    return { facts: deterministicFacts(input), usage: NO_USAGE };
  }
}

/** Builds the title the order guidance suggests. MOCK, not AI: lets the whole pipeline run without paid keys. */
export class MockRecommender implements Recommender {
  failTimes = 0; // tests: fail this many calls with ai_unavailable
  calls = 0;
  async recommend(payload: Record<string, unknown>) {
    this.calls++;
    if (this.failTimes > 0) { this.failTimes--; const { AiError } = await import("./types"); throw new AiError("mock outage", "ai_unavailable"); }
    const p = payload as { title_order: { final: string[]; suggested_title: string }; keyword_evidence: { id: string; keyword: string }[]; serp_evidence: { id: string }[]; product_facts: { product_type: string } };
    const kws = p.keyword_evidence;
    const noun = p.product_facts.product_type;
    const attrs = p.title_order.final;
    const title = p.title_order.suggested_title;
    const alts: { title: string; trade_off: string }[] = [];
    const cap = (s: string) => s.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
    if (attrs.length >= 2) alts.push({ title: cap([...attrs.slice(1), noun].join(" ")), trade_off: `Drops "${attrs[0]}" for a shorter, broader title.` });
    if (attrs.length >= 3) alts.push({ title: cap([...attrs.slice(0, -1), noun].join(" ")), trade_off: `Drops "${attrs[attrs.length - 1]}" for a shorter title.` });
    return {
      recommendation: Recommendation.parse({
        recommended_title: title,
        confidence: kws.length ? "medium" : "low",
        primary_keyword: kws[0]?.keyword ?? null,
        supporting_keywords: kws.slice(1, 3).map((k) => k.keyword),
        title_structure: [...attrs.map((a): string => classify(a) ?? "feature"), "product_type"],
        alternatives: alts,
        reason: "[mock recommender] Built from the learned word order and the buyer's supplied details.",
        warnings: [],
        evidence_keyword_ids: kws.slice(0, 3).map((k) => k.id),
        evidence_serp_result_ids: p.serp_evidence.slice(0, 2).map((s) => s.id),
      }),
      usage: NO_USAGE,
    };
  }
}

/** Returns canned product-page style results for any query. MOCK. */
export class MockSerpProvider implements SerpProvider {
  calls: string[] = [];
  fail = false;
  async search({ query }: { query: string }): Promise<SerpResponse> {
    this.calls.push(query);
    if (this.fail) throw new Error("mock SERP outage");
    const t = query.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());
    const mk = (rank: number, domain: string, path: string, title: string) => ({ rank, title, domain, url: `https://${domain}${path}`, resultType: "organic", snippet: "", pageClass: classifyPage(`https://${domain}${path}`, title, domain) });
    return { query, checkedAt: new Date().toISOString(), costUsd: 0, results: [mk(1, "retailer-a.example", "/p/12345", `${t} | Retailer A`), mk(2, "retailer-b.example", "/products/x", `${t} - Retailer B`), mk(3, "retailer-c.example", "/collections/dresses", `${t}s | Retailer C`)] };
  }
}
