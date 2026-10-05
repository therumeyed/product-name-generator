import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DataForSeoProvider, parseResponse, SerpProviderError } from "@/lib/providers/dataforseo";
import { ClaudeClient } from "@/lib/providers/anthropic";
import { AiError } from "@/lib/providers/types";
import { Recommendation } from "@/lib/pipeline/types";
import { serpCacheKey } from "@/lib/serp/cache";
import { classifyPage, cleanTitle } from "@/lib/serp/reduce";
import { planQueries } from "@/lib/pipeline/queries";
import { emptyFacts } from "./helpers";

const fixture = JSON.parse(readFileSync("tests/fixtures/dataforseo-organic.json", "utf8"));

describe("DataForSEO (mocked HTTP; not run against the live API)", () => {
  it("reduces the payload: organic only, classified, snippets truncated", () => {
    const r = parseResponse("black midi dress", fixture);
    expect(r.results).toHaveLength(3);
    expect(r.results.map((x) => x.pageClass)).toEqual(["product", "category", "editorial"]);
    expect(r.costUsd).toBe(0.002);
    expect(r.results.every((x) => x.snippet.length <= 200)).toBe(true);
  });
  it("sends Basic auth and the Australia/English/desktop body", async () => {
    let seen: { headers: Record<string, string>; body: string } | undefined;
    const f = (async (_u: string, init: RequestInit) => { seen = { headers: init.headers as Record<string, string>, body: String(init.body) }; return new Response(JSON.stringify(fixture), { status: 200 }); }) as unknown as typeof fetch;
    await new DataForSeoProvider("login", "pw", f).search({ query: "black midi dress", location: "Australia", language: "English", device: "desktop", depth: 10 });
    expect(seen!.headers.Authorization).toBe("Basic " + Buffer.from("login:pw").toString("base64"));
    expect(JSON.parse(seen!.body)[0]).toMatchObject({ keyword: "black midi dress", location_name: "Australia", language_name: "English", device: "desktop" });
  });
  it("does not retry bad credentials; retries a 500 then succeeds", async () => {
    let n = 0;
    const bad = (async () => { n++; return new Response("no", { status: 401 }); }) as unknown as typeof fetch;
    await expect(new DataForSeoProvider("a", "b", bad).search({ query: "q", location: "l", language: "e", device: "d", depth: 10 })).rejects.toBeInstanceOf(SerpProviderError);
    expect(n).toBe(1);
    let m = 0;
    const flaky = (async () => (++m < 2 ? new Response("x", { status: 503 }) : new Response(JSON.stringify(fixture), { status: 200 }))) as unknown as typeof fetch;
    const r = await new DataForSeoProvider("a", "b", flaky).search({ query: "q", location: "l", language: "e", device: "d", depth: 10 });
    expect(m).toBe(2);
    expect(r.results.length).toBe(3);
  }, 15_000);
});

describe("Claude client (mocked SDK)", () => {
  const rec = { recommended_title: "Black Midi Dress", confidence: "high", primary_keyword: null, supporting_keywords: [], title_structure: [], alternatives: [], reason: "r", warnings: [], evidence_keyword_ids: [], evidence_serp_result_ids: [] };
  const fake = (res: object) => new ClaudeClient("k", "any-model", { messages: { parse: async () => res } } as never);
  it("returns parsed output and token usage", async () => {
    const out = await fake({ stop_reason: "end_turn", parsed_output: rec, usage: { input_tokens: 10, output_tokens: 5 } }).json("sys", "user", Recommendation);
    expect(out.data.recommended_title).toBe("Black Midi Dress");
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
  it("maps refusal and unparseable output to typed errors", async () => {
    await expect(fake({ stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 1 } }).json("s", "u", Recommendation)).rejects.toMatchObject({ code: "ai_refusal" });
    await expect(fake({ stop_reason: "end_turn", parsed_output: null, usage: { input_tokens: 1, output_tokens: 1 } }).json("s", "u", Recommendation)).rejects.toBeInstanceOf(AiError);
  });
});

describe("serp helpers", () => {
  it("builds equal cache keys for equivalent queries", () => {
    const s = { location: "Australia", language: "English", device: "desktop", depth: 10 };
    expect(serpCacheKey("  Black  MIDI dress ", s)).toBe(serpCacheKey("black midi dress", s));
    expect(serpCacheKey("black midi dress", { ...s, device: "mobile" })).not.toBe(serpCacheKey("black midi dress", s));
  });
  it("classifies pages and strips site names", () => {
    expect(classifyPage("https://x.com/p/1", "Black Dress", "x.com")).toBe("product");
    expect(classifyPage("https://www.amazon.com.au/dp/1", "Black Dress", "amazon.com.au")).toBe("marketplace");
    expect(classifyPage("https://m.com/blog/x", "Best dresses", "m.com")).toBe("editorial");
    expect(cleanTitle("Black Midi Dress | The Iconic")).toBe("Black Midi Dress");
  });
});

describe("query planning", () => {
  const kw = (k: string, v = 100) => ({ id: "K", keyword: k, searchVolume: v, category: "Dresses", score: 1, flags: [] });
  const order = { keywordOrder: ["black", "midi"], serpOrder: null, final: ["black", "midi"], suggestedTitle: "Black Midi Dress" };
  const facts = { ...emptyFacts, product_type: "dress", colour: ["black"], length: ["midi"] };
  it("caps at max, stays distinct and short", () => {
    const q = planQueries(facts, [kw("black midi dress"), kw("black midi dresses"), kw("midi dress")], order, 3);
    expect(q.length).toBeLessThanOrEqual(3);
    expect(new Set(q.map((x) => x.query)).size).toBe(q.length);
    expect(q.every((x) => x.query.split(" ").length <= 6 && x.reason.length > 0)).toBe(true);
    expect(planQueries(facts, [kw("black midi dress")], order, 0)).toEqual([]);
    expect(planQueries(facts, [kw("black midi dress")], order, 1)).toHaveLength(1);
  });
});
