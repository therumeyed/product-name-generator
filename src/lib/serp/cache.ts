import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { normalizeKeyword } from "../keywords/normalize";
import type { SerpProvider, SerpResponse } from "../providers/types";

export type SerpSettings = { location: string; language: string; device: string; depth: number };

/** Equivalent queries share a key: normalised query + location + language + device. */
export const serpCacheKey = (query: string, s: SerpSettings) =>
  [normalizeKeyword(query), s.location, s.language, s.device].map((x) => x.toLowerCase()).join("|");

export type SerpFetch = { response: SerpResponse; cached: boolean } | { error: string; query: string };

/**
 * Cache-first SERP fetch. Failures return {error} rather than throwing, so a DataForSEO outage degrades
 * the generation to dataset-only instead of killing it. Only genuine provider calls cost money.
 */
export async function fetchSerp(provider: SerpProvider, query: string, s: SerpSettings, ttlDays: number): Promise<SerpFetch & { calls: number }> {
  const key = serpCacheKey(query, s);
  const hit = await db.serpCache.findUnique({ where: { cacheKey: key } });
  if (hit && hit.expiresAt > new Date()) {
    const r = hit.reducedResponse as unknown as SerpResponse;
    return { response: { ...r, checkedAt: hit.fetchedAt.toISOString() }, cached: true, calls: 0 };
  }
  try {
    const response = await provider.search({ query, ...s });
    const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
    await db.serpCache.upsert({
      where: { cacheKey: key },
      create: { cacheKey: key, query, location: s.location, language: s.language, device: s.device, expiresAt, reducedResponse: response as unknown as Prisma.InputJsonValue, providerStatus: "ok", costUsd: response.costUsd ?? null },
      update: { fetchedAt: new Date(), expiresAt, reducedResponse: response as unknown as Prisma.InputJsonValue, providerStatus: "ok", costUsd: response.costUsd ?? null },
    });
    return { response, cached: false, calls: 1 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "SERP request failed", query, calls: 1 };
  }
}
