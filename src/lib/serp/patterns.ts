import { ATTRIBUTE_VOCAB_TOKENS, classify, singular } from "../vocab/fashion";
import { orderTokens, tokenScore, type OrderModel } from "../keywords/orderModel";
import type { ProductFacts } from "../providers/types";
import type { OrderGuidance, SerpEvidenceItem, SerpPatterns } from "../pipeline/types";
import { cleanTitle } from "./reduce";

const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean);
const top = (m: Map<string, number>, n = 8) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([term, count]) => ({ term, count }));
const pairKey = (a: string, b: string) => `${a}>${b}`;

/** Each buyer detail as a unit ("long sleeve" stays together). Unknown words are kept: product truth beats vocabulary coverage. */
export function buyerUnits(f: ProductFacts): string[] {
  const all = [...f.colour, ...f.material, ...f.pattern, ...f.fit_or_silhouette, ...f.length, ...f.features, ...f.occasion_or_style];
  return [...new Set(all.map((x) => x.toLowerCase().trim().replace(/\s+/g, " ")).filter(Boolean))];
}

/** The word of a unit that carries ordering evidence: first vocabulary word, else the last word ("wide leg" -> wide). */
export function anchorOf(unit: string): string {
  const w = unit.split(" ").map(singular);
  return w.find((t) => classify(t)) ?? w[w.length - 1];
}

/** Anchors of the buyer's units, with the unit each came from (first unit wins a shared anchor). */
function anchors(units: string[]) {
  const m = new Map<string, string>();
  for (const u of units) if (!m.has(anchorOf(u))) m.set(anchorOf(u), u);
  return m;
}

/** Stage 6. Deterministic: product nouns, wording, intent mix, and the order SERP titles use for the buyer's words. */
export function derivePatterns(serp: SerpEvidenceItem[], facts: ProductFacts, attrTerms: string[]): SerpPatterns {
  const unitAnchors = [...anchors(buyerUnits(facts)).keys()];
  const type = facts.product_type ? singular(facts.product_type.toLowerCase().split(/\s+/).pop()!) : "";
  const supported = new Set([...attrTerms.map(singular), type]);
  // Only results that are actually about this kind of product.
  const relevant = serp.filter((r) => ["product", "category"].includes(r.pageClass) && toks(cleanTitle(r.title)).some((t) => singular(t) === type));
  const unique = new Map<string, SerpEvidenceItem>();
  for (const r of relevant) unique.set(r.title.toLowerCase(), r); // same page appears under several queries

  const nouns = new Map<string, number>(), wording = new Map<string, number>(), unsupported = new Map<string, number>();
  const pairs = new Map<string, number>();
  const buyer = unitAnchors;

  for (const r of unique.values()) {
    const t = toks(cleanTitle(r.title));
    t.forEach((w) => {
      const s = singular(w);
      if (s === type) nouns.set(w, (nouns.get(w) ?? 0) + 1);
      else if (ATTRIBUTE_VOCAB_TOKENS.has(s)) {
        wording.set(s, (wording.get(s) ?? 0) + 1);
        if (!supported.has(s)) unsupported.set(s, (unsupported.get(s) ?? 0) + 1);
      }
    });
    const present = buyer.filter((b) => t.some((w) => singular(w) === b));
    const posOf = (b: string) => t.findIndex((w) => singular(w) === b);
    for (let i = 0; i < present.length; i++) for (let j = 0; j < present.length; j++) {
      if (i !== j && posOf(present[i]) < posOf(present[j])) pairs.set(pairKey(present[i], present[j]), (pairs.get(pairKey(present[i], present[j])) ?? 0) + 1);
    }
  }

  const prodCount = serp.filter((r) => r.pageClass === "product").length;
  const catCount = serp.filter((r) => r.pageClass === "category").length;
  const total = serp.length;
  const intent: SerpPatterns["intent"] = !total ? "none" : prodCount / total >= 0.5 ? "product_led" : catCount / total >= 0.5 ? "category_led" : "mixed";

  // SERP order for the buyer's words: Copeland over observed pairs. null if no pair was ever seen together.
  let serpOrder: string[] | null = null;
  if (pairs.size) {
    serpOrder = buyer
      .map((b, i) => ({ b, i, w: buyer.reduce((s, o) => (o === b ? s : s + Math.sign((pairs.get(pairKey(b, o)) ?? 0) - (pairs.get(pairKey(o, b)) ?? 0))), 0) }))
      .sort((x, y) => y.w - x.w || x.i - y.i)
      .map((x) => x.b);
  }
  return {
    resultsAnalysed: unique.size,
    intent,
    productNouns: top(nouns, 4),
    attributeWording: top(wording),
    serpOrder,
    unsupportedFrequent: [...unsupported].filter(([, c]) => c >= 2).map(([t]) => t),
  };
}

