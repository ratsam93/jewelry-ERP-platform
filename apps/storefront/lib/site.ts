import { DEFAULT_SITE_URL } from "@/lib/brand";
/** Public base URL of the storefront (no trailing slash). */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, "");
}
