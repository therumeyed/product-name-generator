import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { importKeywords } from "@/lib/keywords/import";
import { combineVolumes, suggestMapping, validateMapping } from "@/lib/keywords/mapping";
import { csvSafe, normalizeKeyword, parseNumber } from "@/lib/keywords/normalize";
import { openCsv } from "@/lib/keywords/readers";
import { activateDataset } from "@/lib/keywords/versions";
import { keywordEvidenceFor } from "@/lib/keywords/evidence";
import { demandScore, scoreCandidate } from "@/lib/keywords/score";
import { assertBrandAccess } from "@/lib/auth/guards";
import { emptyFacts, resetDb } from "./helpers";

const csv = readFileSync("tests/fixtures/keywords.csv");
let brandId: string;

const run = async (name = "v1", buf = csv, rule: "max" | "sum" | "first_available" = "max") => {
  const source = await openCsv(buf);
  const mapping = { ...suggestMapping(source.headers) };
  return importKeywords({ brandId, name, filename: "k.csv", source, mapping, volumeRule: rule });
};

beforeAll(async () => { await resetDb(); });
beforeEach(async () => {
  await resetDb();
  brandId = (await db.brand.create({ data: { name: "T", slug: "t", settings: { prohibitedTerms: ["outfit"], attributeOrder: ["colour", "feature", "material", "length"] } } })).id;
});
afterAll(async () => { await resetDb(); await db.$disconnect(); });

describe("normalisation", () => {
  it("normalises keywords", () => {
    expect(normalizeKeyword("  Black’s  MIDI–Dress ")).toBe("black's midi-dress");
  });
  it("parses numbers safely and never turns blanks into 0", () => {
    expect(parseNumber("1,000")).toBe(1000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber(0)).toBe(0);
  });
  it("guards exported cells against formula injection", () => {
    expect(csvSafe("=cmd()")).toBe("'=cmd()");
    expect(csvSafe("a,b")).toBe('"a,b"');
  });
});

describe("mapping and volume rules", () => {
  it("auto-maps this file's headers, ignoring Source, keeping unknowns", () => {
    const m = suggestMapping(["Keyword", "Category", "Ahrefs Volume (AU)", "Google Keyword Planner Avg. Monthly Searches", "Ahrefs KD", "Ahrefs CPC (USD)", "Source(s)"]);
    expect(m).toMatchObject({ Keyword: "keyword", Category: "category", "Ahrefs Volume (AU)": "volume", "Google Keyword Planner Avg. Monthly Searches": "volume", "Ahrefs KD": "metadata", "Ahrefs CPC (USD)": "cpc", "Source(s)": "ignore" });
    expect(validateMapping({ a: "category" })).toMatch(/keyword/);
  });
  it("combines volumes by rule, null only when nothing is present", () => {
    expect(combineVolumes([100, 250], "max")).toBe(250);
    expect(combineVolumes([100, 250], "sum")).toBe(350);
    expect(combineVolumes([null, 250], "first_available")).toBe(250);
    expect(combineVolumes([null, null], "max")).toBeNull();
    expect(combineVolumes([0, null], "max")).toBe(0);
  });
});

describe("import", () => {
  it("accepts, rejects and de-duplicates with row numbers, and stays inactive", async () => {
    const s = await run();
    expect(s.rowsRead).toBe(22);
    expect(s.duplicates).toBe(1);
    expect(s.rejected).toBe(1); // blank keyword
    expect(s.accepted).toBe(20);
    const rej = await db.datasetRejection.findMany({ where: { datasetId: s.datasetId }, orderBy: { rowNumber: "asc" } });
    expect(rej.map((r) => r.rowNumber)).toEqual([3, 18]);
    expect(rej[0].reason).toMatch(/Duplicate of row 2/);
    const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
    expect(brand.activeKeywordDatasetId).toBeNull();
  });
  it("combines the two volume columns and keeps both raw values; blank stays null", async () => {
    const s = await run();
    const kw = (k: string) => db.keyword.findFirstOrThrow({ where: { datasetId: s.datasetId, normalizedKeyword: k } });
    expect((await kw("midi dress")).searchVolume).toBe(90000); // max(33100, 90000)
    expect((await kw("ruched midi dress")).searchVolume).toBe(1000); // "1,000" parsed
    expect((await kw("dress")).searchVolume).toBeNull(); // unavailable, not 0
    expect((await kw("black mesh top")).searchVolume).toBe(500); // "n/a" ignored
    expect(((await kw("midi dress")).metadata as { volumes: Record<string, number> }).volumes["Ahrefs Volume (AU)"]).toBe(33100);
  });
  it("a failed file never disturbs the active dataset", async () => {
    const good = await run("good");
    await activateDataset(good.datasetId);
    await expect(run("bad", Buffer.from("Keyword,Category\n,\n,\n"))).rejects.toThrow(/No valid rows/);
    const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
    expect(brand.activeKeywordDatasetId).toBe(good.datasetId);
    expect((await db.keywordDataset.findMany({ where: { name: "bad" } }))[0].status).toBe("failed");
  });
});

