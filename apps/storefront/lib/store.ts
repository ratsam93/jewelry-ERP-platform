"use client";

// ─── Client-side Store contract ──────────────────────────────
// Context + types + pure helpers + thin API wrappers for the cart,
// wishlist and compare list. The React state machine lives in
// components/StoreProvider.tsx; everything that talks to the API or to
// localStorage is here so it can be unit-tested without React.
//
// Persistence model:
//  * cart      -> server (guest: x-session-id header, customer: Bearer token)
//  * compare   -> server (guest: sessionId param, customer: Bearer token)
//  * wishlist  -> server when signed in; localStorage list when signed out
//  * guest session id -> localStorage `cf_session_id` (lib/api.ts getSessionId)
// Money is integer paise, weights are mg (converted to rupees / grams for the UI types).

import { createContext, useContext } from "react";
import { apiFetch, getAccessToken, getSessionId, clearTokens, resetSessionId } from "./api";
import { mapImages, purityLabelFor } from "./catalog";
import { calculateProductPrice } from "./utils";
import type { CartItem, MetalType, Product } from "./types";

// ─── Store state ─────────────────────────────────────────────

export interface StoreCartItem extends CartItem {
  /** Real product id (UUID); equals product.id. */
  productId?: string;
  /** Server-calculated unit price (paise, GST included). */
  unitPricePaise?: number;
  /** Server-calculated line total (paise). */
  lineTotalPaise?: number;
  /** True while an optimistic add has not been confirmed by the API yet. */
  pending?: boolean;
}

export interface CartTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  couponCode: string | null;
}

export interface StoreNotice {
  message: string;
  /** Show a "Sign in" link next to the message. */
  loginLink?: boolean;
  tone?: "info" | "error";
}

export interface CouponResult {
  ok: boolean;
  message: string;
}

export interface StoreState {
  // Cart
  cartItems: StoreCartItem[];
  cartCount: number;
  addToCart: (product: Product, quantity?: number, size?: string) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  couponCode: string;
  setCouponCode: (code: string) => void;
  couponDiscount: number;
  setCouponDiscount: (paise: number) => void;
  /** Server id of the current cart (needed to initiate checkout). */
  cartId?: string | null;
  /** Server-calculated totals; undefined until the cart has loaded. */
  cartTotals?: CartTotals | null;
  cartLoading?: boolean;
  cartError?: string | null;
  refreshCart?: () => Promise<void>;
  applyCoupon?: (code: string) => Promise<CouponResult>;

  // Wishlist
  wishlistIds: Set<string>;
  wishlistCount: number;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;

  // Compare
  compareIds: string[];
  addToCompare: (productId: string) => void;
  removeFromCompare: (productId: string) => void;
  isInCompare: (productId: string) => boolean;
  clearCompare?: () => void;

  // Auth + notices
  isLoggedIn?: boolean;
  notice?: StoreNotice | null;
  dismissNotice?: () => void;

  // UI State
  isCartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const StoreContext = createContext<StoreState | null>(null);

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// ─── Constants ───────────────────────────────────────────────

export const MAX_COMPARE_ITEMS = 4;
export const WISHLIST_STORAGE_KEY = "cf_wishlist";
export const COMPARE_STORAGE_KEY = "cf_compare";
export const TEMP_ITEM_PREFIX = "tmp-";
export const PENDING_CART_KEY = "cf_pending_cart";
export const CART_MERGED_KEY = "cf_cart_merged";

const CART_PATH = "/api/v1/store/cart";
const WISHLIST_PATH = "/api/v1/store/wishlist";
const COMPARE_PATH = "/api/v1/store/compare";

// ─── API shapes (packages/shared-types/src/storefront.ts) ────

export interface ApiCartItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productImage: string | null;
  productType: string;
  metalPurity: number | null;
  metalWeightMg: number | null;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  metalRatePaiseLocked: number | null;
  addedAt: string;
}

