/** Lowercase, Unicode-normalised, punctuation-folded, whitespace-collapsed form used for matching and dedupe. */
export function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Display form: trimmed, spaces collapsed, original case kept. */
export function cleanOriginal(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Parse a metric cell. Returns null for empty / non-numeric values (never 0), so "volume unavailable"
 * stays distinguishable from a genuine 0.
 */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[,\s$]/g, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * Spreadsheet formula-injection guard for anything we export (rejected rows CSV).
 * Cells starting with = + - @ tab or CR are prefixed with a quote.
 */
export function csvSafe(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