describe("versioning", () => {
  it("activates, archives the previous version, and rolls back", async () => {
    const v1 = await run("v1");
    const v2 = await run("v2");
    await activateDataset(v1.datasetId);
    await activateDataset(v2.datasetId);
    expect((await db.keywordDataset.findUniqueOrThrow({ where: { id: v1.datasetId } })).status).toBe("archived");
    await activateDataset(v1.datasetId); // rollback
    const brand = await db.brand.findUniqueOrThrow({ where: { id: brandId } });
    expect(brand.activeKeywordDatasetId).toBe(v1.datasetId);
    expect((await db.keywordDataset.findUniqueOrThrow({ where: { id: v2.datasetId } })).status).toBe("archived");
    expect((await db.auditEvent.findMany({ where: { eventType: "dataset.rolled_back" } })).length).toBe(1);
  });
  it("refuses to activate a failed dataset", async () => {
    await expect(run("bad", Buffer.from("Keyword\n\n"))).rejects.toThrow();
    const failed = await db.keywordDataset.findFirstOrThrow({ where: { status: "failed" } });
    await expect(activateDataset(failed.id)).rejects.toThrow(/can't be activated/);
  });
});

describe("retrieval and scoring", () => {
  const facts = { ...emptyFacts, product_type: "dress", colour: ["black"], length: ["midi"] };

  it("returns no evidence without an active dataset", async () => {
    const ev = await keywordEvidenceFor(brandId, facts);
    expect(ev).toMatchObject({ datasetId: null, limited: true, top: [] });
  });

  it("ranks relevant product-title phrases first and sinks junk", async () => {
    await activateDataset((await run()).datasetId);
    const ev = await keywordEvidenceFor(brandId, facts);
    const names = ev.top.map((k) => k.normalizedKeyword);
    expect(names[0]).toBe("black midi dress");
    expect(names).not.toContain("red midi dress"); // unsupported colour
    expect(names).not.toContain("womens black midi dress"); // unsupported audience
    expect(names).not.toContain("black midi dress outfit"); // brand-prohibited word
    const idx = (k: string) => names.indexOf(k);
    for (const junk of ["how to style a black midi dress", "black midi dress near me", "cheap black dress under $50"]) {
      if (idx(junk) >= 0) expect(idx(junk)).toBeGreaterThan(idx("black dress"));
    }
    expect(names).not.toContain("black leather boots"); // wrong product type
    expect(ev.limited).toBe(false);
  });

  it("flags limited evidence when nothing reflects the buyer's attributes", async () => {
    await activateDataset((await run()).datasetId);
    const ev = await keywordEvidenceFor(brandId, { ...emptyFacts, product_type: "dress", pattern: ["zebraprint"] });
    expect(ev.limited).toBe(true);
  });

  it("log-scales demand and treats missing volume as unavailable, not zero", () => {
    expect(demandScore(null)).toBe(0);
    expect(demandScore(1_000_000)).toBe(1);
    expect(demandScore(100_000)).toBeLessThan(1);
    expect(demandScore(100_000) / demandScore(1_000)).toBeLessThan(2); // not linear
    const c = scoreCandidate({ id: "1", originalKeyword: "dress", normalizedKeyword: "dress", searchVolume: null, category: "Dresses", subcategory: null, source: "exact" }, { ...emptyFacts, product_type: "dress" });
    expect(c?.volumeAvailable).toBe(false);
  });

  it("never penalises naturally plural nouns, but does penalise plural dress phrases", () => {
    const mk = (k: string) => ({ id: k, originalKeyword: k, normalizedKeyword: k, searchVolume: 100, category: null, subcategory: null, source: "exact" as const });
    expect(scoreCandidate(mk("wide leg pants"), { ...emptyFacts, product_type: "pant", fit_or_silhouette: ["wide leg"] })?.flags).not.toContain("plural_category_phrase");
    expect(scoreCandidate(mk("black dresses"), { ...emptyFacts, product_type: "dress", colour: ["black"] })?.flags).toContain("plural_category_phrase");
  });
});

describe("authorisation", () => {
  it("scopes brand access", () => {
    const u = (role: "owner" | "admin" | "buyer", b: string | null) => ({ id: "x", username: "x", displayName: "x", role, brandId: b, brandName: null });
    expect(() => assertBrandAccess(u("admin", "a"), "a")).not.toThrow();
    expect(() => assertBrandAccess(u("admin", "a"), "b")).toThrow();
    expect(() => assertBrandAccess(u("owner", null), "b")).not.toThrow();
  });
});
