// ─── Storefront catalog client + mapping layer ───────────────────────
// Fetches the public catalog from the API (GET /api/v1/store/*) and maps
// the API response shapes (integer paise, weights in mg, image URL lists,
// UUID-only categories) onto the storefront's UI types (rupees, grams,
// ProductImage objects, slugged categories).
//
// Works on the server (server components, `next.revalidate` ISR) and in
// the browser (client components) -- it only needs `fetch`.

import { API_BASE_URL, STORE_API, TENANT_ID, PURITY_OPTIONS } from "./constants";
import { ApiError } from "./api";
import { PRODUCT_PLACEHOLDER, categoryTile, resolveImageUrl as resolveBundledImageUrl } from "./images";
import type {
  Category,
  FilterState,
  GoldRate,
  MetalType,
  PaginatedResult,
  Product,
  ProductImage,
  Review,
} from "./types";

// ─── API response shapes (see packages/shared-types/src/storefront.ts) ──

export interface ApiReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: Record<string, number>;
}

export interface ApiCatalogProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  productType: string;
  metalPurity: number | null;
  metalWeightMg: number | null;
  grossWeightMg: number | null;
  netWeightMg: number | null;
  stoneWeightCt: number | null;
  makingChargesPaise: number | null;
  wastagePercent: number | null;
  metalValuePaise: number;
  makingValuePaise: number;
  wastageValuePaise: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPricePaise: number;
  currencyCode: string;
  images: string[] | null;
  attributes: Record<string, unknown> | null;
  huidNumber: string | null;
  hallmarkNumber: string | null;
  reviewSummary: ApiReviewSummary;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  availableQuantity: number;
  isActive: boolean;
}

export interface ApiCategory {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  sortOrder: number;
  children?: ApiCategory[];
}

export interface ApiLiveRate {
  metalType: string;
  purity: number;
  ratePaisePer10g: number;
  currencyCode: string;
  updatedAt: string;
}

export interface ApiBanner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  sortOrder: number;
}

export interface ApiHome {
  featuredProducts: ApiCatalogProduct[];
  newArrivals: ApiCatalogProduct[];
  categories: ApiCategory[];
  liveRates: ApiLiveRate[];
  banners: ApiBanner[];
}

export interface ApiPaginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiReview {
  id: string;
  productId: string;
  customerId: string | null;
  customerName: string;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[] | null;
  isVerified: boolean;
  helpfulCount: number;
  createdAt: string;
}

// ─── UI-side result types ─────────────────────────────────────────────

/** Product plus the per-star review distribution the API provides. */
export interface CatalogProduct extends Product {
  ratingBreakdown?: Record<string, number>;
}

export interface CatalogPage extends PaginatedResult<CatalogProduct> {
  hasNext: boolean;
}

export interface HomeData {
  featuredProducts: CatalogProduct[];
  newArrivals: CatalogProduct[];
  categories: Category[];
  liveRates: GoldRate[];
}

// ─── Small helpers ────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "rings" and "ring" (and "Nose Pins"/"nose-pin") should resolve to the same category. */
function slugVariants(slug: string): string[] {
  const s = slugify(slug);
  return [s, s.replace(/s$/, ""), s.replace(/es$/, "")];
}

function looseMatch(a: string, b: string): boolean {
  const vb = slugVariants(b);
  return slugVariants(a).some((v) => vb.includes(v));
}

function mgToGrams(mg: number | null | undefined): number {
  if (!mg || mg <= 0) return 0;
  return Math.round(mg) / 1000;
}

export function purityLabelFor(purity: number | null, metal: string): string {
  if (!purity) return "";
  const known = PURITY_OPTIONS.find((p) => p.value === purity);
  if (known) return `${known.karat}K`;
  if (metal === "SILVER" || metal === "PLATINUM") return String(purity);
  return String(purity);
}

const METAL_TYPES: readonly string[] = [
  "GOLD",
  "SILVER",
  "PLATINUM",
  "DIAMOND",
  "GEMSTONE",
  "KUNDAN",
];

