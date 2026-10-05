import type { ProductFacts } from "../providers/types";
import type { BrandSettings } from "../brand";
import type { EvidenceBundle, Recommendation } from "./types";
import { STOP_WORDS, singular } from "../vocab/fashion";
import { normalizeKeyword } from "../keywords/normalize";
import { titleCase } from "../serp/patterns";

const toks = (s: string) => s.toLowerCase().split(/[^a-z0-9'-]+/).filter(Boolean);
const flat = (s: string) => toks(s).join("");
const sameSet = (a: string, b: string) => [...new Set(toks(a).map(singular))].sort().join(" ") === [...new Set(toks(b).map(singular))].sort().join(" ");

export type Validated = { errors: string[]; warnings: string[]; cleaned: Recommendation };

/** Words a title may contain: the buyer's own facts, the product noun, stop words, and brand-approved vocabulary. */
export function allowedWords(facts: ProductFacts, brand: BrandSettings): Set<string> {
  const vals = [facts.product_type ?? "", ...facts.colour, ...facts.material, ...facts.pattern, ...facts.fit_or_silhouette, ...facts.length, ...facts.features, ...facts.occasion_or_style, facts.audience ?? "", ...facts.buyer_terms, ...brand.allowedVocabulary, ...brand.requiredCoreTerms];
  const set = new Set<string>();
  for (const v of vals) for (const w of toks(v)) { set.add(singular(w)); set.add(w); }
  return set;
}

const unsupportedIn = (title: string, allowed: Set<string>) =>
  toks(title).filter((w) => !STOP_WORDS.has(w) && !allowed.has(w) && !allowed.has(singular(w)));

/**
 * Stage 7 validator. Deterministic checks between Claude and the user (brief section 6). `errors` trigger one repair
 * call; `warnings` are shown to the buyer. `cleaned` has casing applied and bad/duplicate alternatives removed.
 */
export function validateRecommendation(rec: Recommendation, facts: ProductFacts, bundle: EvidenceBundle, brand: BrandSettings): Validated {
  const errors: string[] = [];
  const warnings = [...rec.warnings];
  const allowed = allowedWords(facts, brand);
  const noun = singular((facts.product_type ?? "").toLowerCase().split(/\s+/).pop() ?? "");
  const fmt = (t: string) => (brand.titleCase === "title" ? titleCase(t) : brand.titleCase === "lower" ? t.toLowerCase() : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());

  const title = rec.recommended_title.replace(/\s+/g, " ").trim();
  if (!title) errors.push("recommended_title is empty");

  // product noun
  if (noun && !toks(title).some((w) => singular(w) === noun)) errors.push(`Title must contain the product type "${facts.product_type}"`);

  // prohibited / avoided vocabulary
  const banned = [...brand.prohibitedTerms, ...brand.avoidWords].filter(Boolean);
  const check = (t: string, label: string) => {
    for (const b of banned) if (new RegExp(`(^|\\s)${b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(t.toLowerCase())) errors.push(`${label} contains prohibited term "${b}"`);
    const bad = unsupportedIn(t, allowed);
    if (bad.length) errors.push(`${label} uses words the buyer did not supply: ${bad.join(", ")}`);
  };
  check(title, "Recommended title");

  for (const core of brand.requiredCoreTerms) if (core && !title.toLowerCase().includes(core.toLowerCase())) warnings.push(`Brand core term "${core}" is not in the title`);
  if (title.length > brand.maxTitleLength) warnings.push(`Title is ${title.length} characters (brand maximum ${brand.maxTitleLength})`);

  // keyword citations must exist in THIS generation's evidence
  const known = new Map(bundle.keywords.map((k) => [normalizeKeyword(k.keyword), k]));
  const cited = [rec.primary_keyword, ...rec.supporting_keywords].filter((k): k is string => !!k);
  for (const k of cited) if (!known.has(normalizeKeyword(k))) errors.push(`Keyword "${k}" is not in the keyword evidence`);
  if (rec.primary_keyword === null && bundle.keywords.length) warnings.push("No primary keyword was chosen even though keyword evidence exists");
  const kIds = new Set(bundle.keywords.map((k) => k.id)), sIds = new Set(bundle.serp.map((s) => s.id));
  for (const id of rec.evidence_keyword_ids) if (!kIds.has(id)) errors.push(`Unknown keyword evidence id ${id}`);
  for (const id of rec.evidence_serp_result_ids) if (!sIds.has(id)) errors.push(`Unknown search-result evidence id ${id}`);

  // alternatives: valid, different from the recommendation and each other, max 3
  const alts: Recommendation["alternatives"] = [];
  for (const a of rec.alternatives) {
    const t = a.title.replace(/\s+/g, " ").trim();
    if (!t || sameSet(t, title) || flat(t) === flat(title) || alts.some((x) => sameSet(x.title, t))) continue; // punctuation/duplicate: drop silently
    if (alts.length >= 3) { warnings.push("Extra alternatives were dropped (maximum 3)"); break; }
    const before = errors.length;
    check(t, `Alternative "${t}"`);
    if (errors.length === before && toks(t).some((w) => singular(w) === noun)) alts.push({ title: fmt(t), trade_off: a.trade_off });
  }

  return { errors, warnings: [...new Set(warnings)], cleaned: { ...rec, recommended_title: fmt(title), alternatives: alts, warnings: [...new Set(warnings)] } };
}

/** Alternatives that still fail after the repair attempt are dropped with a visible note instead of failing the generation. */
export function dropBadAlternatives(v: Validated, rec: Recommendation, facts: ProductFacts, bundle: EvidenceBundle, brand: BrandSettings): Validated {
  const own = validateRecommendation({ ...rec, alternatives: [] }, facts, bundle, brand);
  if (own.errors.length) return v; // the main title is the problem: caller handles
  const kept: Recommendation["alternatives"] = [];
  const notes: string[] = [];
  for (const a of rec.alternatives) {
    const t = validateRecommendation({ ...rec, alternatives: [a] }, facts, bundle, brand);
    if (t.errors.length) notes.push(`Dropped alternative "${a.title}": ${t.errors[0]}`);
    else kept.push(...t.cleaned.alternatives.filter((x) => !kept.some((k) => sameSet(k.title, x.title))));
  }
  const cleaned = { ...own.cleaned, alternatives: kept.slice(0, 3), warnings: [...own.warnings, ...notes] };
  return { errors: [], warnings: cleaned.warnings, cleaned };
}
