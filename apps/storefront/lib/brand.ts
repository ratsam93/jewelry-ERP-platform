/**
 * Single source of the brand shown to shoppers. Override at build time with
 * NEXT_PUBLIC_BRAND_NAME. Storage keys (`cf_*`, `caratflow_chat_session`) are
 * internal identifiers and intentionally NOT derived from this constant.
 */
export const BRAND_NAME: string = process.env.NEXT_PUBLIC_BRAND_NAME || "TechBeyond";

/** Name of the shop itself, used in about/footer style copy. */
export const BRAND_LEGAL: string = `${BRAND_NAME} Jewellers`;

// Two-tone wordmark: "TechBeyond" -> "Tech" + "Beyond" (split at the camel-case hump).
const parts = /^(.+?[a-z])([A-Z].*)$/.exec(BRAND_NAME);
export const BRAND_PREFIX: string = parts ? parts[1] : BRAND_NAME;
export const BRAND_SUFFIX: string = parts ? parts[2] : "";

/** Production URL fallback when NEXT_PUBLIC_SITE_URL is not set. */
export const DEFAULT_SITE_URL = "https://shop.erp.techbeyondsolution.com";
