/** Public base URL of the storefront (no trailing slash). */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || "https://caratflow.globusdemos.com";
  return raw.replace(/\/+$/, "");
}
