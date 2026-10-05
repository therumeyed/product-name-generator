import {
  AUDIENCE_TERMS, COLOURS, COMMERCIAL_NOISE, INFORMATIONAL_PHRASES, LENGTHS, MATERIALS, OCCASIONS, STOP_WORDS, STYLES,
  CLASS_ORDER, PLURAL_NATURAL, categoryForType, classify, singular,
} from "../vocab/fashion";
import type { ProductFacts } from "../providers/types";
import { attributeTerms, type RawCandidate } from "./retrieve";

export type Weights = { factRelevance: number; typeAndIntent: number; titleSuitability: number; demand: number; brandFit: number };
export const DEFAULT_WEIGHTS: Weights = { factRelevance: 0.4, typeAndIntent: 0.2, titleSuitability: 0.15, demand: 0.15, brandFit: 0.1 };

export type ScoredKeyword = RawCandidate & {
  score: number;
  breakdown: Record<keyof Weights, number>;
  coverage: number;
  flags: string[];
  volumeAvailable: boolean;
};

export type BrandRules = { prohibitedTerms?: string[]; avoidWords?: string[]; attributeOrder?: string[] };

const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9'$%]+/).filter(Boolean);
const containsPhrase = (norm: string, phrase: string) => new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(norm);

const ATTRIBUTE_VOCAB = new Set([...COLOURS, ...MATERIALS, ...LENGTHS, ...STYLES, ...OCCASIONS, ...AUDIENCE_TERMS].map(singular));

/** log10 scaling, capped at 1M searches, so a broad head term cannot swamp a far more relevant phrase. */
export const demandScore = (v: number | null) => (v === null ? 0 : Math.min(1, Math.log10(1 + Math.max(0, v)) / 6));

export function scoreCandidate(c: RawCandidate, facts: ProductFacts, rules: BrandRules = {}, w: Weights = DEFAULT_WEIGHTS): ScoredKeyword | null {
  const norm = c.normalizedKeyword;
  const kt = toks(norm);
  const flags: string[] = [];

  // Brand vocabulary: hard exclusion.
  for (const p of [...(rules.prohibitedTerms ?? []), ...(rules.avoidWords ?? [])]) {
    if (p && containsPhrase(norm, p.toLowerCase())) return null;
  }

  const typeTok = facts.product_type ? singular(facts.product_type.toLowerCase().split(/\s+/).pop()!) : "";
  const hasType = !!typeTok && kt.some((t) => singular(t) === typeTok);

  const attrTokens = attributeTerms(facts).map(singular);
  const factSet = new Set([...attrTokens, typeTok]);
  const content = kt.filter((t) => !STOP_WORDS.has(t));
  const supported = content.filter((t) => factSet.has(singular(t)));
  const unsupportedAttrs = content.filter((t) => !factSet.has(singular(t)) && ATTRIBUTE_VOCAB.has(singular(t)));

  const coverage = attrTokens.length ? attrTokens.filter((a) => content.some((t) => singular(t) === a)).length / attrTokens.length : 1;
  const precision = content.length ? supported.length / content.length : 0;
  let factRelevance = 0.55 * coverage + 0.45 * precision;
  if (unsupportedAttrs.length) {
    factRelevance *= 0.15;
    for (const u of unsupportedAttrs) flags.push(`unsupported_attribute:${u}`);
  }

  let intent = 1;
  if (INFORMATIONAL_PHRASES.some((p) => containsPhrase(norm, p))) { intent = 0.1; flags.push("informational"); }
  else if (COMMERCIAL_NOISE.some((p) => containsPhrase(norm, p)) || /[$%\d]/.test(norm)) { intent = 0.4; flags.push("promo_or_modifier"); }
  const typeAndIntent = hasType ? intent : 0;
  if (!hasType) flags.push("missing_product_type");

  let titleSuitability = 1;
  const last = kt[kt.length - 1] ?? "";
  const buyerPlural = !!facts.product_type && facts.product_type.toLowerCase().trim() !== singular(facts.product_type.toLowerCase().trim());
  if (singular(last) === typeTok && last !== typeTok && !buyerPlural && !PLURAL_NATURAL.has(last)) {
    titleSuitability *= 0.5;
    flags.push("plural_category_phrase");
  }
  if (kt.length === 1) titleSuitability *= 0.6;
  else if (kt.length > 5) titleSuitability *= 0.4;
  // Product noun should be the head (last) word: "wide leg pants outfit" is a search, not a title.
  if (hasType && singular(last) !== typeTok) { titleSuitability *= 0.5; flags.push("type_not_last"); }
  const order = (rules.attributeOrder ?? CLASS_ORDER).filter((x): x is (typeof CLASS_ORDER)[number] => (CLASS_ORDER as string[]).includes(x));
  // Soft order check, driven by the brand's attributeOrder setting: attributes in colour > feature > material > length order read like a PDP title.
  const ranks = kt.map(classify).filter((c): c is NonNullable<ReturnType<typeof classify>> => c !== null).map((c) => order.indexOf(c));
  let inversions = 0;
  for (let i = 1; i < ranks.length; i++) if (ranks[i] < ranks[i - 1]) inversions++;
  if (inversions) { titleSuitability *= Math.max(0.7, 0.92 ** inversions); flags.push("unnatural_order"); }

  const expected = categoryForType(facts.product_type);
  const brandFit = !expected ? 0.5 : c.category === expected ? 1 : c.category ? 0.2 : 0.4;

  const demand = demandScore(c.searchVolume);
  const breakdown = { factRelevance, typeAndIntent, titleSuitability, demand, brandFit };
  const score = (Object.keys(w) as (keyof Weights)[]).reduce((s, k) => s + w[k] * breakdown[k], 0);
  return { ...c, score, breakdown, coverage, flags, volumeAvailable: c.searchVolume !== null };
}

export function rankCandidates(cands: RawCandidate[], facts: ProductFacts, rules?: BrandRules, w?: Weights, keep = 30): ScoredKeyword[] {
  return cands
    .map((c) => scoreCandidate(c, facts, rules, w))
        // Hard exclusions: no product noun, or a colour/material/audience/etc. the buyer never supplied.
    .filter((s): s is ScoredKeyword => s !== null && s.breakdown.typeAndIntent > 0 && !s.flags.some((f) => f.startsWith("unsupported_attribute")))
    .sort((a, b) => b.score - a.score)
    .slice(0, keep);
}