export interface ApiCart {
  id: string;
  customerId: string | null;
  sessionId: string;
  currencyCode: string;
  couponCode: string | null;
  items: ApiCartItem[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  itemCount: number;
  expiresAt: string;
}

export interface ApiWishlistItem {
  id: string;
  productId: string;
}

export interface ApiWishlist {
  items: ApiWishlistItem[];
  total?: number;
}

export interface ApiCompareList {
  id: string;
  productIds: string[];
}

// ─── Mapping ─────────────────────────────────────────────────

const UI_METALS: readonly string[] = ["GOLD", "SILVER", "PLATINUM", "DIAMOND", "GEMSTONE", "KUNDAN"];

/** Minimal UI Product for a cart line (the API cart carries name/image/price, not the full product). */
export function productFromCartItem(i: ApiCartItem): Product {
  const metalType = (UI_METALS.includes(i.productType?.toUpperCase?.() ?? "")
    ? i.productType.toUpperCase()
    : "GOLD") as MetalType;
  const netG = i.metalWeightMg && i.metalWeightMg > 0 ? Math.round(i.metalWeightMg) / 1000 : 0;
  return {
    id: i.productId,
    name: i.productName,
    slug: "",
    sku: i.productSku,
    description: "",
    shortDescription: "",
    categoryId: "",
    categoryName: "",
    categorySlug: "",
    metalType,
    purity: i.metalPurity ?? 0,
    purityLabel: purityLabelFor(i.metalPurity, metalType),
    grossWeightGrams: netG,
    netWeightGrams: netG,
    images: mapImages(i.productImage ? [i.productImage] : null, i.productName),
    metalRatePerGram: 0,
    makingChargesPerGram: 0,
    makingChargesType: "flat",
    // Express the server's unit price (GST included) as a flat charge so
    // calculateProductPrice() agrees with it if anything recomputes.
    makingChargesValue: i.unitPricePaise / 100 / 1.03,
    stoneDetails: [],
    stoneTotalPrice: 0,
    gender: "unisex",
    occasion: [],
    tags: [],
    isAvailable: true,
    isBestseller: false,
    isNew: false,
    isTrending: false,
    specifications: {},
    rating: 0,
    reviewCount: 0,
    currencyCode: "INR",
  };
}

export function mapApiCartItem(i: ApiCartItem): StoreCartItem {
  return {
    id: i.id,
    productId: i.productId,
    product: productFromCartItem(i),
    quantity: i.quantity,
    addedAt: typeof i.addedAt === "string" ? i.addedAt : new Date(i.addedAt).toISOString(),
    unitPricePaise: i.unitPricePaise,
    lineTotalPaise: i.lineTotalPaise,
  };
}

export function mapApiCart(cart: ApiCart): {
  id: string;
  items: StoreCartItem[];
  totals: CartTotals;
} {
  return {
    id: cart.id,
    items: (cart.items ?? []).map(mapApiCartItem),
    totals: {
      subtotalPaise: cart.subtotalPaise ?? 0,
      discountPaise: cart.discountPaise ?? 0,
      taxPaise: cart.taxPaise ?? 0,
      totalPaise: cart.totalPaise ?? 0,
      couponCode: cart.couponCode ?? null,
    },
  };
}

/** Unit price in paise: the server's price when known, else computed from the product. */
export function itemUnitPaise(item: StoreCartItem): number {
  return item.unitPricePaise ?? calculateProductPrice(item.product).total;
}

export function itemLinePaise(item: StoreCartItem): number {
  return item.lineTotalPaise ?? itemUnitPaise(item) * item.quantity;
}

export function cartSubtotalPaise(items: StoreCartItem[]): number {
  return items.reduce((sum, item) => sum + itemLinePaise(item), 0);
}

/** Optimistic line for an item the API has not confirmed yet. */
export function optimisticCartItem(product: Product, quantity: number, size?: string): StoreCartItem {
  const unit = calculateProductPrice(product).total;
  return {
    id: `${TEMP_ITEM_PREFIX}${product.id}-${Date.now().toString(36)}`,
    productId: product.id,
    product,
    quantity,
    selectedSize: size,
    addedAt: new Date().toISOString(),
    unitPricePaise: unit,
    lineTotalPaise: unit * quantity,
    pending: true,
  };
}

/** Apply an add of `quantity` units of `product` to a cart line list (pure). */
export function withAddedItem(
  items: StoreCartItem[],
  product: Product,
  quantity: number,
  size?: string,
): StoreCartItem[] {
  const existing = items.find((i) => (i.productId ?? i.product.id) === product.id);
  if (existing) {
    return items.map((i) =>
      i === existing
        ? {
            ...i,
            quantity: i.quantity + quantity,
            lineTotalPaise: itemUnitPaise(i) * (i.quantity + quantity),
          }
        : i,
    );
  }
  return [...items, optimisticCartItem(product, quantity, size)];
}

export function withQuantity(items: StoreCartItem[], itemId: string, quantity: number): StoreCartItem[] {
  return items.map((i) =>
    i.id === itemId ? { ...i, quantity, lineTotalPaise: itemUnitPaise(i) * quantity } : i,
  );
}

export function withoutItem(items: StoreCartItem[], itemId: string): StoreCartItem[] {
  return items.filter((i) => i.id !== itemId);
}

/** Totals for an optimistic item list (server totals replace these on the next response). */
export function optimisticTotals(items: StoreCartItem[], prev: CartTotals | null): CartTotals {
  const subtotal = cartSubtotalPaise(items);
  const discount = Math.min(prev?.discountPaise ?? 0, subtotal);
  return {
    subtotalPaise: subtotal,
    discountPaise: discount,
    taxPaise: 0,
    totalPaise: Math.max(0, subtotal - discount),
    couponCode: prev?.couponCode ?? null,
  };
}

// ─── Error messages ──────────────────────────────────────────

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ─── Cart API ────────────────────────────────────────────────

export function fetchCart(): Promise<ApiCart> {
  return apiFetch<ApiCart>(CART_PATH, { tenantHeaders: true });
}

// ─── Merge-once flag (sessionStorage) ────────────────────────

/** True when the guest cart for the current session id was already merged in this tab session. */
export function wasCartMerged(): boolean {
  try {
    return window.sessionStorage.getItem(CART_MERGED_KEY) === (getSessionId() ?? "");
  } catch {
    return false;
  }
}

export function markCartMerged(): void {
  try {
    window.sessionStorage.setItem(CART_MERGED_KEY, getSessionId() ?? "");
  } catch {
    // ignore
  }
}

export function clearCartMerged(): void {
  try {
    window.sessionStorage.removeItem(CART_MERGED_KEY);
  } catch {
    // ignore
  }
}

// ─── Pending adds (survive a reload while the POST is in flight) ──

export interface PendingAdd {
  id: string;
  productId: string;
  quantity: number;
  /** Quantity of the product already on the server cart when the add was queued. */
  baseQty: number;
}

export function readPendingAdds(): PendingAdd[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PENDING_CART_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PendingAdd =>
        !!p && typeof p.id === "string" && typeof p.productId === "string" &&
        typeof p.quantity === "number" && typeof p.baseQty === "number",
    );
  } catch {
    return [];
  }
}