/** SERP pair counts exposed for blending (same observation used above, recomputed so patterns stay a plain data object). */
function serpPairCounts(serp: SerpEvidenceItem[], buyer: string[], type: string) {
  const pairs = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of serp) {
    if (!["product", "category"].includes(r.pageClass) || seen.has(r.title.toLowerCase())) continue;
    seen.add(r.title.toLowerCase());
    const t = toks(cleanTitle(r.title));
    if (!t.some((w) => singular(w) === type)) continue;
    const pos = (b: string) => t.findIndex((w) => singular(w) === b);
    for (const a of buyer) for (const b of buyer) if (a !== b && pos(a) >= 0 && pos(b) >= 0 && pos(a) < pos(b)) pairs.set(pairKey(a, b), (pairs.get(pairKey(a, b)) ?? 0) + 1);
  }
  return pairs;
}

/**
 * Best-case word order from BOTH sources. The keyword list is the base (it has thousands of queries).
 * A word pair flips only when real result titles clearly disagree: >=3 titles showing the pair, >=75% one way.
 */
export function blendOrder(model: OrderModel | null, category: string | null, facts: ProductFacts, _attrTerms: string[], serp: SerpEvidenceItem[], patterns: SerpPatterns | null): OrderGuidance {
  const units = buyerUnits(facts);
  const byAnchor = anchors(units);
  const buyer = [...byAnchor.keys()];
  const type = facts.product_type ? singular(facts.product_type.toLowerCase().split(/\s+/).pop()!) : "";
  const keywordOrder = orderTokens(model, category, buyer);
  const pairs = serp.length ? serpPairCounts(serp, buyer, type) : new Map<string, number>();

  const serpPrefers = (a: string, b: string): number => {
    const ab = pairs.get(pairKey(a, b)) ?? 0, ba = pairs.get(pairKey(b, a)) ?? 0, n = ab + ba;
    if (n < 3) return 0;
    return ab / n >= 0.75 ? -1 : ba / n >= 0.75 ? 1 : 0;
  };
  const kwPrefers = (a: string, b: string) => Math.sign(keywordOrder.indexOf(a) - keywordOrder.indexOf(b)); // -1 = a first
  const finalAnchors = [...buyer]
    .map((t) => ({ t, w: buyer.reduce((s, o) => (o === t ? s : s - (serpPrefers(t, o) || kwPrefers(t, o))), 0), s: tokenScore(model, category, t) }))
    .sort((x, y) => y.w - x.w || x.s - y.s)
    .map((x) => x.t);
  const final = finalAnchors.map((a) => byAnchor.get(a)!);
  // Units whose anchor collided with an earlier unit (e.g. "mini" and "midi" never both occur) are appended, never dropped.
  for (const u of units) if (!final.includes(u)) final.push(u);

  const noun = facts.product_type ?? "";
  return { keywordOrder: keywordOrder.map((a) => byAnchor.get(a) ?? a), serpOrder: patterns?.serpOrder ? patterns.serpOrder.map((a) => byAnchor.get(a) ?? a) : null, final, suggestedTitle: titleCase([...final, noun].join(" ")) };
}

export const titleCase = (s: string) => s.replace(/\s+/g, " ").trim().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
