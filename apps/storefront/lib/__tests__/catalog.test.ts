import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mapProduct,
  mapCategories,
  findCategory,
  mapLiveRate,
  mapReview,
  formatISTTime,
  slugify,
  getProduct,
  getProducts,
  getCategoryProducts,
  searchProducts,
  getHome,
  getCategories,
  applyProductFilters,
} from "@/lib/catalog";
import { calculateProductPrice } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  apiHome,
  apiProductA,
  apiProductB,
  apiProductC,
  apiCategories,
  apiReviews,
  installCatalogFetch,
  ok,
  page,
  serverErrorRes,
  notFoundRes,
  CAT_GOLD,
  CAT_RING,
  CAT_NECKLACE,
  PRODUCT_B_ID,
} from "../../__tests__/fixtures/api-catalog";
import type { FilterState } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

describe("mapProduct", () => {
  it("converts mg to grams and keeps identifiers", () => {
    const p = mapProduct(apiProductA);
    expect(p.id).toBe(apiProductA.id);
    expect(p.netWeightGrams).toBe(23);
    expect(p.grossWeightGrams).toBe(25);
    expect(p.purityLabel).toBe("18K");
    expect(p.metalType).toBe("GOLD");
    expect(p.categorySlug).toBe("ring");
    expect(p.slug).toBe("18k-mangalsutra-b10");
  });

  it("reproduces the API price through calculateProductPrice (paise)", () => {
    for (const api of [apiProductA, apiProductB]) {
      const p = mapProduct(api);
      const price = calculateProductPrice(p);
      expect(Math.abs(price.total - api.totalPricePaise)).toBeLessThanOrEqual(1);
      expect(price.metalValue).toBe(api.metalValuePaise);
    }
  });

  it("derives per-gram metal rate in rupees", () => {
    const p = mapProduct(apiProductB);
    expect(p.metalRatePerGram).toBeCloseTo(50000 / 8.28, 6);
    expect(p.makingChargesType).toBe("flat");
    expect(p.makingChargesValue).toBe(1819);
  });

  it("maps images to ProductImage objects and falls back to a placeholder", () => {
    const a = mapProduct(apiProductA);
    expect(a.images).toHaveLength(2);
    expect(a.images[0]).toMatchObject({ url: apiProductA.images![0], isPrimary: true, sortOrder: 0 });
    expect(a.images[1]!.isPrimary).toBe(false);

    const c = mapProduct(apiProductC);
    expect(c.images).toHaveLength(1);
    expect(c.images[0]!.url).toBe("/images/products/placeholder.webp");
  });

  it("maps availability, rating, occasion and specs", () => {
    const a = mapProduct(apiProductA);
    expect(a.isAvailable).toBe(false);
    expect(a.occasion).toEqual(["wedding"]);
    expect(a.specifications).toMatchObject({ Finish: "Polished", "Hallmark Number": "HM-BA36A1" });
    expect(a.huidNumber).toBe("BA36A1");

    const b = mapProduct(apiProductB, { isNew: true });
    expect(b.isAvailable).toBe(true);
    expect(b.rating).toBe(4.5);
    expect(b.reviewCount).toBe(2);
    expect(b.gender).toBe("women");
    expect(b.isNew).toBe(true);
    expect(b.ratingBreakdown?.["5"]).toBe(1);
  });

  it("tolerates a product with no weight by folding metal value into the flat charge", () => {
    const p = mapProduct({
      ...apiProductA,
      netWeightMg: null,
      metalWeightMg: null,
      grossWeightMg: null,
      metalValuePaise: 1000,
      subtotalPaise: 3000,
    });
    expect(p.netWeightGrams).toBe(0);
    expect(calculateProductPrice(p).subtotal).toBe(3000);
  });
});

describe("categories", () => {
  const tree = mapCategories(apiCategories);

  it("slugs categories and keeps children", () => {
    expect(tree[0]).toMatchObject({ name: "Gold", slug: "gold", id: CAT_GOLD });
    expect(tree[0]!.children!.map((c) => c.slug)).toEqual(["necklace", "ring"]);
    expect(tree[0]!.children![1]!.parentId).toBe(CAT_GOLD);
  });

  it("finds by slug, plural slug, id; null for unknown", () => {
    expect(findCategory("ring", tree)?.id).toBe(CAT_RING);
    expect(findCategory("rings", tree)?.id).toBe(CAT_RING);
    expect(findCategory("Necklaces", tree)?.id).toBe(CAT_NECKLACE);
    expect(findCategory(CAT_GOLD, tree)?.slug).toBe("gold");
    expect(findCategory("nonexistent-category-xyz", tree)).toBeNull();
  });

  it("slugify handles punctuation", () => {
    expect(slugify("Nose Pins & Studs")).toBe("nose-pins-and-studs");
  });
});

