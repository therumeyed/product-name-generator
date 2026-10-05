export const TARGETS = [
  "keyword",
  "category",
  "subcategory",
  "volume", // one or more columns, combined with VolumeRule
  "competition",
  "cpc",
  "intent",
  "country",
  "language",
  "updated_at",
  "metadata", // keep under its own header name in the metadata JSON
  "ignore",
] as const;
export type Target = (typeof TARGETS)[number];

export type ColumnMapping = Record<string, Target>; // source header -> target

/** How several volume columns (e.g. Ahrefs + Keyword Planner) collapse into one search_volume. */
export type VolumeRule = "max" | "sum" | "first_available";
export const VOLUME_RULES: VolumeRule[] = ["max", "sum", "first_available"];

export function combineVolumes(values: (number | null)[], rule: VolumeRule): number | null {
  const present = values.filter((v): v is number => v !== null && v >= 0);
  if (!present.length) return null;
  if (rule === "sum") return present.reduce((a, b) => a + b, 0);
  if (rule === "first_available") return present[0];
  return Math.max(...present);
}

/** Best-guess mapping from headers; the admin confirms or edits it before import. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = {};
  for (const h of headers) {
    const k = h.toLowerCase().trim();
    if (/^(keyword|keywords|search term|query|phrase)$/.test(k)) m[h] = "keyword";
    else if (/volume|searches|avg\.? monthly/.test(k)) m[h] = "volume";
    else if (/^(sub-?category)$/.test(k)) m[h] = "subcategory";
    else if (/^category$/.test(k)) m[h] = "category";
    else if (/cpc/.test(k)) m[h] = "cpc";
    else if (/competition/.test(k)) m[h] = "competition";
    else if (/^intent$/.test(k)) m[h] = "intent";
    else if (/^country$/.test(k)) m[h] = "country";
    else if (/^language$/.test(k)) m[h] = "language";
    else if (/updated/.test(k)) m[h] = "updated_at";
    else if (/^source/.test(k)) m[h] = "ignore";
    else m[h] = "metadata"; // unknown columns are retained, not lost
  }
  return m;
}

export function validateMapping(m: ColumnMapping): string | null {
  const targets = Object.values(m);
  if (targets.filter((t) => t === "keyword").length !== 1) return "Map exactly one column to keyword";
  for (const t of ["category", "subcategory", "competition", "cpc", "intent", "country", "language", "updated_at"] as const) {
    if (targets.filter((x) => x === t).length > 1) return `Only one column can map to ${t}`;
  }
  return null;
}
