import { z } from "zod";

export const BrandSettings = z.object({
  titleCase: z.enum(["title", "sentence", "lower"]).default("title"),
  maxTitleLength: z.number().int().min(10).max(200).default(70),
  attributeOrder: z.array(z.string()).optional(), // explicit override; unset = learned from the keyword list
  requiredCoreTerms: z.array(z.string()).default([]),
  allowedVocabulary: z.array(z.string()).default([]),
  prohibitedTerms: z.array(z.string()).default([]),
  avoidWords: z.array(z.string()).default([]),
  goodExamples: z.array(z.string()).default([]),
  poorExamples: z.array(z.string()).default([]),
  maxSerpQueries: z.number().int().min(0).max(10).default(3),
  serp: z.object({ location: z.string().default("Australia"), language: z.string().default("English"), device: z.string().default("desktop") }).default({ location: "Australia", language: "English", device: "desktop" }),
}).passthrough();
export type BrandSettings = z.infer<typeof BrandSettings>;

export const parseBrandSettings = (raw: unknown): BrandSettings => BrandSettings.parse(raw ?? {});
