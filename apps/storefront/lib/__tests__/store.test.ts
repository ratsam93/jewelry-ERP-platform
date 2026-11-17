import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSessionId, SESSION_ID_KEY, setTokens, clearTokens, AUTH_CHANGE_EVENT } from "@/lib/api";
import {
  mapApiCart,
  withAddedItem,
  withQuantity,
  withoutItem,
  optimisticTotals,
  itemUnitPaise,
  itemLinePaise,
  cartSubtotalPaise,
  readLocalWishlist,
  writeLocalWishlist,
  clearLocalWishlist,
  WISHLIST_STORAGE_KEY,
  fetchCart,
  addCartItemApi,
  updateCartItemApi,
  removeCartItemApi,
  clearCartApi,
  applyCouponApi,
  mergeGuestCartApi,
  fetchWishlistIds,
  addWishlistApi,
  removeWishlistApi,
  fetchCompareIds,
  addCompareApi,
  removeCompareApi,
  clearCompareApi,
  type ApiCart,
} from "@/lib/store";
import { mapProduct } from "@/lib/catalog";
import { apiProductB } from "../../__tests__/fixtures/api-catalog";

const TENANT = "69544f8e-fa3c-40b4-8975-643825600ce7";
const productB = mapProduct(apiProductB);

const apiCart: ApiCart = {
  id: "00000000-0000-4000-8000-0000000000c1",
  customerId: null,
  sessionId: "s1",
  currencyCode: "INR",
  couponCode: "SAVE10",
  items: [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      productId: apiProductB.id,
      productName: apiProductB.name,
      productSku: apiProductB.sku,
      productImage: "/uploads/b.jpg",
      productType: "GOLD",
      metalPurity: 916,
      metalWeightMg: 8280,
      quantity: 2,
      unitPricePaise: 1_000_000,
      lineTotalPaise: 2_000_000,
      metalRatePaiseLocked: null,
      addedAt: "2026-03-01T10:00:00.000Z",
    },
  ],
  subtotalPaise: 2_000_000,
  discountPaise: 200_000,
  taxPaise: 0,
  totalPaise: 1_800_000,
  itemCount: 2,
  expiresAt: "2026-04-01T10:00:00.000Z",
};

function fetchMock(data: unknown = {}) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function lastCall(fn: ReturnType<typeof fetchMock>) {
  const [url, init] = fn.mock.calls[fn.mock.calls.length - 1] as unknown as [string, RequestInit];
  return { url: new URL(url), init, headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getSessionId", () => {
  it("generates one id, persists it under cf_session_id and returns it again", () => {
    const a = getSessionId();
    expect(a).toBeTruthy();
    expect(window.localStorage.getItem(SESSION_ID_KEY)).toBe(a);
    expect(getSessionId()).toBe(a);
  });

  it("falls back to an in-memory id when localStorage throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = getSessionId();
    expect(a).toBeTruthy();
    expect(getSessionId()).toBe(a);
  });
});

describe("auth change notification", () => {
  it("fires cf-auth-change on setTokens and clearTokens", () => {
    const handler = vi.fn();
    window.addEventListener(AUTH_CHANGE_EVENT, handler);
    setTokens("a", "r");
    clearTokens();
    window.removeEventListener(AUTH_CHANGE_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem("accessToken")).toBeNull();
  });
});

describe("cart mapping", () => {
  it("maps API paise totals and items", () => {
    const { id, items, totals } = mapApiCart(apiCart);
    expect(id).toBe(apiCart.id);
    expect(totals).toEqual({
      subtotalPaise: 2_000_000,
      discountPaise: 200_000,
      taxPaise: 0,
      totalPaise: 1_800_000,
      couponCode: "SAVE10",
    });
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.quantity).toBe(2);
    expect(item.productId).toBe(apiProductB.id);
    expect(item.product.name).toBe(apiProductB.name);
    expect(item.product.netWeightGrams).toBe(8.28);
    expect(item.product.purityLabel).toBe("22K");
    expect(itemUnitPaise(item)).toBe(1_000_000);
    expect(itemLinePaise(item)).toBe(2_000_000);
    expect(cartSubtotalPaise(items)).toBe(2_000_000);
    expect(item.product.images[0]!.url).toContain("/uploads/b.jpg");
  });

  it("falls back to client pricing for items without server prices", () => {
    const [item] = withAddedItem([], productB, 2);
    expect(item!.pending).toBe(true);
    expect(itemLinePaise(item!)).toBe(itemUnitPaise(item!) * 2);
  });
});

describe("optimistic helpers", () => {
  it("add merges by product, update changes quantity and line total, remove drops the line", () => {
    const base = mapApiCart(apiCart).items;
    const merged = withAddedItem(base, productB, 1);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quantity).toBe(3);
    expect(merged[0]!.lineTotalPaise).toBe(3_000_000);

    const updated = withQuantity(base, base[0]!.id, 5);
    expect(updated[0]!.quantity).toBe(5);
    expect(updated[0]!.lineTotalPaise).toBe(5_000_000);

    expect(withoutItem(base, base[0]!.id)).toEqual([]);
    expect(base[0]!.quantity).toBe(2); // inputs are never mutated
  });

  it("optimisticTotals keeps the coupon and caps the discount at the subtotal", () => {
    const totals = mapApiCart(apiCart).totals;
    const t = optimisticTotals([], totals);
    expect(t.subtotalPaise).toBe(0);
    expect(t.discountPaise).toBe(0);
    expect(t.totalPaise).toBe(0);
    expect(t.couponCode).toBe("SAVE10");
  });
});

