import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { createElement } from "react";
import StoreProvider from "@/components/StoreProvider";
import { useStore, signOut, readPendingAdds, PENDING_CART_KEY, type StoreState } from "@/lib/store";
import { mapProduct } from "@/lib/catalog";
import { AUTH_CHANGE_EVENT, SESSION_ID_KEY } from "@/lib/api";
import { apiProductA, apiProductB, apiProductC } from "./fixtures/api-catalog";
import { installStoreApi, unitPriceOf, type FakeStoreApi } from "./fixtures/store-api";

const productA = mapProduct(apiProductA);
const productB = mapProduct(apiProductB);

let store: StoreState;
function Capture() {
  store = useStore();
  return null;
}

let api: FakeStoreApi;

/** Render the provider and wait for the initial cart load to finish. */
async function mountStore(opts: { signedIn?: boolean; stock?: number } = {}) {
  api = installStoreApi(opts);
  if (opts.signedIn) window.localStorage.setItem("accessToken", "tok");
  const utils = render(createElement(StoreProvider, null, createElement(Capture)));
  await waitFor(() => expect(store.cartLoading).toBe(false));
  return utils;
}

/** Let queued optimistic requests settle. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Store - session + initial load", () => {
  it("creates and persists a guest session id and sends it with tenant headers", async () => {
    await mountStore();
    const sid = window.localStorage.getItem(SESSION_ID_KEY);
    expect(sid).toBeTruthy();
    const cartCall = api.callsTo("GET /cart")[0]!;
    expect(cartCall.headers["x-session-id"]).toBe(sid);
    expect(cartCall.headers["x-tenant-id"]).toBeTruthy();
    expect(cartCall.headers.Authorization).toBeUndefined();
  });

  it("reuses the same session id on a later mount (reload)", async () => {
    const first = await mountStore();
    const sid = window.localStorage.getItem(SESSION_ID_KEY);
    first.unmount();
    await mountStore();
    expect(window.localStorage.getItem(SESSION_ID_KEY)).toBe(sid);
    expect(api.callsTo("GET /cart")[0]!.headers["x-session-id"]).toBe(sid);
  });

  it("loads an existing server cart with real paise totals", async () => {
    api = installStoreApi();
    // seed server state before the provider mounts
    api.cart.items.push({ id: "00000000-0000-4000-8000-0000000000aa", productId: apiProductB.id, quantity: 2 });
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.cartItems).toHaveLength(1));
    expect(store.cartCount).toBe(2);
    expect(store.cartItems[0]!.product.name).toBe(apiProductB.name);
    expect(store.cartTotals?.subtotalPaise).toBe(unitPriceOf(apiProductB) * 2);
    expect(store.cartTotals?.totalPaise).toBe(unitPriceOf(apiProductB) * 2);
    expect(store.cartId).toBe(api.cart.id);
  });

  it("surfaces a load failure as cartError without throwing", async () => {
    api = installStoreApi();
    api.failures.set("GET /cart", { status: 500, message: "boom" });
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.cartLoading).toBe(false));
    expect(store.cartError).toBe("boom");
    expect(store.cartItems).toHaveLength(0);
  });
});

describe("Store - Cart (API backed)", () => {
  it("starts with empty cart", async () => {
    await mountStore();
    expect(store.cartItems).toHaveLength(0);
    expect(store.cartCount).toBe(0);
  });

  it("adds an item optimistically, calls POST /cart/items and adopts the server cart", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 2));
    // optimistic, before the response
    expect(store.cartItems).toHaveLength(1);
    expect(store.cartItems[0]!.pending).toBe(true);
    expect(store.isCartDrawerOpen).toBe(true);
    await waitFor(() => expect(store.cartItems[0]!.pending).toBeFalsy());
    const post = api.callsTo("POST /cart/items")[0]!;
    expect(post.body).toEqual({ productId: apiProductB.id, quantity: 2 });
    expect(post.headers["x-session-id"]).toBeTruthy();
    expect(store.cartItems[0]!.id).toBe(api.cart.items[0]!.id);
    expect(store.cartTotals?.totalPaise).toBe(unitPriceOf(apiProductB) * 2);
  });

  it("increments quantity when adding the same product", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 1));
    act(() => store.addToCart(productB, 2));
    await settle();
    await waitFor(() => expect(store.cartCount).toBe(3));
    expect(store.cartItems).toHaveLength(1);
    expect(api.cart.items[0]!.quantity).toBe(3);
  });

  it("rolls back an add the API rejects (insufficient stock) and shows the message", async () => {
    await mountStore({ stock: 1 });
    act(() => store.addToCart(productB, 5));
    expect(store.cartItems).toHaveLength(1);
    await waitFor(() => expect(store.cartItems).toHaveLength(0));
    expect(store.cartError).toMatch(/Insufficient stock/);
    expect(store.notice?.tone).toBe("error");
    expect(api.cart.items).toHaveLength(0);
  });

  it("updates quantity through PUT /cart/items/:id", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 1));
    await waitFor(() => expect(store.cartItems[0]!.pending).toBeFalsy());
    const id = store.cartItems[0]!.id;
    act(() => store.updateCartQuantity(id, 4));
    expect(store.cartItems[0]!.quantity).toBe(4);
    await waitFor(() => expect(api.callsTo("PUT /cart/items/" + id)).toHaveLength(1));
    expect(api.callsTo("PUT /cart/items/" + id)[0]!.body).toEqual({ quantity: 4 });
    await waitFor(() => expect(store.cartTotals?.subtotalPaise).toBe(unitPriceOf(apiProductB) * 4));
  });

  it("rolls the quantity back when the API refuses the update", async () => {
    await mountStore({ stock: 2 });
    act(() => store.addToCart(productB, 1));
    await waitFor(() => expect(store.cartItems[0]!.pending).toBeFalsy());
    act(() => store.updateCartQuantity(store.cartItems[0]!.id, 9));
    expect(store.cartItems[0]!.quantity).toBe(9);
    await waitFor(() => expect(store.cartItems[0]!.quantity).toBe(1));
    expect(store.cartError).toMatch(/Insufficient stock/);
  });

  it("removes an item via DELETE and treats quantity 0 as a removal", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 1));
    act(() => store.addToCart(mapProduct(apiProductC), 1));
    await waitFor(() => expect(api.cart.items).toHaveLength(2));
    await waitFor(() => expect(store.cartItems.every((i) => !i.pending)).toBe(true));
    const [first, second] = store.cartItems;
    act(() => store.removeFromCart(first!.id));
    expect(store.cartItems).toHaveLength(1);
    act(() => store.updateCartQuantity(second!.id, 0));
    expect(store.cartItems).toHaveLength(0);
    await waitFor(() => expect(api.cart.items).toHaveLength(0));
    expect(api.callsTo("DELETE /cart/items/" + first!.id)).toHaveLength(1);
    expect(api.callsTo("DELETE /cart/items/" + second!.id)).toHaveLength(1);
  });

  it("lets a quick quantity change on a not-yet-confirmed item through (temp id resolution)", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 1));
    const tempId = store.cartItems[0]!.id;
    expect(tempId.startsWith("tmp-")).toBe(true);
    act(() => store.updateCartQuantity(tempId, 3));
    await waitFor(() => expect(api.cart.items[0]?.quantity).toBe(3));
    await waitFor(() => expect(store.cartItems[0]!.quantity).toBe(3));
    expect(store.cartItems[0]!.id).toBe(api.cart.items[0]!.id);
  });

  it("clears the cart via DELETE /cart", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 2));
    await waitFor(() => expect(store.cartItems[0]!.pending).toBeFalsy());
    act(() => store.clearCart());
    expect(store.cartItems).toHaveLength(0);
    expect(store.cartCount).toBe(0);
    await waitFor(() => expect(api.callsTo("DELETE /cart")).toHaveLength(1));
  });

  it("applies a coupon through POST /cart/coupon and exposes the real discount", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 1));
    await waitFor(() => expect(store.cartItems[0]!.pending).toBeFalsy());
    let result: Awaited<ReturnType<NonNullable<StoreState["applyCoupon"]>>> | undefined;
    await act(async () => {
      result = await store.applyCoupon!("save10");
    });
    expect(result?.ok).toBe(true);
    expect(api.callsTo("POST /cart/coupon")[0]!.body).toEqual({ couponCode: "SAVE10" });
    expect(store.cartTotals?.couponCode).toBe("SAVE10");
    expect(store.couponDiscount).toBe(Math.floor(unitPriceOf(apiProductB) / 10));
    expect(store.cartTotals?.totalPaise).toBe(unitPriceOf(apiProductB) - store.couponDiscount);
  });

  it("reports an invalid coupon without changing the cart", async () => {
    await mountStore();
    let result: Awaited<ReturnType<NonNullable<StoreState["applyCoupon"]>>> | undefined;
    await act(async () => {
      result = await store.applyCoupon!("NOPE");
    });
    expect(result).toEqual({ ok: false, message: "Invalid coupon code" });
    expect(store.couponDiscount).toBe(0);
  });

  it("merges the guest cart into the customer cart when a signed-in user loads", async () => {
    await mountStore({ signedIn: true });
    expect(api.callsTo("POST /cart/merge")).toHaveLength(1);
    expect(api.callsTo("POST /cart/merge")[0]!.headers.Authorization).toBe("Bearer tok");
    expect(store.isLoggedIn).toBe(true);
  });

  it("re-syncs (merge cart) when the auth-change event fires after login", async () => {
    await mountStore();
    expect(api.callsTo("POST /cart/merge")).toHaveLength(0);
    // Sign-in happens elsewhere: the fake now knows the user is a customer.
    api = installStoreApi({ signedIn: true });
    window.localStorage.setItem("accessToken", "tok");
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    });
    await waitFor(() => expect(api.callsTo("POST /cart/merge")).toHaveLength(1));
    await waitFor(() => expect(store.isLoggedIn).toBe(true));
  });
});

describe("Store - merge once, sign-out reset, pending adds", () => {
  it("does not re-merge on a reload of the same session", async () => {
    const first = await mountStore({ signedIn: true });
    expect(api.callsTo("POST /cart/merge")).toHaveLength(1);
    first.unmount();
    await mountStore({ signedIn: true });
    expect(api.callsTo("POST /cart/merge")).toHaveLength(0);
    expect(api.callsTo("GET /cart").length).toBeGreaterThan(0);
  });

  it("merges again after a sign-in transition", async () => {
    await mountStore({ signedIn: true });
    api = installStoreApi({ signedIn: true });
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    });
    await waitFor(() => expect(api.callsTo("POST /cart/merge")).toHaveLength(1));
  });

  it("signOut clears guest session id, wishlist, compare and the visible cart", async () => {
    await mountStore({ signedIn: true });
    act(() => store.addToCart(productB, 1));
    await settle();
    await waitFor(() => expect(store.cartCount).toBe(1));
    window.localStorage.setItem("cf_wishlist", JSON.stringify(["x"]));
    window.localStorage.setItem("cf_compare", JSON.stringify(["x"]));
    const oldSid = window.localStorage.getItem(SESSION_ID_KEY);
    expect(oldSid).toBeTruthy();
    api = installStoreApi(); // signed-out server: empty guest cart
    await act(async () => {
      signOut();
    });
    expect(window.localStorage.getItem("accessToken")).toBeNull();
    expect(window.localStorage.getItem("cf_wishlist")).toBeNull();
    expect(window.localStorage.getItem("cf_compare") ?? "[]").not.toContain("x");
    await waitFor(() => expect(store.cartCount).toBe(0));
    await waitFor(() => expect(store.isLoggedIn).toBe(false));
    const newSid = window.localStorage.getItem(SESSION_ID_KEY);
    expect(newSid).toBeTruthy();
    expect(newSid).not.toBe(oldSid);
    expect(store.wishlistCount).toBe(0);
  });

  it("persists an add as pending until the API confirms it", async () => {
    await mountStore();
    act(() => store.addToCart(productB, 2));
    expect(readPendingAdds()).toHaveLength(1);
    expect(readPendingAdds()[0]).toMatchObject({ productId: apiProductB.id, quantity: 2, baseQty: 0 });
    await settle();
    await waitFor(() => expect(readPendingAdds()).toHaveLength(0));
  });

  it("replays a pending add lost to a reload", async () => {
    window.localStorage.setItem(
      PENDING_CART_KEY,
      JSON.stringify([{ id: "p1", productId: apiProductB.id, quantity: 2, baseQty: 0 }]),
    );
    await mountStore();
    await waitFor(() => expect(store.cartCount).toBe(2));
    expect(api.callsTo("POST /cart/items")).toHaveLength(1);
    expect(readPendingAdds()).toHaveLength(0);
  });

  it("does not double-add when the interrupted POST had already landed", async () => {
    api = installStoreApi();
    api.cart.items.push({ id: "00000000-0000-4000-8000-0000000000bb", productId: apiProductB.id, quantity: 2 });
    window.localStorage.setItem(
      PENDING_CART_KEY,
      JSON.stringify([{ id: "p1", productId: apiProductB.id, quantity: 2, baseQty: 0 }]),
    );
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.cartLoading).toBe(false));
    expect(api.callsTo("POST /cart/items")).toHaveLength(0);
    expect(store.cartCount).toBe(2);
    expect(readPendingAdds()).toHaveLength(0);
  });
});

describe("Store - Wishlist", () => {
  it("starts empty", async () => {
    await mountStore();
    expect(store.wishlistIds.size).toBe(0);
    expect(store.wishlistCount).toBe(0);
    expect(store.isInWishlist("nonexistent")).toBe(false);
  });

  it("signed out: keeps a localStorage list, never calls the API, and prompts login", async () => {
    await mountStore();
    act(() => store.toggleWishlist(apiProductB.id));
    expect(store.isInWishlist(apiProductB.id)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("cf_wishlist")!)).toEqual([apiProductB.id]);
    expect(store.notice?.loginLink).toBe(true);
    expect(api.calls.some((c) => c.path.startsWith("/wishlist"))).toBe(false);
    act(() => store.toggleWishlist(apiProductB.id));
    expect(store.isInWishlist(apiProductB.id)).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("cf_wishlist")!)).toEqual([]);
  });

  it("signed out: restores the local list after a reload", async () => {
    window.localStorage.setItem("cf_wishlist", JSON.stringify([apiProductA.id]));
    await mountStore();
    expect(store.isInWishlist(apiProductA.id)).toBe(true);
    expect(store.wishlistCount).toBe(1);
  });

  it("signed in: loads from the API and toggles through POST/DELETE", async () => {
    api = installStoreApi({ signedIn: true });
    api.wishlist.push(apiProductA.id);
    window.localStorage.setItem("accessToken", "tok");
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.isInWishlist(apiProductA.id)).toBe(true));
    act(() => store.toggleWishlist(apiProductB.id));
    expect(store.isInWishlist(apiProductB.id)).toBe(true);
    await waitFor(() => expect(api.wishlist).toContain(apiProductB.id));
    expect(api.callsTo("POST /wishlist")[0]!.headers.Authorization).toBe("Bearer tok");
    act(() => store.toggleWishlist(apiProductA.id));
    await waitFor(() => expect(api.wishlist).not.toContain(apiProductA.id));
    expect(store.isInWishlist(apiProductA.id)).toBe(false);
  });

  it("signed in: rolls back an add that the API rejects", async () => {
    api = installStoreApi({ signedIn: true });
    api.failures.set("POST /wishlist", { status: 500, message: "nope" });
    window.localStorage.setItem("accessToken", "tok");
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.cartLoading).toBe(false));
    act(() => store.toggleWishlist(apiProductB.id));
    expect(store.isInWishlist(apiProductB.id)).toBe(true);
    await waitFor(() => expect(store.isInWishlist(apiProductB.id)).toBe(false));
    expect(store.notice?.message).toBe("nope");
  });

  it("pushes the local wishlist to the account after login", async () => {
    window.localStorage.setItem("cf_wishlist", JSON.stringify([apiProductA.id]));
    await mountStore();
    api = installStoreApi({ signedIn: true });
    window.localStorage.setItem("accessToken", "tok");
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    });
    await waitFor(() => expect(api.wishlist).toContain(apiProductA.id));
    expect(window.localStorage.getItem("cf_wishlist")).toBeNull();
  });
});

describe("Store - Compare (API backed)", () => {
  it("starts with empty compare list", async () => {
    await mountStore();
    expect(store.compareIds).toHaveLength(0);
  });

  it("loads the persisted compare list for the session", async () => {
    api = installStoreApi();
    api.compare.push(apiProductA.id);
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.compareIds).toEqual([apiProductA.id]));
    const call = api.callsTo("GET /compare")[0]!;
    expect(call.query.get("sessionId")).toBe(window.localStorage.getItem(SESSION_ID_KEY));
  });

  it("adds and removes via the API with the session id", async () => {
    await mountStore();
    act(() => store.addToCompare(apiProductA.id));
    expect(store.isInCompare(apiProductA.id)).toBe(true);
    await waitFor(() => expect(api.compare).toEqual([apiProductA.id]));
    const sid = window.localStorage.getItem(SESSION_ID_KEY);
    expect(api.callsTo("POST /compare")[0]!.body).toEqual({ productId: apiProductA.id, sessionId: sid });
    act(() => store.removeFromCompare(apiProductA.id));
    expect(store.isInCompare(apiProductA.id)).toBe(false);
    await waitFor(() => expect(api.compare).toEqual([]));
    expect(api.callsTo("DELETE /compare/" + apiProductA.id)[0]!.query.get("sessionId")).toBe(sid);
  });

  it("enforces max 4 on the client without calling the API a fifth time", async () => {
    await mountStore();
    const ids = ["1", "2", "3", "4", "5"].map((n) => `0000000${n}-0000-4000-8000-000000000000`);
    act(() => {
      ids.forEach((id) => store.addToCompare(id));
    });
    expect(store.compareIds).toEqual(ids.slice(0, 4));
    expect(store.isInCompare(ids[4]!)).toBe(false);
    expect(store.notice?.message).toMatch(/up to 4/);
    await waitFor(() => expect(api.callsTo("POST /compare")).toHaveLength(4));
    expect(api.compare).toEqual(ids.slice(0, 4));
  });

  it("keeps a device copy and falls back to it when GET /compare fails", async () => {
    const first = await mountStore();
    act(() => store.addToCompare(apiProductA.id));
    await waitFor(() => expect(api.compare).toEqual([apiProductA.id]));
    first.unmount();
    api = installStoreApi();
    api.failures.set("GET /compare", { status: 500, message: "serialize" });
    render(createElement(StoreProvider, null, createElement(Capture)));
    await waitFor(() => expect(store.compareIds).toEqual([apiProductA.id]));
  });

  it("does not add a duplicate", async () => {
    await mountStore();
    act(() => store.addToCompare(apiProductA.id));
    act(() => store.addToCompare(apiProductA.id));
    expect(store.compareIds).toHaveLength(1);
    await settle();
    expect(api.callsTo("POST /compare")).toHaveLength(1);
  });

  it("rolls back an add the API rejects", async () => {
    await mountStore();
    act(() => store.addToCompare("00000000-0000-4000-8000-00000000dead"));
    expect(store.compareIds).toHaveLength(1);
    await waitFor(() => expect(store.compareIds).toHaveLength(0));
    expect(store.notice?.message).toBe("Product not found");
  });

  it("clears the list via DELETE /compare", async () => {
    await mountStore();
    act(() => {
      store.addToCompare(apiProductA.id);
      store.addToCompare(apiProductB.id);
    });
    await waitFor(() => expect(api.compare).toHaveLength(2));
    act(() => store.clearCompare!());
    expect(store.compareIds).toHaveLength(0);
    await waitFor(() => expect(api.callsTo("DELETE /compare")).toHaveLength(1));
  });
});
