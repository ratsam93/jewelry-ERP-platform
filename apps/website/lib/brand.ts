/**
 * Single source of the brand shown on the marketing site. Override at build
 * time with NEXT_PUBLIC_BRAND_NAME.
 */
export const BRAND_NAME: string = process.env.NEXT_PUBLIC_BRAND_NAME || "TechBeyond";

/** Legal / company name used in legal pages and footers. */
export const BRAND_LEGAL: string = BRAND_NAME;

// Two-tone wordmark: "TechBeyond" -> "Tech" + "Beyond".
const parts = /^(.+?[a-z])([A-Z].*)$/.exec(BRAND_NAME);
export const BRAND_PREFIX: string = parts ? parts[1] : BRAND_NAME;
export const BRAND_SUFFIX: string = parts ? parts[2] : "";

/** Production URL of the marketing site. */
export const DEFAULT_SITE_URL = "https://erp.techbeyondsolution.com";

/** Where the "Login" links go (the admin app). Override with NEXT_PUBLIC_APP_URL. */
export const APP_LOGIN_URL: string = `${(process.env.NEXT_PUBLIC_APP_URL || "https://app.erp.techbeyondsolution.com/admin").replace(/\/+$/, "")}/login`;
