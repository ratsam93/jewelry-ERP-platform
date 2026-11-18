// ─── Bundled storefront imagery ──────────────────────────────────────
// Every image the storefront needs without help from the API ships with the
// app under /public/images (see public/images/CREDITS.md for sources and
// licences). Nothing here depends on an external placeholder service.
//
// Product images coming from the API/database may be absolute URLs (the demo
// seed writes https://shop.<domain>/images/products/...) or relative paths.

/** Neutral image shown when a product has no (or a broken) image. */
export const PRODUCT_PLACEHOLDER = "/images/products/placeholder.webp";

/** Neutral image shown when a category has no dedicated tile. */
export const CATEGORY_PLACEHOLDER = "/images/categories/cat-default.webp";

/** Home-page hero banners (landscape, 1920x800). */
export const HERO_IMAGES = [
  "/images/hero/hero-1.webp",
  "/images/hero/hero-2.webp",
  "/images/hero/hero-3.webp",
  "/images/hero/hero-4.webp",
] as const;

/** Featured collection tiles (800x600). */
export const COLLECTION_IMAGES = {
  bridal: "/images/collections/coll-bridal.webp",
  daily: "/images/collections/coll-daily.webp",
  festive: "/images/collections/coll-festive.webp",
} as const;

/** Category tiles, matched by slug. Sub-categories reuse their parent metal's tile. */
const CATEGORY_TILES: Record<string, string> = {
  gold: "/images/categories/cat-gold.webp",
  silver: "/images/categories/cat-silver.webp",
  diamond: "/images/categories/cat-diamond.webp",
  platinum: "/images/categories/cat-platinum.webp",
  gemstone: "/images/categories/cat-gemstone.webp",
  kundan: "/images/categories/cat-kundan.webp",
  // product-type categories (storefront menu sub-categories)
  rings: "/images/products/prod-ring-01.webp",
  ring: "/images/products/prod-ring-01.webp",
  necklaces: "/images/products/prod-necklace-01.webp",
  necklace: "/images/products/prod-necklace-01.webp",
  earrings: "/images/products/prod-earring-01.webp",
  earring: "/images/products/prod-earring-01.webp",
  bangles: "/images/products/prod-bangle-01.webp",
  bangle: "/images/products/prod-bangle-01.webp",
  bracelets: "/images/products/prod-bracelet-01.webp",
  bracelet: "/images/products/prod-bracelet-01.webp",
  pendants: "/images/products/prod-pendant-01.webp",
  pendant: "/images/products/prod-pendant-01.webp",
  chains: "/images/products/prod-chain-01.webp",
  chain: "/images/products/prod-chain-01.webp",
  mangalsutra: "/images/products/prod-mangalsutra-01.webp",
  "nose-pins": "/images/products/prod-nosepin-01.webp",
  "nose-pin": "/images/products/prod-nosepin-01.webp",
};

function slugOf(nameOrSlug: string): string {
  return nameOrSlug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Local tile for a category name or slug; a neutral tile for unknown ones. */
export function categoryTile(nameOrSlug: string): string {
  return CATEGORY_TILES[slugOf(nameOrSlug)] ?? CATEGORY_PLACEHOLDER;
}

/** Unreliable third-party placeholder hosts that older seeds stored in the database. */
const LEGACY_PLACEHOLDER_HOSTS = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:picsum\.photos|loremflickr\.com|placehold\.co|placeholder\.com|via\.placeholder\.com|images\.unsplash\.com|source\.unsplash\.com)\//i;

/**
 * Resolve an image URL stored with a product / banner.
 *  - legacy placeholder-service URLs (picsum, loremflickr, ...) become the local placeholder
 *  - other absolute http(s) URLs and data: URIs are used as is
 *  - "/images/..." is a bundled storefront asset and stays relative
 *  - any other "/path" is an API-served upload and is prefixed with `apiBase`
 *  - empty / unusable values fall back to the local placeholder
 */
export function resolveImageUrl(url: string | null | undefined, apiBase = ""): string {
  const u = (url ?? "").trim();
  if (!u) return PRODUCT_PLACEHOLDER;
  if (LEGACY_PLACEHOLDER_HOSTS.test(u)) return PRODUCT_PLACEHOLDER;
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/images/")) return u;
  if (u.startsWith("/")) return `${apiBase}${u}`;
  return PRODUCT_PLACEHOLDER;
}

/** `onError` handler for <img>: swap in the local placeholder once (no loops). */
export function applyFallbackImage(
  e: { currentTarget: { src: string; dataset: DOMStringMap } },
  fallback: string = PRODUCT_PLACEHOLDER,
): void {
  const el = e.currentTarget;
  if (el.dataset.fallbackApplied) return;
  el.dataset.fallbackApplied = "1";
  el.src = fallback;
}