function writePendingAdds(list: PendingAdd[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(PENDING_CART_KEY);
    else window.localStorage.setItem(PENDING_CART_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function addPendingAdd(productId: string, quantity: number, serverQty: number): string {
  const list = readPendingAdds();
  const queued = list.filter((p) => p.productId === productId).reduce((n, p) => n + p.quantity, 0);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  writePendingAdds([...list, { id, productId, quantity, baseQty: serverQty + queued }]);
  return id;
}

export function removePendingAdd(id: string): void {
  writePendingAdds(readPendingAdds().filter((p) => p.id !== id));
}

export function clearPendingAdds(): void {
  writePendingAdds([]);
}

/**
 * Units still to add for each pending entry, given the server cart. An entry whose
 * units are already on the server (the interrupted POST did land) yields 0.
 */
export function pendingRemainder(entry: PendingAdd, serverQtyForProduct: number): number {
  return Math.max(0, Math.min(entry.quantity, entry.baseQty + entry.quantity - serverQtyForProduct));
}

/** Sign out: drop tokens plus every per-browser identity (guest session, wishlist, compare, pending cart). */
export function signOut(): void {
  try {
    window.localStorage.removeItem(WISHLIST_STORAGE_KEY);
    window.localStorage.removeItem(COMPARE_STORAGE_KEY);
    window.localStorage.removeItem(PENDING_CART_KEY);
  } catch {
    // ignore
  }
  clearCartMerged();
  resetSessionId();
  clearTokens();
}

/** Merge the guest (session) cart into the signed-in customer's cart. */
export function mergeGuestCartApi(): Promise<ApiCart> {
  return apiFetch<ApiCart>(`${CART_PATH}/merge`, { method: "POST", tenantHeaders: true });
}

export function addCartItemApi(productId: string, quantity: number): Promise<ApiCart> {
  return apiFetch<ApiCart>(`${CART_PATH}/items`, {
    method: "POST",
    tenantHeaders: true,
    body: { productId, quantity },
  });
}

export function updateCartItemApi(itemId: string, quantity: number): Promise<ApiCart> {
  return apiFetch<ApiCart>(`${CART_PATH}/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    tenantHeaders: true,
    body: { quantity },
  });
}

export function removeCartItemApi(itemId: string): Promise<ApiCart> {
  return apiFetch<ApiCart>(`${CART_PATH}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    tenantHeaders: true,
  });
}

export function clearCartApi(): Promise<ApiCart> {
  return apiFetch<ApiCart>(CART_PATH, { method: "DELETE", tenantHeaders: true });
}

export function applyCouponApi(couponCode: string): Promise<ApiCart> {
  return apiFetch<ApiCart>(`${CART_PATH}/coupon`, {
    method: "POST",
    tenantHeaders: true,
    body: { couponCode },
  });
}

// ─── Wishlist (API when signed in, localStorage when signed out) ──

export function isSignedIn(): boolean {
  return !!getAccessToken();
}

export function readLocalWishlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function writeLocalWishlist(ids: Iterable<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // storage unavailable / full: the in-memory list still works for this page view
  }
}

export function clearLocalWishlist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(WISHLIST_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function fetchWishlistIds(): Promise<string[]> {
  const data = await apiFetch<ApiWishlist | ApiWishlistItem[]>(WISHLIST_PATH, { tenantHeaders: true });
  const items = Array.isArray(data) ? data : (data?.items ?? []);
  return items.map((i) => i.productId).filter((id): id is string => typeof id === "string");
}

export function addWishlistApi(productId: string): Promise<unknown> {
  return apiFetch(WISHLIST_PATH, { method: "POST", tenantHeaders: true, body: { productId } });
}

export function removeWishlistApi(productId: string): Promise<unknown> {
  return apiFetch(`${WISHLIST_PATH}/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    tenantHeaders: true,
  });
}

// ─── Compare list (session / customer) ───────────────────────
// The server is the source of truth. The ids are also mirrored to localStorage
// as a read fallback for when GET /store/compare is unavailable.

export function readLocalCompare(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_COMPARE_ITEMS)
      : [];
  } catch {
    return [];
  }
}

export function writeLocalCompare(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function compareQuery(): string {
  const sid = getSessionId();
  return sid ? `?sessionId=${encodeURIComponent(sid)}` : "";
}

export async function fetchCompareIds(): Promise<string[]> {
  const data = await apiFetch<ApiCompareList | null>(`${COMPARE_PATH}${compareQuery()}`, {
    tenantHeaders: true,
  });
  const ids = data?.productIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function addCompareApi(productId: string): Promise<unknown> {
  return apiFetch(COMPARE_PATH, {
    method: "POST",
    tenantHeaders: true,
    body: { productId, sessionId: getSessionId() ?? undefined },
  });
}

export function removeCompareApi(productId: string): Promise<unknown> {
  return apiFetch(`${COMPARE_PATH}/${encodeURIComponent(productId)}${compareQuery()}`, {
    method: "DELETE",
    tenantHeaders: true,
  });
}

export function clearCompareApi(): Promise<unknown> {
  return apiFetch(`${COMPARE_PATH}${compareQuery()}`, { method: "DELETE", tenantHeaders: true });
}