describe("cart API wrappers (request shapes)", () => {
  it("GET /cart carries tenant + session headers and no auth for guests", async () => {
    const f = fetchMock(apiCart);
    const cart = await fetchCart();
    const c = lastCall(f);
    expect(c.url.pathname).toBe("/api/v1/store/cart");
    expect(c.init.method).toBe("GET");
    expect(c.headers["x-tenant-id"]).toBe(TENANT);
    expect(c.headers["x-session-id"]).toBe(window.localStorage.getItem(SESSION_ID_KEY));
    expect(c.headers.Authorization).toBeUndefined();
    expect(cart.id).toBe(apiCart.id);
  });

  it("sends the Bearer token for a signed-in customer", async () => {
    window.localStorage.setItem("accessToken", "tok");
    const f = fetchMock(apiCart);
    await mergeGuestCartApi();
    const c = lastCall(f);
    expect(c.url.pathname).toBe("/api/v1/store/cart/merge");
    expect(c.init.method).toBe("POST");
    expect(c.headers.Authorization).toBe("Bearer tok");
  });

  it("add / update / remove / clear / coupon use the documented routes and bodies", async () => {
    const f = fetchMock(apiCart);
    await addCartItemApi("p1", 2);
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/cart/items");
    expect(JSON.parse(String(lastCall(f).init.body))).toEqual({ productId: "p1", quantity: 2 });

    await updateCartItemApi("i1", 3);
    expect(lastCall(f).init.method).toBe("PUT");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/cart/items/i1");
    expect(JSON.parse(String(lastCall(f).init.body))).toEqual({ quantity: 3 });

    await removeCartItemApi("i1");
    expect(lastCall(f).init.method).toBe("DELETE");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/cart/items/i1");

    await clearCartApi();
    expect(lastCall(f).init.method).toBe("DELETE");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/cart");

    await applyCouponApi("SAVE10");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/cart/coupon");
    expect(JSON.parse(String(lastCall(f).init.body))).toEqual({ couponCode: "SAVE10" });
  });

  it("surfaces the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: { message: "Insufficient stock. Available: 0, requested: 1" } }),
      })),
    );
    await expect(addCartItemApi("p1", 1)).rejects.toThrow("Insufficient stock. Available: 0, requested: 1");
  });
});

describe("wishlist storage + API", () => {
  it("round-trips the local list and tolerates garbage / blocked storage", () => {
    expect(readLocalWishlist()).toEqual([]);
    writeLocalWishlist(new Set(["a", "b"]));
    expect(readLocalWishlist()).toEqual(["a", "b"]);
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, "{not json");
    expect(readLocalWishlist()).toEqual([]);
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify([1, "x"]));
    expect(readLocalWishlist()).toEqual(["x"]);
    clearLocalWishlist();
    expect(window.localStorage.getItem(WISHLIST_STORAGE_KEY)).toBeNull();

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(() => writeLocalWishlist(["a"])).not.toThrow();
  });

  it("uses GET/POST/DELETE /wishlist and maps items to product ids", async () => {
    const f = fetchMock({ items: [{ id: "w1", productId: "p1" }, { id: "w2", productId: "p2" }], total: 2 });
    expect(await fetchWishlistIds()).toEqual(["p1", "p2"]);
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/wishlist");
    await addWishlistApi("p3");
    expect(lastCall(f).init.method).toBe("POST");
    expect(JSON.parse(String(lastCall(f).init.body))).toEqual({ productId: "p3" });
    await removeWishlistApi("p3");
    expect(lastCall(f).init.method).toBe("DELETE");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/wishlist/p3");
  });
});

describe("compare API", () => {
  it("passes the session id as sessionId (query for GET/DELETE, body for POST)", async () => {
    const sid = getSessionId()!;
    const f = fetchMock({ id: "c", productIds: ["p1", "p2"], products: [] });
    expect(await fetchCompareIds()).toEqual(["p1", "p2"]);
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/compare");
    expect(lastCall(f).url.searchParams.get("sessionId")).toBe(sid);
    expect(lastCall(f).headers["x-tenant-id"]).toBe(TENANT);

    await addCompareApi("p3");
    expect(lastCall(f).init.method).toBe("POST");
    expect(JSON.parse(String(lastCall(f).init.body))).toEqual({ productId: "p3", sessionId: sid });

    await removeCompareApi("p3");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/compare/p3");
    expect(lastCall(f).url.searchParams.get("sessionId")).toBe(sid);

    await clearCompareApi();
    expect(lastCall(f).init.method).toBe("DELETE");
    expect(lastCall(f).url.pathname).toBe("/api/v1/store/compare");
  });

  it("treats an empty server list as no products", async () => {
    fetchMock({ id: "", productIds: [], products: [] });
    expect(await fetchCompareIds()).toEqual([]);
  });
});
