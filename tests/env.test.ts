import { afterEach, describe, expect, it, vi } from "vitest";

const base = { DATABASE_URL: "postgresql://x", AUTH_SECRET: "a".repeat(40), PROVIDER_MODE: "mock" };
const load = async (extra: Record<string, string>) => {
  vi.resetModules();
  const saved = process.env;
  process.env = { ...base, ...extra } as NodeJS.ProcessEnv;
  try { return (await import("@/lib/env")).env(); } finally { process.env = saved; }
};
afterEach(() => vi.resetModules());

describe("env validation", () => {
  it("a bad or blank APP_BASE_URL never blocks the app", async () => {
    expect((await load({ APP_BASE_URL: "not a url" })).APP_BASE_URL).toBe("not a url");
    expect((await load({ APP_BASE_URL: "" })).APP_BASE_URL).toBeUndefined();
  });
  it("blank numeric settings fall back to defaults instead of becoming 0", async () => {
    const e = await load({ SERP_CACHE_TTL_DAYS: "", MAX_SERP_QUERIES_PER_GENERATION: "  " });
    expect(e.SERP_CACHE_TTL_DAYS).toBe(7);
    expect(e.MAX_SERP_QUERIES_PER_GENERATION).toBe(3);
  });
  it("trims stray spaces from pasted values", async () => {
    expect((await load({ PROVIDER_MODE: "live", ANTHROPIC_API_KEY: " k ", ANTHROPIC_MODEL: " claude-opus-5-5 ", DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" })).ANTHROPIC_MODEL).toBe("claude-opus-5-5");
  });
  it("live mode still names the missing provider variables", async () => {
    await expect(load({ PROVIDER_MODE: "live" })).rejects.toThrow(/ANTHROPIC_API_KEY.*ANTHROPIC_MODEL.*DATAFORSEO_LOGIN.*DATAFORSEO_PASSWORD/);
  });
});
