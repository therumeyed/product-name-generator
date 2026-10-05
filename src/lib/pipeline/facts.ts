import { COLOURS, LENGTHS, MATERIALS, OCCASIONS, STYLES, singular } from "../vocab/fashion";
import type { ProductFacts } from "../providers/types";
import type { GenerationInput } from "./types";

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean);
const empty = (): ProductFacts => ({ product_type: null, colour: [], material: [], pattern: [], fit_or_silhouette: [], length: [], features: [], occasion_or_style: [], audience: null, buyer_terms: [], unknowns: [], conflicts: [] });
const splitList = (s?: string) => (s ?? "").split(/[,;/&]|\band\b/i).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Stem-ish match: "ruching" ~ "ruched", "sleeves" ~ "sleeve". 4+ shared leading letters, or exact. */
const sameWord = (a: string, b: string) => singular(a) === singular(b) || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));

/**
 * Facts straight from the structured form fields (no AI needed), plus a vocabulary scan of the free text.
 * Structured fields are the buyer's explicit statement, so they win.
 */
export function deterministicFacts(input: GenerationInput): ProductFacts {
  const f = empty();
  f.product_type = input.productType.toLowerCase();
  f.colour = splitList(input.colour);
  f.material = splitList(input.material);
  f.pattern = splitList(input.pattern);
  f.fit_or_silhouette = splitList(input.fit);
  f.length = splitList(input.length);
  f.features = splitList(input.feature);
  f.occasion_or_style = splitList(input.occasion);
  f.audience = input.audience?.trim().toLowerCase() || null;
  f.buyer_terms = input.freeText.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean);

  const scan = (list: string[], into: string[]) => {
    for (const w of words(`${input.freeText} ${input.extra ?? ""}`)) if (list.includes(w) && !into.some((x) => sameWord(x, w))) into.push(w);
  };
  scan(COLOURS, f.colour); scan(MATERIALS, f.material); scan(LENGTHS, f.length);
  scan(STYLES.filter((s) => !LENGTHS.includes(s)), f.features); scan(OCCASIONS, f.occasion_or_style);
  f.conflicts = detectConflicts(f);
  return f;
}

/** Contradictions we can see without AI. Never resolved silently. */
export function detectConflicts(f: ProductFacts): string[] {
  const out: string[] = [];
  const len = f.length.filter((l) => ["mini", "midi", "maxi"].includes(l));
  if (new Set(len).size > 1) out.push(`Length: ${len.join(" and ")} can't both be true`);
  if (f.features.includes("sleeveless") && f.features.some((x) => /^(long|short|puff|bell)?\s?sleeve(s|d)?$/.test(x))) out.push("Sleeveless and sleeved details both supplied");
  return out;
}

/**
 * Guard against extraction invention: keep only values the buyer actually wrote. Anything dropped is reported
 * so it shows as a warning rather than vanishing.
 */
export function groundFacts(facts: ProductFacts, input: GenerationInput): { facts: ProductFacts; dropped: string[] } {
  const src = words([input.freeText, input.productType, input.colour, input.material, input.pattern, input.fit, input.length, input.feature, input.occasion, input.audience, input.extra].filter(Boolean).join(" "));
  const grounded = (v: string) => words(v).every((w) => src.some((s) => sameWord(s, w)));
  const dropped: string[] = [];
  const keep = (arr: string[]) => arr.filter((v) => (grounded(v) ? true : (dropped.push(v), false)));
  const g: ProductFacts = {
    ...facts,
    colour: keep(facts.colour), material: keep(facts.material), pattern: keep(facts.pattern),
    fit_or_silhouette: keep(facts.fit_or_silhouette), length: keep(facts.length), features: keep(facts.features),
    occasion_or_style: keep(facts.occasion_or_style),
    audience: facts.audience && grounded(facts.audience) ? facts.audience : null,
  };
  if (facts.audience && !g.audience) dropped.push(facts.audience);
  g.product_type = input.productType.toLowerCase(); // the buyer's chosen product type is authoritative
  g.conflicts = [...new Set([...facts.conflicts, ...detectConflicts(g)])];
  return { facts: g, dropped };
}
