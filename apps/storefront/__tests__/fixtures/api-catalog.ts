// Fixtures shaped exactly like the real GET /api/v1/store/* responses
// (captured from the seeded demo tenant), plus a fetch router for tests.
import { vi } from "vitest";
import type { ApiCatalogProduct, ApiCategory, ApiReview } from "@/lib/catalog";

export const CAT_GOLD = "0b296bb8-69df-4406-854a-7de0a863c934";
export const CAT_RING = "4abe0bbe-6229-47cb-83df-9288a41e3fd2";
export const CAT_NECKLACE = "9e835a62-af8f-4fd3-895a-c69733051269";
export const CAT_SILVER = "de04b071-7d4e-4426-8c6b-c4eb02302c4e";

export const apiCategories: ApiCategory[] = [
  {
    id: CAT_GOLD,
    name: "Gold",
    parentId: null,
    description: "Gold jewelry and ornaments",
    sortOrder: 1,
    children: [
      { id: CAT_NECKLACE, name: "Necklace", parentId: CAT_GOLD, description: null, sortOrder: 1 },
      { id: CAT_RING, name: "Ring", parentId: CAT_GOLD, description: null, sortOrder: 2 },
    ],
  },
  { id: CAT_SILVER, name: "Silver", parentId: null, description: "Silver jewelry and ornaments", sortOrder: 2, children: [] },
];

export const PRODUCT_A_ID = "d6bc4d38-a796-4bb7-8c4c-9867ff8e9282";
export const PRODUCT_B_ID = "a513fce4-fbb7-4279-8d6e-e0b85b19cee1";
export const PRODUCT_C_ID = "0e545504-a72a-4f44-8f4f-8c62927942c1";

const summary = { averageRating: 0, totalReviews: 0, ratingBreakdown: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } };

export const apiProductA: ApiCatalogProduct = {
  id: PRODUCT_A_ID,
  sku: "SJ-MANG-18K-080",
  name: "18K Mangalsutra B10",
  description: "Finely crafted 18K mangalsutra with BIS hallmark.",
  categoryId: CAT_RING,
  categoryName: "Ring",
  subCategoryId: null,
  subCategoryName: null,
  productType: "GOLD",
  metalPurity: 750,
  metalWeightMg: 23000,
  grossWeightMg: 25000,
  netWeightMg: 23000,
  stoneWeightCt: null,
  makingChargesPaise: 147200,
  wastagePercent: 200,
  metalValuePaise: 0,
  makingValuePaise: 147200,
  wastageValuePaise: 0,
  subtotalPaise: 147200,
  gstPaise: 4416,
  totalPricePaise: 151616,
  currencyCode: "INR",
  images: ["https://picsum.photos/seed/mangalsutra/600/600", "https://picsum.photos/seed/mangalsutra/600/600?2"],
  attributes: { finish: "Polished", purity: "18K", occasion: "Bridal" },
  huidNumber: "BA36A1",
  hallmarkNumber: "HM-BA36A1",
  reviewSummary: summary,
  stockStatus: "OUT_OF_STOCK",
  availableQuantity: 0,
  isActive: true,
};

// A product with live metal pricing and stock.
export const apiProductB: ApiCatalogProduct = {
  ...apiProductA,
  id: PRODUCT_B_ID,
  sku: "SJ-BRAC-22K-079",
  name: "22K Gold Bracelet A9",
  description: "Finely crafted 22K gold bracelet with BIS hallmark. Lightweight for daily wear.",
  metalPurity: 916,
  metalWeightMg: 8280,
  grossWeightMg: 9000,
  netWeightMg: 8280,
  metalValuePaise: 5_000_000,
  makingValuePaise: 181900,
  subtotalPaise: 5_181_900,
  gstPaise: 155457,
  totalPricePaise: 5_337_357,
  images: ["https://picsum.photos/seed/bracelet/600/600"],
  attributes: { finish: "Polished", purity: "22K", occasion: "Festive", gender: "women" },
  reviewSummary: { averageRating: 4.5, totalReviews: 2, ratingBreakdown: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 } },
  stockStatus: "IN_STOCK",
  availableQuantity: 5,
};

export const apiProductC: ApiCatalogProduct = {
  ...apiProductA,
  id: PRODUCT_C_ID,
  sku: "SJ-PEND-14K-078",
  name: "14K Gold Pendant Z8",
  description: "Finely crafted 14K gold pendant with BIS hallmark.",
  metalPurity: 585,
  images: null,
  attributes: null,
};

export const apiProducts = [apiProductA, apiProductB, apiProductC];

export const apiReviews: ApiReview[] = [
  {
    id: "0f6c1f0a-6d8e-4b53-8a3f-1d2b6c9a7e10",
    productId: PRODUCT_B_ID,
    customerId: "5b1f3a2c-7d4e-4f6a-9b8c-2e1d0c3b4a59",
    customerName: "Priya S.",
    rating: 5,
    title: "Gorgeous",
    body: "Beautiful finish and very light.",
    images: null,
    isVerified: true,
    helpfulCount: 3,
    createdAt: "2026-03-01T10:00:00.000Z",
  },
];

export function page<T>(items: T[], extra: Record<string, unknown> = {}) {
  return {
    items,
    total: items.length,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
    ...extra,
  };
}

export const apiHome = {
  featuredProducts: [] as ApiCatalogProduct[],
  newArrivals: apiProducts,
  categories: apiCategories,
  liveRates: [
    { metalType: "GOLD", purity: 916, ratePaisePer10g: 66_730_00, currencyCode: "INR", updatedAt: "2026-03-01T06:30:00.000Z" },
    { metalType: "GOLD", purity: 750, ratePaisePer10g: 54_640_00, currencyCode: "INR", updatedAt: "2026-03-01T06:30:00.000Z" },
    { metalType: "SILVER", purity: 999, ratePaisePer10g: 890_00, currencyCode: "INR", updatedAt: "2026-03-01T06:30:00.000Z" },
  ],
  banners: [],
};

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

export const ok = (data: unknown) => res(200, { success: true, data });
export const notFoundRes = () => res(404, { success: false, error: { code: "NOT_FOUND", message: "Product not found" } });
export const serverErrorRes = () => res(500, { success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });

export type Router = (url: URL) => ReturnType<typeof res> | undefined;

/** Stub global fetch with a router; unmatched URLs return an empty page. */
export function installCatalogFetch(router: Router = defaultRouter) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return router(url) ?? ok(page([]));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export const defaultRouter: Router = (url) => {
  const p = url.pathname.replace("/api/v1/store", "");
  if (p === "/home") return ok(apiHome);
  if (p === "/categories") return ok(apiCategories);
  if (p === "/products/search") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    return ok(page(apiProducts.filter((x) => x.name.toLowerCase().includes(q) || (x.categoryName ?? "").toLowerCase().includes(q))));
  }
  if (p === "/products") {
    const cat = url.searchParams.get("categoryId");
    const list = cat && cat !== CAT_RING && cat !== CAT_GOLD ? [] : apiProducts;
    return ok(page(list));
  }
  const prod = p.match(/^\/products\/(.+)$/);
  if (prod) {
    const found = apiProducts.find((x) => x.id === prod[1]);
    return found ? ok(found) : notFoundRes();
  }
  if (p.startsWith("/reviews/")) return ok(page(p.endsWith(PRODUCT_B_ID) ? apiReviews : []));
  return undefined;
};
