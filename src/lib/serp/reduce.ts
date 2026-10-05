import type { SerpResult } from "../providers/types";

const MARKETPLACES = /(amazon\.|ebay\.|etsy\.|temu\.|aliexpress\.|shein\.|catch\.com|kogan\.com|gumtree\.|depop\.|poshmark\.)/;
const EDITORIAL = /(vogue\.|marieclaire\.|elle\.|harpersbazaar\.|pinterest\.|youtube\.|reddit\.|wikipedia\.|instagram\.|tiktok\.|facebook\.|whowhatwear\.|cosmopolitan\.)|\/blog|\/article|\/news|\/guide/;
const PRODUCT_URL = /(\/p\/|\/product|\/products\/|\/dp\/|\/item\/|-p-\d|\/pd\/|[-/]\d{5,}(\.html)?$)/;
const CATEGORY_URL = /(\/collections?\/|\/c\/|\/category|\/categories|\/shop\/|\/browse|\/women\/|\/womens\/|\/search)/;

export type PageClass = SerpResult["pageClass"];

/** Heuristic page-class detection from URL + title. Labelled "detected", not authoritative. */
export function classifyPage(url: string, title: string, domain: string): PageClass {
  const u = `${domain}${url}`.toLowerCase();
  const t = title.toLowerCase();
  if (MARKETPLACES.test(u)) return "marketplace";
  if (EDITORIAL.test(u) || /^(best|how to|\d+\s+(best|ways))|\bideas\b|\bguide\b/.test(t)) return "editorial";
  if (PRODUCT_URL.test(u)) return "product";
  if (CATEGORY_URL.test(u) || /^(shop|buy)\b|\b(dresses|tops|shoes|bags|pants|jeans|skirts|jackets)\b\s*[|\-–]/.test(t)) return "category";
  return "other";
}

/** "Black Midi Dress | Brand Name" -> "Black Midi Dress". Strips trailing site names so brand words don't pollute patterns. */
export function cleanTitle(title: string): string {
  return title.split(/\s[|\-–—:]\s|\s[|]\s?/)[0].replace(/\s+/g, " ").trim();
}
