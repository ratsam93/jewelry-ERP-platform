"use client";

import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import {
  StoreContext,
  type StoreState,
  type StoreCartItem,
  type CartTotals,
  type StoreNotice,
  type ApiCart,
  type CouponResult,
  MAX_COMPARE_ITEMS,
  TEMP_ITEM_PREFIX,
  mapApiCart,
  withAddedItem,
  withQuantity,
  withoutItem,
  optimisticTotals,
  errorMessage,
  fetchCart,
  mergeGuestCartApi,
  addCartItemApi,
  updateCartItemApi,
  removeCartItemApi,
  clearCartApi,
  wasCartMerged,
  markCartMerged,
  clearCartMerged,
  addPendingAdd,
  removePendingAdd,
  readPendingAdds,
  pendingRemainder,
  applyCouponApi,
  isSignedIn,
  readLocalWishlist,
  writeLocalWishlist,
  clearLocalWishlist,
  fetchWishlistIds,
  addWishlistApi,
  removeWishlistApi,
  fetchCompareIds,
  addCompareApi,
  removeCompareApi,
  clearCompareApi,
  readLocalCompare,
  writeLocalCompare,
} from "@/lib/store";
import { AUTH_CHANGE_EVENT } from "@/lib/api";
import type { Product } from "@/lib/types";

