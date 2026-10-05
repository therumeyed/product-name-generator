import { classify, singular, type AttrClass } from "../vocab/fashion";

/**
 * Learned attribute order. For every attribute word we measure how often it comes AFTER other attribute
 * words inside real keywords (volume-weighted): 0 = always leads, 1 = always sits next to the product noun.
 * It reproduces patterns a fixed class order misses: "slip", "crossbody" and "wedding" hug the noun,
 * while "floral", "chunky" and colours lead.
 */
export type TokenScore = { s: number; n: number };
export type OrderModel = {
  version: 1;
  keywordsAnalysed: number;
  global: Record<string, TokenScore>;
  byCategory: Record<string, Record<string, TokenScore>>;
  /** Direct head-to-head evidence: "a|b" (alphabetical) -> [weight a led, weight b led, keyword count]. */
  pairs: Record<string, [number, number, number]>;
  pairsByCategory: Record<string, Record<string, [number, number, number]>>;
};
const MIN_PAIR = 6;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const MIN_GLOBAL = 8;
const MIN_CATEGORY = 15;
// Fallback when a word has too little evidence. Colours lead, length sits near the noun (matches the data).
const CLASS_DEFAULT: Record<AttrClass, number> = { colour: 0.1, feature: 0.5, material: 0.4, length: 0.75 };

type Acc = Map<string, { after: number; total: number; n: number }>;
const bump = (m: Acc, tok: string, afterWeight: number, w: number) => {
  const e = m.get(tok) ?? { after: 0, total: 0, n: 0 };
  e.after += afterWeight * w; e.total += w; e.n++;
  m.set(tok, e);
};

export class OrderAccumulator {
  private g: Acc = new Map();
  private c = new Map<string, Acc>();
  private count = 0;
  private p = new Map<string, [number, number, number]>();
  private pc = new Map<string, Map<string, [number, number, number]>>();

  private pair(m: Map<string, [number, number, number]>, first: string, second: string, w: number) {
    const k = pairKey(first, second);
    const e = m.get(k) ?? [0, 0, 0];
    e[first < second ? 0 : 1] += w;
    e[2]++;
    m.set(k, e);
  }

  add(normalized: string, category: string | null, volume: number | null) {
    const seq: string[] = [];
    for (const raw of normalized.split(" ")) {
      if (!classify(raw)) continue;
      const t = singular(raw);
      if (!seq.includes(t)) seq.push(t);
    }
    if (seq.length < 2) return;
    this.count++;
    const w = 1 + Math.log10(1 + (volume ?? 0));
    const cat = category ? (this.c.get(category) ?? this.c.set(category, new Map()).get(category)!) : null;
    const pcat = category ? (this.pc.get(category) ?? this.pc.set(category, new Map()).get(category)!) : null;
    for (let i = 0; i < seq.length; i++)
      for (let j = i + 1; j < seq.length; j++) {
        this.pair(this.p, seq[i], seq[j], w);
        if (pcat) this.pair(pcat, seq[i], seq[j], w);
      }
    for (let i = 0; i < seq.length; i++) {
      // every comparison of seq[i] against the others: it is "after" the earlier ones, "before" the later ones
      for (let j = 0; j < seq.length; j++) {
        if (i === j) continue;
        const after = j < i ? 1 : 0;
        bump(this.g, seq[i], after, w);
        if (cat) bump(cat, seq[i], after, w);
      }
    }
  }

  finalize(): OrderModel {
    const out = (m: Acc, min: number) => {
      const r: Record<string, TokenScore> = {};
      for (const [t, e] of m) if (e.n >= min) r[t] = { s: +(e.after / e.total).toFixed(3), n: e.n };
      return r;
    };
    const byCategory: OrderModel["byCategory"] = {};
    for (const [cat, m] of this.c) byCategory[cat] = out(m, MIN_CATEGORY);
    const pairs = (m: Map<string, [number, number, number]>, min: number) =>
      Object.fromEntries([...m].filter(([, v]) => v[2] >= min).map(([k, v]) => [k, [+v[0].toFixed(2), +v[1].toFixed(2), v[2]] as [number, number, number]]));
    const pairsByCategory: OrderModel["pairsByCategory"] = {};
    for (const [cat, m] of this.pc) pairsByCategory[cat] = pairs(m, 10);
    return { version: 1, keywordsAnalysed: this.count, global: out(this.g, MIN_GLOBAL), byCategory, pairs: pairs(this.p, MIN_PAIR), pairsByCategory };
  }
}

export function tokenScore(model: OrderModel | null, category: string | null, raw: string): number {
  const t = singular(raw.toLowerCase());
  const hit = (category && model?.byCategory[category]?.[t]) || model?.global[t];
  if (hit) return hit.s;
  return CLASS_DEFAULT[classify(t) ?? "feature"];
}

/** -1 if `a` should lead `b`, 1 if `b` should lead, 0 if the data doesn't say. Direct head-to-head evidence first. */
function prefer(model: OrderModel | null, category: string | null, a: string, b: string): number {
  const ta = singular(a.toLowerCase()), tb = singular(b.toLowerCase());
  const k = pairKey(ta, tb);
  const e = (category && model?.pairsByCategory[category]?.[k]) || model?.pairs[k];
  if (e) {
    const [x, y] = e;
    const aLeads = ta < tb ? x : y, bLeads = ta < tb ? y : x;
    const share = aLeads / Math.max(1e-9, aLeads + bLeads);
    if (share >= 0.6) return -1;
    if (share <= 0.4) return 1;
  }
  const d = tokenScore(model, category, ta) - tokenScore(model, category, tb);
  return d < -0.05 ? -1 : d > 0.05 ? 1 : 0;
}

/**
 * The buyer's attribute words in the order the keyword list says they naturally appear.
 * Copeland ranking (net head-to-head wins), because pairwise preferences aren't always transitive.
 */
export function orderTokens(model: OrderModel | null, category: string | null, tokens: string[]): string[] {
  return tokens
    .map((t, i) => {
      const wins = tokens.reduce((w, o, j) => (i === j ? w : w - prefer(model, category, t, o)), 0);
      return { t, i, wins, s: tokenScore(model, category, t) };
    })
    .sort((a, b) => b.wins - a.wins || a.s - b.s || a.i - b.i)
    .map((x) => x.t);
}

/** Pairs in `seq` that contradict the learned order. */
export function inversions(model: OrderModel | null, category: string | null, seq: string[]): number {
  let n = 0;
  for (let i = 0; i < seq.length; i++)
    for (let j = i + 1; j < seq.length; j++) if (prefer(model, category, seq[i], seq[j]) === 1) n++;
  return n;
}
