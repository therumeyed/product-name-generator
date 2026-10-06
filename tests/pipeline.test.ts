import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createGeneration, runPipeline } from "@/lib/pipeline/run";
import { MockFactExtractor, MockRecommender, MockSerpProvider } from "@/lib/providers/mock";
import type { Providers } from "@/lib/providers";
import { loadGenerationFor } from "@/lib/pipeline/access";
import { resetDb, seedBrand } from "./helpers";

const fresh = () => {
  const recommender = new MockRecommender();
  const serp = new MockSerpProvider();
  const providers: Providers = { extractor: new MockFactExtractor(), recommender, serp, modelName: "mock" };
  return { recommender, serp, providers };
};
const dress = { freeText: "black midi dress with ruching", productType: "dress", colour: "black", length: "midi", feature: "ruched" };

async function run(user: { id: string }, brandId: string, input: object, p: Providers) {
  const id = await createGeneration({ id: user.id, brandId }, brandId, input);
  await runPipeline(id, p);
  return db.generation.findUniqueOrThrow({ where: { id } });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await resetDb(); await db.$disconnect(); });

describe("successful generation", () => {
  it("stores facts, evidence, queries, result and usage; respects the query cap", async () => {
    const { brand, user } = await seedBrand();
    const { serp, providers } = fresh();
    const g = await run(user, brand.id, dress, providers);
    expect(g.status).toBe("completed");
    const r = g.result as { recommendation: { recommended_title: string; alternatives: unknown[] } };
    expect(r.recommendation.recommended_title).toBe("Black Ruched Midi Dress");
    expect(r.recommendation.alternatives.length).toBeLessThanOrEqual(3);
    expect(g.extractedFacts).toMatchObject({ product_type: "dress", colour: ["black"] });
    expect(g.datasetId).toBe(brand.activeKeywordDatasetId ?? g.datasetId);
    expect((g.selectedQueries as unknown[]).length).toBeLessThanOrEqual(3);
    expect(serp.calls.length).toBeLessThanOrEqual(3);
    expect(new Set(serp.calls).size).toBe(serp.calls.length); // distinct
    expect(g.promptVersions).toMatchObject({ extraction: expect.any(String), recommend: expect.any(String) });
  });

  it("enforces the brand's lower query limit", async () => {
    const { brand, user } = await seedBrand({ maxSerpQueries: 1 });
    const { serp, providers } = fresh();
    await run(user, brand.id, dress, providers);
    expect(serp.calls).toHaveLength(1);
  });

  it("reuses the SERP cache for an equivalent second generation", async () => {
    const { brand, user } = await seedBrand();
    const a = fresh();
    await run(user, brand.id, dress, a.providers);
    const first = a.serp.calls.length;
    expect(first).toBeGreaterThan(0);
    const b = fresh();
    const g2 = await run(user, brand.id, dress, b.providers);
    expect(b.serp.calls).toHaveLength(0);
    expect((g2.usage as { serp: { cached: number } }).serp.cached).toBe(first);
  });
});

describe("fallbacks", () => {
  it("DataForSEO outage -> labelled dataset-only result, confidence capped at medium", async () => {
    const { brand, user } = await seedBrand();
    const { serp, providers } = fresh();
    serp.fail = true;
    const g = await run(user, brand.id, dress, providers);
    expect(g.status).toBe("completed");
    const r = g.result as { recommendation: { confidence: string; warnings: string[] }; meta: { serpStatus: string } };
    expect(r.meta.serpStatus).toBe("unavailable");
    expect(r.recommendation.warnings).toContain("Live search results were unavailable; recommendation used the keyword dataset only.");
    expect(["medium", "low"]).toContain(r.recommendation.confidence);
  });

  it("Claude outage -> failed generation keeps evidence; retry reuses it with NO new SERP calls", async () => {
    const { brand, user } = await seedBrand();
    const { serp, recommender, providers } = fresh();
    recommender.failTimes = 1;
    const failed = await run(user, brand.id, dress, providers);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("ai_unavailable");
    expect(failed.candidateEvidence).not.toBeNull();
    const callsBefore = serp.calls.length;
    expect(callsBefore).toBeGreaterThan(0);

    await runPipeline(failed.id, providers); // the retry
    const done = await db.generation.findUniqueOrThrow({ where: { id: failed.id } });
    expect(done.status).toBe("completed");
    expect(done.errorCode).toBeNull();
    expect(serp.calls).toHaveLength(callsBefore);
  });

  it("limited keyword evidence -> low confidence, no demand claimed, no primary keyword", async () => {
    const { brand, user } = await seedBrand();
    const g = await run(user, brand.id, { freeText: "zebraprint dress", productType: "dress", pattern: "zebraprint" }, fresh().providers);
    const r = g.result as { recommendation: { confidence: string; primary_keyword: string | null; recommended_title: string; warnings: string[] } };
    expect(r.recommendation.confidence).toBe("low");
    expect(r.recommendation.primary_keyword).toBeNull();
    expect(r.recommendation.recommended_title).toBe("Zebraprint Dress"); // buyer's detail is never dropped
    expect(r.recommendation.warnings.join(" ")).toMatch(/Limited keyword evidence/);
  });

  it("works with no active dataset (clearly labelled)", async () => {
    const { brand, user } = await seedBrand({}, false);
    const g = await run(user, brand.id, dress, fresh().providers);
    expect(g.status).toBe("completed");
    expect((g.result as { recommendation: { warnings: string[] } }).recommendation.warnings.join(" ")).toMatch(/No keyword dataset is active/);
  });
});