function toMetalType(productType: string): MetalType {
  const t = productType.toUpperCase();
  return (METAL_TYPES.includes(t) ? t : "GOLD") as MetalType;
}

function resolveImageUrl(url: string): string {
  return resolveBundledImageUrl(url, API_BASE_URL);
}

export function mapImages(urls: string[] | null | undefined, name: string): ProductImage[] {
  const list = (urls ?? []).filter((u): u is string => typeof u === "string" && u.length > 0);
  if (list.length === 0) {
    return [
      {
        id: "placeholder",
        url: PRODUCT_PLACEHOLDER,
        alt: name,
        isPrimary: true,
        sortOrder: 0,
      },
    ];
  }
  return list.map((url, i) => ({
    id: `img-${i}`,
    url: resolveImageUrl(url),
    alt: list.length > 1 ? `${name} - view ${i + 1}` : name,
    isPrimary: i === 0,
    sortOrder: i,
  }));
}

const OCCASION_ALIASES: Record<string, string> = {
  bridal: "wedding",
  daily: "daily-wear",
  everyday: "daily-wear",
  office: "office-wear",
};

function normalizeOccasion(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => {
      const s = slugify(v);
      return OCCASION_ALIASES[s] ?? s;
    });
}

function normalizeGender(value: unknown): Product["gender"] {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "men" || v === "male") return "men";
  if (v === "women" || v === "female") return "women";
  if (v === "kids" || v === "kid" || v === "children") return "kids";
  return "unisex";
}

function titleCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSpecifications(p: ApiCatalogProduct): Record<string, string> {
  const specs: Record<string, string> = {};
  // The detail page already renders these rows itself; avoid duplicates.
  const BUILT_IN = new Set(["purity", "metaltype", "grossweight", "netweight", "huid"]);
  for (const [k, v] of Object.entries(p.attributes ?? {})) {
    if (BUILT_IN.has(k.replace(/[^a-z]/gi, "").toLowerCase())) continue;
    if (v === null || v === undefined || typeof v === "object") continue;
    specs[titleCase(k)] = String(v);
  }
  if (p.hallmarkNumber) specs["Hallmark Number"] = p.hallmarkNumber;
  return specs;
}

