import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_BASE_URL: z.string().url().optional(),
  APP_NAME: z.string().default("Product Name Optimiser"),
  PROVIDER_MODE: z.enum(["live", "mock"]).default("live"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  SERP_CACHE_TTL_DAYS: z.coerce.number().int().min(0).default(7),
  MAX_SERP_QUERIES_PER_GENERATION: z.coerce.number().int().min(0).max(10).default(3),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated env, parsed lazily so `next build` doesn't need runtime secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const e = parsed.data;
  if (e.PROVIDER_MODE === "live") {
    const missing = (["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"] as const).filter(
      (k) => !e[k],
    );
    if (missing.length) {
      throw new Error(`PROVIDER_MODE=live requires: ${missing.join(", ")} (or set PROVIDER_MODE=mock)`);
    }
  }
  cached = e;
  return e;
}