describe("no paid calls before the input is sound", () => {
  it("conflicting facts stop before any SERP call", async () => {
    const { brand, user } = await seedBrand();
    const { serp, providers } = fresh();
    const g = await run(user, brand.id, { freeText: "mini and maxi dress", productType: "dress", length: "mini, maxi" }, providers);
    expect(g.status).toBe("needs_input");
    expect((g.result as { needs: string }).needs).toBe("correction");
    expect(serp.calls).toHaveLength(0);
  });

  it("unrecognised product type stops before any SERP call", async () => {
    const { brand, user } = await seedBrand();
    const { serp, providers } = fresh();
    const g = await run(user, brand.id, { freeText: "fancy thing", productType: "zorblax" }, providers);
    expect(g.status).toBe("needs_input");
    expect((g.result as { needs: string }).needs).toBe("product_type");
    expect(serp.calls).toHaveLength(0);
  });
});

describe("access", () => {
  it("buyers see only their own generations; other brands are 404", async () => {
    const { brand, user } = await seedBrand();
    const other = await db.user.create({ data: { username: "other", displayName: "O", passwordHash: "x", role: "buyer", brandId: brand.id } });
    const g = await run(user, brand.id, dress, fresh().providers);
    const su = (u: typeof user) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, brandId: u.brandId, brandName: null });
    await expect(loadGenerationFor(su(user), g.id)).resolves.toBeTruthy();
    await expect(loadGenerationFor(su(other), g.id)).rejects.toMatchObject({ status: 404 });
    const admin = await db.user.create({ data: { username: "adm", displayName: "A", passwordHash: "x", role: "admin", brandId: brand.id } });
    await expect(loadGenerationFor(su(admin), g.id)).resolves.toBeTruthy();
    const otherBrand = await db.brand.create({ data: { name: "X", slug: "x" } });
    const outsider = await db.user.create({ data: { username: "out", displayName: "O", passwordHash: "x", role: "admin", brandId: otherBrand.id } });
    await expect(loadGenerationFor(su(outsider), g.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("setup problems", () => {
  it("missing provider settings fail the generation visibly (never stuck pending) and name the variables", async () => {
    const { brand, user } = await seedBrand();
    const saved = { ...process.env };
    process.env.PROVIDER_MODE = "live";
    delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_MODEL; delete process.env.DATAFORSEO_LOGIN; delete process.env.DATAFORSEO_PASSWORD;
    // env() caches after first success; the provider cache must not hide the misconfiguration either.
    vi.resetModules();
    try {
      const run = await import("@/lib/pipeline/run");
      const id = await run.createGeneration({ id: user.id, brandId: brand.id }, brand.id, dress);
      await run.runPipeline(id); // no injected providers: uses the real factory
      const g = await db.generation.findUniqueOrThrow({ where: { id } });
      expect(g.status).toBe("failed");
      expect(g.errorCode).toBe("config_error");
      const msg = ((g.usage ?? {}) as { errorMessage?: string }).errorMessage ?? "";
      expect(msg).toMatch(/ANTHROPIC_API_KEY.*ANTHROPIC_MODEL.*DATAFORSEO_LOGIN.*DATAFORSEO_PASSWORD/);
    } finally { process.env = saved; }
  });

  it("stale in-progress generations are failed by the sweep", async () => {
    const { brand, user } = await seedBrand();
    const g = await db.generation.create({ data: { brandId: brand.id, userId: user.id, originalInput: dress, status: "searching", createdAt: new Date(Date.now() - 10 * 60_000) } });
    const { failStaleGenerations } = await import("@/lib/pipeline/run");
    await failStaleGenerations({ brandId: brand.id });
    expect((await db.generation.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("failed");
  });
});