const NOTICE_MS = 6000;

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItemsState] = useState<StoreCartItem[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [cartTotals, setCartTotals] = useState<CartTotals | null>(null);
  const [cartLoading, setCartLoading] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [isCartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [notice, setNotice] = useState<StoreNotice | null>(null);

  // Refs mirror the latest state so queued async work reads current values.
  const itemsRef = useRef<StoreCartItem[]>([]);
  const totalsRef = useRef<CartTotals | null>(null);
  const wishlistRef = useRef<Set<string>>(new Set());
  const compareRef = useRef<string[]>([]);
  const serverCartRef = useRef<StoreCartItem[]>([]);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef(0);
  const replayingRef = useRef(false);
  // Pending adds left by a previous page load (read during the first render, before
  // this page queues any add of its own). Only these are replayed.
  const stalePendingRef = useRef<Set<string> | null>(null);
  if (stalePendingRef.current === null) {
    stalePendingRef.current = new Set(readPendingAdds().map((p) => p.id));
  }
  const tempProductRef = useRef<Map<string, string>>(new Map());
  const mountedRef = useRef(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const showNotice = useCallback((n: StoreNotice) => {
    if (!mountedRef.current) return;
    setNotice(n);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // ─── Cart ────────────────────────────────────────────────

  const setItems = useCallback((items: StoreCartItem[], totals: CartTotals | null) => {
    itemsRef.current = items;
    totalsRef.current = totals;
    if (!mountedRef.current) return;
    setCartItemsState(items);
    setCartTotals(totals);
  }, []);

  const applyServerCart = useCallback(
    (cart: ApiCart) => {
      const mapped = mapApiCart(cart);
      serverCartRef.current = mapped.items;
      setItems(mapped.items, mapped.totals);
      if (!mountedRef.current) return;
      setCartId(mapped.id);
      setCouponCode(mapped.totals.couponCode ?? "");
      setCouponDiscount(mapped.totals.discountPaise);
    },
    [setItems],
  );

  const refreshCart = useCallback(async () => {
    setCartError(null);
    try {
      const cart = await fetchCart();
      applyServerCart(cart);
    } catch (err) {
      if (mountedRef.current) setCartError(errorMessage(err, "Could not load your cart"));
    } finally {
      if (mountedRef.current) setCartLoading(false);
    }
  }, [applyServerCart]);

  /** Re-send adds that were queued but never confirmed (e.g. the page was reloaded mid-request). */
  const replayPendingAdds = useCallback(async (cart: ApiCart): Promise<ApiCart> => {
    if (replayingRef.current) return cart;
    const stale = stalePendingRef.current;
    const pending = readPendingAdds().filter((p) => stale?.has(p.id));
    if (pending.length === 0) return cart;
    replayingRef.current = true;
    try {
      let current = cart;
      for (const entry of pending) {
        const serverQty = (current.items ?? [])
          .filter((i) => i.productId === entry.productId)
          .reduce((n, i) => n + i.quantity, 0);
        const remainder = pendingRemainder(entry, serverQty);
        try {
          if (remainder > 0) current = await addCartItemApi(entry.productId, remainder);
          removePendingAdd(entry.id);
        } catch {
          // keep the entry so a later load retries it
        }
      }
      return current;
    } finally {
      replayingRef.current = false;
    }
  }, []);

  /**
   * Load the cart. A signed-in customer merges the guest cart into theirs once per
   * guest session id (not on every page load); a sign-in clears that flag first.
   */
  const loadCart = useCallback(async () => {
    setCartError(null);
    try {
      let cart: ApiCart;
      if (isSignedIn() && !wasCartMerged()) {
        try {
          cart = await mergeGuestCartApi();
          markCartMerged();
        } catch {
          cart = await fetchCart();
        }
      } else {
        cart = await fetchCart();
      }
      cart = await replayPendingAdds(cart);
      applyServerCart(cart);
    } catch (err) {
      if (mountedRef.current) setCartError(errorMessage(err, "Could not load your cart"));
    } finally {
      if (mountedRef.current) setCartLoading(false);
    }
  }, [applyServerCart, replayPendingAdds]);

  /**
   * Optimistic cart mutation: update the UI immediately, send the request
   * through a serial queue, then adopt the server's cart. On failure the
   * cart is re-synced from the server (or rolled back to the snapshot).
   */
  const mutateCart = useCallback(
    (
      apply: (items: StoreCartItem[]) => StoreCartItem[],
      request: () => Promise<ApiCart>,
      failMessage: string,
    ) => {
      const snapshot = { items: itemsRef.current, totals: totalsRef.current };
      const next = apply(itemsRef.current);
      setItems(next, optimisticTotals(next, totalsRef.current));
      setCartError(null);

      pendingRef.current += 1;
      queueRef.current = queueRef.current.then(async () => {
        try {
          const cart = await request();
          pendingRef.current -= 1;
          if (pendingRef.current === 0) applyServerCart(cart);
          else serverCartRef.current = mapApiCart(cart).items;
        } catch (err) {
          pendingRef.current -= 1;
          const msg = errorMessage(err, failMessage);
          showNotice({ message: msg, tone: "error" });
          if (mountedRef.current) setCartError(msg);
          if (pendingRef.current === 0) {
            try {
              applyServerCart(await fetchCart());
            } catch {
              setItems(snapshot.items, snapshot.totals);
            }
          }
        }
      });
    },
    [setItems, applyServerCart, showNotice],
  );

  /** Map an optimistic (temp) item id to the id the server assigned. */
  const resolveItemId = useCallback((itemId: string): string => {
    if (!itemId.startsWith(TEMP_ITEM_PREFIX)) return itemId;
    const productId = tempProductRef.current.get(itemId);
    const real = serverCartRef.current.find((i) => i.productId === productId);
    if (!real) throw new Error("That item is no longer in your cart");
    return real.id;
  }, []);

  const addToCart = useCallback(
    (product: Product, quantity = 1, size?: string) => {
      const before = itemsRef.current;
      const after = withAddedItem(before, product, quantity, size);
      const created = after.find((i) => i.pending && !before.some((b) => b.id === i.id));
      if (created) tempProductRef.current.set(created.id, product.id);
      // Persist the add so a reload before the API answers does not lose it.
      const serverQty = serverCartRef.current
        .filter((i) => i.productId === product.id)
        .reduce((n, i) => n + i.quantity, 0);
      const pendingId = addPendingAdd(product.id, quantity, serverQty);
      mutateCart(
        () => after,
        async () => {
          try {
            return await addCartItemApi(product.id, quantity);
          } finally {
            removePendingAdd(pendingId);
          }
        },
        "Could not add this item to your cart",
      );
      setCartDrawerOpen(true);
    },
    [mutateCart],
  );

  const removeFromCart = useCallback(
    (itemId: string) => {
      mutateCart(
        (items) => withoutItem(items, itemId),
        () => removeCartItemApi(resolveItemId(itemId)),
        "Could not remove this item",
      );
    },
    [mutateCart, resolveItemId],
  );

  const updateCartQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(itemId);
        return;
      }
      mutateCart(
        (items) => withQuantity(items, itemId, quantity),
        () => updateCartItemApi(resolveItemId(itemId), quantity),
        "Could not update the quantity",
      );
    },
    [mutateCart, removeFromCart, resolveItemId],
  );

  const clearCart = useCallback(() => {
    mutateCart(
      () => [],
      () => clearCartApi(),
      "Could not clear your cart",
    );
  }, [mutateCart]);

  const applyCoupon = useCallback(
    async (code: string): Promise<CouponResult> => {
      const trimmed = code.trim();
      if (!trimmed) return { ok: false, message: "Enter a coupon code." };
      await queueRef.current;
      try {
        const cart = await applyCouponApi(trimmed.toUpperCase());
        applyServerCart(cart);
        const saved = cart.discountPaise ?? 0;
        return {
          ok: true,
          message: saved > 0 ? "Coupon applied." : "Coupon applied (no discount on this cart).",
        };
      } catch (err) {
        return { ok: false, message: errorMessage(err, "Could not apply coupon") };
      }
    },
    [applyServerCart],
  );

  // ─── Wishlist ────────────────────────────────────────────

  const commitWishlist = useCallback((next: Set<string>) => {
    wishlistRef.current = next;
    if (mountedRef.current) setWishlistIds(next);
  }, []);

  const loadWishlist = useCallback(async () => {
    if (!isSignedIn()) {
      commitWishlist(new Set(readLocalWishlist()));
      return;
    }
    try {
      commitWishlist(new Set(await fetchWishlistIds()));
    } catch {
      // keep whatever is shown; the wishlist page surfaces its own errors
    }
  }, [commitWishlist]);

  const toggleWishlist = useCallback(
    (productId: string) => {
      const prev = wishlistRef.current;
      const adding = !prev.has(productId);
      const next = new Set(prev);
      if (adding) next.add(productId);
      else next.delete(productId);
      commitWishlist(next);

      if (!isSignedIn()) {
        writeLocalWishlist(next);
        if (adding) {
          showNotice({
            message: "Saved on this device. Sign in to keep your wishlist across devices.",
            loginLink: true,
            tone: "info",
          });
        }
        return;
      }
      (adding ? addWishlistApi(productId) : removeWishlistApi(productId)).catch((err: unknown) => {
        // roll back just this product
        const cur = new Set(wishlistRef.current);
        if (adding) cur.delete(productId);
        else cur.add(productId);
        commitWishlist(cur);
        showNotice({ message: errorMessage(err, "Could not update your wishlist"), tone: "error" });
      });
    },
    [commitWishlist, showNotice],
  );

  const isInWishlist = useCallback((productId: string) => wishlistIds.has(productId), [wishlistIds]);

  // ─── Compare ─────────────────────────────────────────────

  const commitCompare = useCallback((ids: string[]) => {
    compareRef.current = ids;
    writeLocalCompare(ids);
    if (mountedRef.current) setCompareIds(ids);
  }, []);

  const loadCompare = useCallback(async () => {
    try {
      commitCompare(await fetchCompareIds());
    } catch {
      // Server list unavailable: fall back to the ids mirrored on this device.
      const cached = readLocalCompare();
      compareRef.current = cached;
      if (mountedRef.current) setCompareIds(cached);
    }
  }, [commitCompare]);

  const addToCompare = useCallback(
    (productId: string) => {
      const prev = compareRef.current;
      if (prev.includes(productId)) return;
      if (prev.length >= MAX_COMPARE_ITEMS) {
        showNotice({ message: `You can compare up to ${MAX_COMPARE_ITEMS} products.`, tone: "info" });
        return;
      }
      commitCompare([...prev, productId]);
      addCompareApi(productId).catch((err: unknown) => {
        commitCompare(compareRef.current.filter((id) => id !== productId));
        showNotice({ message: errorMessage(err, "Could not add to compare"), tone: "error" });
      });
    },
    [commitCompare, showNotice],
  );

  const removeFromCompare = useCallback(
    (productId: string) => {
      const prev = compareRef.current;
      if (!prev.includes(productId)) return;
      commitCompare(prev.filter((id) => id !== productId));
      removeCompareApi(productId).catch((err: unknown) => {
        if (!compareRef.current.includes(productId)) commitCompare([...compareRef.current, productId]);
        showNotice({ message: errorMessage(err, "Could not remove from compare"), tone: "error" });
      });
    },
    [commitCompare, showNotice],
  );

  const clearCompare = useCallback(() => {
    const prev = compareRef.current;
    if (prev.length === 0) return;
    commitCompare([]);
    clearCompareApi().catch((err: unknown) => {
      commitCompare(prev);
      showNotice({ message: errorMessage(err, "Could not clear compare"), tone: "error" });
    });
  }, [commitCompare, showNotice]);

  const isInCompare = useCallback((productId: string) => compareIds.includes(productId), [compareIds]);

  // ─── Load on mount; re-sync on sign-in / sign-out ────────

  useEffect(() => {
    setIsLoggedIn(isSignedIn());
    void loadCart();
    void loadWishlist();
    void loadCompare();

    async function onAuthChange() {
      const signedIn = isSignedIn();
      setIsLoggedIn(signedIn);
      if (!signedIn) {
        // Signed out: drop the previous account's cart from view straight away.
        serverCartRef.current = [];
        setItems([], null);
        if (mountedRef.current) {
          setCartId(null);
          setCouponCode("");
          setCouponDiscount(0);
        }
      }
      if (signedIn) {
        clearCartMerged(); // a fresh sign-in merges the guest cart once
        // Push the locally saved wishlist to the account, then reload everything.
        const local = readLocalWishlist();
        if (local.length > 0) {
          await Promise.allSettled(local.map((id) => addWishlistApi(id)));
          clearLocalWishlist();
        }
      } else {
        commitWishlist(new Set(readLocalWishlist()));
      }
      setCartLoading(true);
      await queueRef.current;
      await loadCart();
      await loadWishlist();
      await loadCompare();
    }
    window.addEventListener(AUTH_CHANGE_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, onAuthChange);
  }, [loadCart, loadWishlist, loadCompare, commitWishlist, setItems]);

  const cartCount = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);

  const store: StoreState = useMemo(
    () => ({
      cartItems,
      cartCount,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      couponCode,
      setCouponCode,
      couponDiscount,
      setCouponDiscount,
      cartId,
      cartTotals,
      cartLoading,
      cartError,
      refreshCart,
      applyCoupon,
      wishlistIds,
      wishlistCount: wishlistIds.size,
      toggleWishlist,
      isInWishlist,
      compareIds,
      addToCompare,
      removeFromCompare,
      isInCompare,
      clearCompare,
      isLoggedIn,
      notice,
      dismissNotice,
      isCartDrawerOpen,
      setCartDrawerOpen,
      searchQuery,
      setSearchQuery,
    }),
    [
      cartItems,
      cartCount,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      couponCode,
      couponDiscount,
      cartId,
      cartTotals,
      cartLoading,
      cartError,
      refreshCart,
      applyCoupon,
      wishlistIds,
      toggleWishlist,
      isInWishlist,
      compareIds,
      addToCompare,
      removeFromCompare,
      isInCompare,
      clearCompare,
      isLoggedIn,
      notice,
      dismissNotice,
      isCartDrawerOpen,
      searchQuery,
    ],
  );

  return (
    <StoreContext.Provider value={store}>
      {children}
      {notice && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)] rounded-lg px-4 py-3 text-sm shadow-lg flex items-center gap-3 ${
            notice.tone === "error" ? "bg-rose-600 text-white" : "bg-navy text-white"
          }`}
        >
          <span className="flex-1">{notice.message}</span>
          {notice.loginLink && (
            <a href="/auth/login" className="font-semibold underline whitespace-nowrap">
              Sign in
            </a>
          )}
          <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
            &times;
          </button>
        </div>
      )}
    </StoreContext.Provider>
  );
}