function shortDescription(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137).trimEnd()}...` : firstSentence;
}

// ─── Mapping: API -> UI types ────────────────────────────────────────

/**
 * Map an API catalog product to the UI Product.
 *
 * Pricing: the API returns a fully-calculated price in paise
 * (metal + making + wastage + GST). The UI recomputes the price with
 * calculateProductPrice() from rate/making fields, so we express the
 * API numbers in those terms so both agree: the metal rate is derived
 * from metalValuePaise / net weight, and everything else on top of metal
 * (making + wastage) becomes a flat making charge in rupees.
 */
export function mapProduct(p: ApiCatalogProduct, opts: { isNew?: boolean } = {}): CatalogProduct {
  const netG = mgToGrams(p.netWeightMg ?? p.metalWeightMg ?? p.grossWeightMg);
  const grossG = mgToGrams(p.grossWeightMg) || netG;
  const metalType = toMetalType(p.productType);
  const description = p.description ?? "";
  const categoryName = p.subCategoryName ?? p.categoryName ?? "Jewellery";
  const categoryId = p.subCategoryId ?? p.categoryId ?? "";
  const attrs = p.attributes ?? {};

  const metalValueRupees = p.metalValuePaise / 100;
  const metalRatePerGram = netG > 0 ? metalValueRupees / netG : 0;
  // With no weight to carry the metal value, fold it into the flat charge.
  const flatPaise = Math.max(0, p.subtotalPaise - (netG > 0 ? p.metalValuePaise : 0));

  const occasion = normalizeOccasion(attrs.occasion);
  const tags = Array.from(
    new Set(
      [metalType.toLowerCase(), slugify(categoryName), ...occasion].filter((t) => t.length > 0),
    ),
  );

  return {
    id: p.id,
    name: p.name,
    slug: slugify(p.name),
    sku: p.sku,
    description,
    shortDescription: shortDescription(description),
    categoryId,
    categoryName,
    categorySlug: slugify(categoryName),
    metalType,
    purity: p.metalPurity ?? 0,
    purityLabel: purityLabelFor(p.metalPurity, metalType),
    grossWeightGrams: grossG,
    netWeightGrams: netG,
    images: mapImages(p.images, p.name),
    metalRatePerGram,
    makingChargesPerGram: 0,
    makingChargesType: "flat",
    makingChargesValue: flatPaise / 100,
    stoneDetails: [],
    stoneTotalPrice: 0,
    huidNumber: p.huidNumber ?? undefined,
    gender: normalizeGender(attrs.gender),
    occasion,
    tags,
    isAvailable: p.isActive && p.stockStatus !== "OUT_OF_STOCK",
    isBestseller: false,
    isNew: opts.isNew ?? false,
    isTrending: false,
    sizes: undefined,
    specifications: buildSpecifications(p),
    rating: p.reviewSummary?.averageRating ?? 0,
    reviewCount: p.reviewSummary?.totalReviews ?? 0,
    currencyCode: p.currencyCode || "INR",
    ratingBreakdown: p.reviewSummary?.ratingBreakdown,
  };
}

/** Bundled tile for a category (see lib/images.ts); never an external host. */
export function categoryImage(name: string): string {
  return categoryTile(name);
}

export function mapCategory(c: ApiCategory): Category {
  return {
    id: c.id,
    name: c.name,
    slug: slugify(c.name),
    description: c.description ?? "",
    image: categoryImage(c.name),
    parentId: c.parentId ?? undefined,
    children: c.children?.map(mapCategory),
    productCount: 0,
  };
}

export function mapCategories(tree: ApiCategory[]): Category[] {
  return tree.map(mapCategory);
}

/** Find a category (top level or child) by slug (loosely) or by id. */
export function findCategory(slug: string, tree: Category[]): Category | null {
  const flat: Category[] = [];
  for (const c of tree) {
    flat.push(c);
    for (const child of c.children ?? []) flat.push(child);
  }
  const decoded = safeDecode(slug);
  return (
    flat.find((c) => c.id === decoded) ??
    flat.find((c) => c.slug === slugify(decoded)) ??
    flat.find((c) => looseMatch(c.slug, decoded)) ??
    null
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const RATE_METALS = new Set(["GOLD", "SILVER", "PLATINUM"]);

export function mapLiveRate(r: ApiLiveRate): GoldRate | null {
  if (!RATE_METALS.has(r.metalType.toUpperCase())) return null;
  return {
    metalType: r.metalType.toUpperCase() as GoldRate["metalType"],
    purity: r.purity,
    ratePerGram: r.ratePaisePer10g / 10 / 100,
    change24h: 0,
    changePercent24h: 0,
    updatedAt: r.updatedAt,
    currencyCode: r.currencyCode,
  };
}

export function mapReview(r: ApiReview): Review {
  return {
    id: r.id,
    userId: r.customerId ?? "",
    userName: r.customerName,
    rating: r.rating,
    title: r.title ?? "",
    comment: r.body ?? "",
    images: r.images ?? [],
    isVerifiedPurchase: r.isVerified,
    createdAt: r.createdAt,
    helpfulCount: r.helpfulCount,
  };
}

/** Deterministic IST wall-clock "HH:MM" (identical on server and client). */
export function formatISTTime(iso: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + 5.5 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} IST`;
}

// ─── Transport ────────────────────────────────────────────────────────

// Prices change with metal rates and fixes, so keep the fetch cache short:
// a stale entry must never outlive a deploy by more than a few seconds.
export const CATALOG_REVALIDATE_SECONDS = 15;
export const CATALOG_RETRY_DELAY_MS = 800;