describe("misc mappers", () => {
  it("maps live rate paise/10g to rupees/g and drops non-metal rates", () => {
    const r = mapLiveRate({ metalType: "GOLD", purity: 916, ratePaisePer10g: 6_673_000, currencyCode: "INR", updatedAt: "x" });
    expect(r?.ratePerGram).toBe(6673);
    expect(mapLiveRate({ metalType: "DIAMOND", purity: 1, ratePaisePer10g: 1, currencyCode: "INR", updatedAt: "x" })).toBeNull();
  });

  it("maps reviews", () => {
    const r = mapReview(apiReviews[0]!);
    expect(r).toMatchObject({ userName: "Priya S.", comment: "Beautiful finish and very light.", isVerifiedPurchase: true });
  });

  it("formats IST time deterministically", () => {
    expect(formatISTTime("2026-03-01T06:30:00.000Z")).toBe("12:00 IST");
    expect(formatISTTime("garbage")).toBe("");
  });
});

describe("catalog client", () => {
  it("getProducts sends tenant header and query, and maps the page", async () => {
    const f = installCatalogFetch(() => ok(page([apiProductA, apiProductB], { total: 80, hasNext: true, limit: 2 })));
    const res = await getProducts({ limit: 2, categoryId: CAT_RING });
    expect(res.items).toHaveLength(2);
    expect(res.total).toBe(80);
    expect(res.hasNext).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/v1/store/products?limit=2&categoryId=" + CAT_RING);
    expect((init.headers as Record<string, string>)["x-tenant-id"]).toBeTruthy();
  });

  it("getProduct returns null on 404 and throws on 500", async () => {
    installCatalogFetch(() => notFoundRes());
    expect(await getProduct("prod-001")).toBeNull();
    installCatalogFetch(() => serverErrorRes());
    await expect(getProduct(PRODUCT_B_ID)).rejects.toBeInstanceOf(ApiError);
  });

  it("getProduct maps a real product", async () => {
    installCatalogFetch(() => ok(apiProductB));
    const p = await getProduct(PRODUCT_B_ID);
    expect(p?.name).toBe("22K Gold Bracelet A9");
  });

  it("searchProducts handles paginated and array payloads and skips empty queries", async () => {
    const f = installCatalogFetch(() => ok(page([apiProductA])));
    expect(await searchProducts("  ")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    expect((await searchProducts("ring")).map((p) => p.id)).toEqual([apiProductA.id]);
    installCatalogFetch(() => ok([apiProductA, apiProductB]));
    expect(await searchProducts("ring")).toHaveLength(2);
  });

  it("getCategoryProducts expands parent categories to children and dedupes", async () => {
    const f = installCatalogFetch((url) => {
      const cat = url.searchParams.get("categoryId");
      if (cat === CAT_GOLD) return ok(page([apiProductA]));
      if (cat === CAT_RING) return ok(page([apiProductA, apiProductB]));
      return cat ? ok(page([])) : ok(page([apiProductC]));
    });
    const tree = mapCategories(apiCategories);
    const res = await getCategoryProducts(tree[0]!, { limit: 10 });
    expect(f).toHaveBeenCalledTimes(3);
    expect(res.items.map((p) => p.id)).toEqual([apiProductA.id, apiProductB.id]);
    const all = await getCategoryProducts(null, { limit: 10 });
    expect(all.items.length).toBeGreaterThan(0);
  });

  it("getHome maps sections and flags new arrivals", async () => {
    installCatalogFetch(() => ok(apiHome));
    const home = await getHome();
    expect(home.newArrivals.every((p) => p.isNew)).toBe(true);
    expect(home.categories[0]!.slug).toBe("gold");
    expect(home.liveRates.find((r) => r.purity === 916)?.ratePerGram).toBe(6673);
  });

  it("getCategories maps the tree; errors surface as ApiError", async () => {
    installCatalogFetch(() => ok(apiCategories));
    expect((await getCategories())[1]!.slug).toBe("silver");
    installCatalogFetch(() => serverErrorRes());
    await expect(getCategories()).rejects.toMatchObject({ status: 500 });
  });
});

describe("applyProductFilters", () => {
  const base: FilterState = {
    metalType: [],
    purity: [],
    priceRange: [0, 1e6],
    weightRange: [0, 100],
    gemstone: [],
    gender: [],
    occasion: [],
    availability: "all",
    sortBy: "newest",
  };
  const products = [mapProduct(apiProductA), mapProduct(apiProductB), mapProduct(apiProductC)];

  it("filters by purity and availability, sorts by price", () => {
    expect(applyProductFilters(products, { ...base, purity: [916] }).map((p) => p.sku)).toEqual(["SJ-BRAC-22K-079"]);
    expect(applyProductFilters(products, { ...base, availability: "in_stock" })).toHaveLength(1);
    const desc = applyProductFilters(products, { ...base, sortBy: "price_desc" });
    expect(desc[0]!.id).toBe(apiProductB.id);
  });
});

describe("home retry (B4)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries once after a transient failure and then succeeds", async () => {
    vi.useFakeTimers();
    const good = { success: true, data: { featuredProducts: [], newArrivals: [], categories: [], liveRates: [] } };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => good });
    vi.stubGlobal("fetch", fetchMock);
    const p = getHome();
    await vi.advanceTimersByTimeAsync(800);
    await expect(p).resolves.toMatchObject({ featuredProducts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a single retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    const p = getHome();
    const assertion = expect(p).rejects.toThrow("fetch failed");
    await vi.advanceTimersByTimeAsync(800);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: "nope" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(getHome()).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
