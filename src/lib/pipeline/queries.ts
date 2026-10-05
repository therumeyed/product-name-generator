import type { ProductFacts } from "../providers/types";
import type { KeywordEvidenceItem, OrderGuidance } from "./types";
import { normalizeKeyword } from "../keywords/normalize";

export type PlannedQuery = { query: string; reason: string };
const MAX_WORDS = 6; // real shopper phrasing, not a sentence

const jaccard = (a: string, b: string) => {
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  return [...A].filter((x) => B.has(x)).length / new Set([...A, ...B]).size;
};

/**
 * Stage 4. Deterministic and bounded: at most `max` queries, each distinct, each describing the real product.
 *  1. the strongest dataset keyword
 *  2. the buyer's attributes in learned order + product type (their most commercially meaningful combination)
 *  3. an alternative phrasing: the next dataset keyword that is clearly different, else a shorter attribute combo
 */
export function planQueries(facts: ProductFacts, keywords: KeywordEvidenceItem[], order: OrderGuidance, max: number): PlannedQuery[] {
  if (max <= 0 || !facts.product_type) return [];
  const noun = facts.product_type.toLowerCase();
  const out: PlannedQuery[] = [];
  const ok = (q: string) => q.split(" ").length <= MAX_WORDS && out.every((o) => jaccard(o.query, q) < 0.75);
  const add = (query: string, reason: string) => {
    const q = normalizeKeyword(query);
    if (out.length < max && q && ok(q)) out.push({ query: q, reason });
  };

  const best = keywords[0];
  if (best) add(best.keyword, `Strongest keyword in the dataset for this product${best.searchVolume !== null ? ` (${best.searchVolume.toLocaleString()} searches)` : ""}`);

  const attrs = order.final;
  if (attrs.length) add([...attrs.slice(0, 3), noun].join(" "), "Buyer's attributes in the order the keyword list uses them");
  else add(noun, "Product type only: no attributes supplied");

  const second = keywords.find((k) => k !== best && out.every((o) => jaccard(o.query, k.keyword) < 0.75));
  if (second) add(second.keyword, "Alternative phrasing from the dataset");
  else if (attrs.length > 1) add([attrs[0], noun].join(" "), "Broader phrasing: lead attribute + product type");

  return out;
}