/**
 * Run `fn`, retrying once after `delayMs` on a transient failure
 * (network error or HTTP 5xx). 4xx errors are returned immediately.
 */
export async function withOneRetry<T>(fn: () => Promise<T>, delayMs = CATALOG_RETRY_DELAY_MS): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn();
  }
}
export const CATEGORY_PAGE_SIZE = 48;

interface CatalogRequestOptions {
  /** ISR revalidate window for server-side fetches. */
  revalidate?: number;
  signal?: AbortSignal;
}

async function catalogGet<T>(path: string, opts: CatalogRequestOptions = {}): Promise<T> {
  const init: RequestInit & { next?: { revalidate: number } } = {
    method: "GET",
    headers: { Accept: "application/json", "x-tenant-id": TENANT_ID },
    signal: opts.signal,
    next: { revalidate: opts.revalidate ?? CATALOG_REVALIDATE_SECONDS },
  };
  const res = await fetch(`${STORE_API}${path}`, init);

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // empty / non-JSON body
  }

  if (!res.ok) {
    const body = json as { error?: { message?: string }; message?: string } | null;
    const msg = body?.error?.message || body?.message || `Request failed: ${res.status}`;
    throw new ApiError(res.status, msg, json);
  }

  const env = json as { success?: boolean; data?: T; error?: { message?: string } } | null;
  if (env && typeof env === "object" && "success" in env) {
    if (!env.success) {
      throw new ApiError(res.status, env.error?.message || "Request failed", json);
    }
    return env.data as T;
  }
  return json as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ─── Public API ───────────────────────────────────────────────────────

export type ProductSortBy = "createdAt" | "name" | "grossWeightMg";

export interface ProductQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  productType?: string;
  metalPurity?: number;
  priceMinPaise?: number;
  priceMaxPaise?: number;
  weightMinMg?: number;
  weightMaxMg?: number;
  search?: string;
  sortBy?: ProductSortBy;
  sortOrder?: "asc" | "desc";
}

function mapPage(data: ApiPaginated<ApiCatalogProduct>, opts: { isNew?: boolean } = {}): CatalogPage {
  const items = data.items ?? [];
  return {
    items: items.map((p) => mapProduct(p, opts)),
    total: data.total ?? items.length,
    page: data.page ?? 1,
    limit: data.limit ?? items.length,
    totalPages: data.totalPages ?? 1,
    hasNext: data.hasNext ?? false,
  };
}

export async function getProducts(
  query: ProductQuery = {},
  opts: CatalogRequestOptions = {},
): Promise<CatalogPage> {
  const data = await catalogGet<ApiPaginated<ApiCatalogProduct>>(
    `/products${qs({ ...query })}`,
    opts,
  );
  return mapPage(data);
}

/**
 * Products for a category page. The API filters by exact categoryId, so a
 * parent category (e.g. "Gold") is expanded to itself plus its children.
 * `category === null` means "all products".
 */
export async function getCategoryProducts(
  category: Category | null,
  query: Omit<ProductQuery, "categoryId"> = {},
  opts: CatalogRequestOptions = {},
): Promise<CatalogPage> {
  const ids = category ? [category.id, ...(category.children ?? []).map((c) => c.id)] : [undefined];
  if (ids.length === 1) {
    return getProducts({ ...query, categoryId: ids[0] }, opts);
  }
  const pages = await Promise.all(ids.map((categoryId) => getProducts({ ...query, categoryId }, opts)));
  const seen = new Set<string>();
  const items: CatalogProduct[] = [];
  for (const pg of pages) {
    for (const p of pg.items) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        items.push(p);
      }
    }
  }
  return {
    items,
    total: pages.reduce((sum, pg) => sum + pg.total, 0),
    page: query.page ?? 1,
    limit: query.limit ?? items.length,
    totalPages: Math.max(...pages.map((pg) => pg.totalPages)),
    hasNext: pages.some((pg) => pg.hasNext),
  };
}

