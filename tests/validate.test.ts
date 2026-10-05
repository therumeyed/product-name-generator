import { describe, expect, it } from "vitest";
import { parseBrandSettings } from "@/lib/brand";
import { validateRecommendation } from "@/lib/pipeline/validate";
import type { EvidenceBundle, Recommendation } from "@/lib/pipeline/types";
import { emptyFacts } from "./helpers";

const facts = { ...emptyFacts, product_type: "dress", colour: ["black"], length: ["midi"], features: ["ruched"], buyer_terms: ["black dress", "ruching", "midi"] };
const bundle: EvidenceBundle = {
  datasetId: "d", limitedKeywordEvidence: false, serpStatus: "ok", patterns: null, queries: [],
  keywords: [{ id: "K1", keyword: "black midi dress", searchVolume: 8100, category: "Dresses", score: 1, flags: [] }, { id: "K2", keyword: "ruched midi dress", searchVolume: null, category: "Dresses", score: 1, flags: [] }],
  serp: [{ id: "S1", query: "q", rank: 1, title: "t", domain: "d", pageClass: "product", snippet: "", checkedAt: "", cached: false }],
  order: { keywordOrder: [], serpOrder: null, final: [], suggestedTitle: "" },
};
const good: Recommendation = { recommended_title: "black ruched midi dress", confidence: "high", primary_keyword: "black midi dress", supporting_keywords: ["ruched midi dress"], title_structure: [], alternatives: [{ title: "Black Midi Dress", trade_off: "Shorter." }], reason: "r", warnings: [], evidence_keyword_ids: ["K1"], evidence_serp_result_ids: ["S1"] };
const brand = parseBrandSettings({ prohibitedTerms: ["sexy"], maxTitleLength: 30 });
const v = (r: Partial<Recommendation>, b = brand) => validateRecommendation({ ...good, ...r }, facts, bundle, b);

describe("recommendation validator", () => {
  it("accepts a good recommendation and applies title case", () => {
    const r = v({});
    expect(r.errors).toEqual([]);
    expect(r.cleaned.recommended_title).toBe("Black Ruched Midi Dress");
  });
  it("rejects attributes the buyer never supplied (colour, material, audience, adjectives)", () => {
    expect(v({ recommended_title: "Red Ruched Midi Dress" }).errors.join()).toMatch(/red/);
    expect(v({ recommended_title: "Black Satin Midi Dress" }).errors.join()).toMatch(/satin/);
    expect(v({ recommended_title: "Womens Black Midi Dress" }).errors.join()).toMatch(/womens/);
    expect(v({ recommended_title: "Elegant Black Midi Dress" }).errors.join()).toMatch(/elegant/);
  });
  it("requires the product noun and respects prohibited vocabulary", () => {
    expect(v({ recommended_title: "Black Midi" }).errors.join()).toMatch(/product type/);
    const strict = parseBrandSettings({ prohibitedTerms: ["ruched"] });
    expect(v({}, strict).errors.join()).toMatch(/prohibited term "ruched"/);
  });
  it("warns (not errors) when over the length limit", () => {
    const r = v({ recommended_title: "Black Ruched Midi Dress Dress Dress Dress" });
    expect(r.warnings.join()).toMatch(/characters/);
  });
  it("only allows keywords and evidence ids that exist in this generation", () => {
    expect(v({ primary_keyword: "invented keyword" }).errors.join()).toMatch(/not in the keyword evidence/);
    expect(v({ evidence_keyword_ids: ["K99"] }).errors.join()).toMatch(/Unknown keyword evidence id K99/);
    expect(v({ evidence_serp_result_ids: ["S9"] }).errors.join()).toMatch(/Unknown search-result evidence id S9/);
  });
  it("drops alternatives that are only punctuation/case/order changes, caps at 3, flags unsupported ones", () => {
    const r = v({ alternatives: [
      { title: "Black Ruched Midi Dress!", trade_off: "x" }, { title: "BLACK RUCHED MIDI DRESS", trade_off: "x" }, { title: "Midi Ruched Black Dress", trade_off: "x" },
      { title: "Black Midi Dress", trade_off: "a" }, { title: "Ruched Midi Dress", trade_off: "b" }, { title: "Black Ruched Dress", trade_off: "c" }, { title: "Midi Dress", trade_off: "d" },
    ] });
    expect(r.cleaned.alternatives.map((a) => a.title)).toEqual(["Black Midi Dress", "Ruched Midi Dress", "Black Ruched Dress"]);
    expect(v({ alternatives: [{ title: "Red Midi Dress", trade_off: "x" }] }).errors.join()).toMatch(/Alternative "Red Midi Dress"/);
  });
});