export async function searchProducts(
  q: string,
  limit = 40,
  opts: CatalogRequestOptions = {},
): Promise<CatalogProduct[]> {
  const term = q.trim();
  if (!term) return [];
  const data = await catalogGet<ApiCatalogProduct[] | ApiPaginated<ApiCatalogProduct>>(
    `/products/search${qs({ q: term, limit })}`,
    opts,
  );
  const items = Array.isArray(data) ? data : (data?.items ?? []);
  return items.map((p) => mapProduct(p));
}

/** Returns null when the product does not exist (404); throws on other failures. */
export async function getProduct(
  id: string,
  opts: CatalogRequestOptions = {},
): Promise<CatalogProduct | null> {
  try {
    const data = await catalogGet<ApiCatalogProduct>(`/products/${encodeURIComponent(id)}`, opts);
    if (!data || !data.id) return null;
    return mapProduct(data);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

export async function getProductReviews(
  productId: string,
  limit = 20,
  opts: CatalogRequestOptions = {},
): Promise<Review[]> {
  const data = await catalogGet<ApiPaginated<ApiReview>>(
    `/reviews/${encodeURIComponent(productId)}${qs({ limit })}`,
    opts,
  );
  return (data?.items ?? []).map(mapReview);
}

export async function getRelatedProducts(
  product: Pick<Product, "id" | "categoryId">,
  count = 4,
  opts: CatalogRequestOptions = {},
): Promise<CatalogProduct[]> {
  const page = await getProducts(
    { limit: count + 1, categoryId: product.categoryId || undefined },
    opts,
  );
  return page.items.filter((p) => p.id !== product.id).slice(0, count);
}

export async function getCategories(opts: CatalogRequestOptions = {}): Promise<Category[]> {
  const data = await catalogGet<ApiCategory[]>("/categories", opts);
  return mapCategories(Array.isArray(data) ? data : []);
}

export async function getHome(opts: CatalogRequestOptions = {}): Promise<HomeData> {
  const data = await withOneRetry(() => catalogGet<ApiHome>("/home", opts));
  return {
    featuredProducts: (data.featuredProducts ?? []).map((p) => mapProduct(p)),
    newArrivals: (data.newArrivals ?? []).map((p) => mapProduct(p, { isNew: true })),
    categories: mapCategories(data.categories ?? []),
    liveRates: (data.liveRates ?? [])
      .map(mapLiveRate)
      .filter((r): r is GoldRate => r !== null),
  };
}

// ─── Client-side filter / sort helpers (shared by category + search) ──

/** Approximate sort key for price (paise) using the same maths as the UI. */
function priceKey(p: Product): number {
  const metal = p.netWeightGrams * p.metalRatePerGram;
  return metal + p.makingChargesValue + p.stoneTotalPrice;
}

export function applyProductFilters(products: CatalogProduct[], f: FilterState): CatalogProduct[] {
  let out = [...products];
  if (f.metalType.length > 0) out = out.filter((p) => f.metalType.includes(p.metalType));
  if (f.purity.length > 0) out = out.filter((p) => f.purity.includes(p.purity));
  if (f.gender.length > 0) out = out.filter((p) => f.gender.includes(p.gender));
  if (f.occasion.length > 0) out = out.filter((p) => p.occasion.some((o) => f.occasion.includes(o)));
  if (f.availability === "in_stock") out = out.filter((p) => p.isAvailable);

  switch (f.sortBy) {
    case "price_asc":
      out.sort((a, b) => priceKey(a) - priceKey(b));
      break;
    case "price_desc":
      out.sort((a, b) => priceKey(b) - priceKey(a));
      break;
    case "weight_asc":
      out.sort((a, b) => a.grossWeightGrams - b.grossWeightGrams);
      break;
    case "weight_desc":
      out.sort((a, b) => b.grossWeightGrams - a.grossWeightGrams);
      break;
    case "popularity":
      out.sort((a, b) => b.reviewCount - a.reviewCount);
      break;
    case "newest":
    default:
      break; // API order is newest first
  }
  return out;
}
