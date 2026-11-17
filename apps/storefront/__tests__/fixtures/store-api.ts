// In-memory fake of the storefront cart / wishlist / compare / address / checkout
// REST contract (apps/api storefront.controller + b2c-features.controller), used
// by the store, cart, wishlist, compare and checkout tests. Responses follow the
// real shapes: { success, data } envelopes, integer paise, shared-types items.
import { vi } from "vitest";
import {
  apiProducts,
  PRODUCT_A_ID,
  PRODUCT_B_ID,
  PRODUCT_C_ID,
  ok,
  notFoundRes,
} from "./api-catalog";
import type { ApiCatalogProduct } from "@/lib/catalog";

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

export interface FakeStoreApi {
  fetch: ReturnType<typeof vi.fn>;
  calls: RecordedCall[];
  /** Calls whose "METHOD /path" matches (path relative to /api/v1/store). */
  callsTo: (route: string) => RecordedCall[];
  cart: { id: string; couponCode: string | null; items: FakeItem[] };
  wishlist: string[];
  compare: string[];
  addresses: Array<Record<string, unknown>>;
  orders: Array<{ id: string; status: string }>;
  /** Return an HTTP status (and optional message) to force a failure for a route. */
  failures: Map<string, { status: number; message: string }>;
  /** Extra fields merged into the POST /checkout response (e.g. razorpay details). */
  checkoutExtras: Record<string, unknown>;
}

interface FakeItem {
  id: string;
  productId: string;
  quantity: number;
}

const COUPONS: Record<string, number> = { SAVE10: 10 };

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const err = (status: number, message: string) =>
  res(status, { success: false, error: { code: status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST", message } });

let seq = 0;
const uuid = () => {
  seq += 1;
  const hex = seq.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
};

export function productById(id: string): ApiCatalogProduct | undefined {
  return apiProducts.find((p) => p.id === id);
}

/** Purchasable unit price (paise) of a fixture product. */
export function unitPriceOf(p: ApiCatalogProduct): number {
  return p.totalPricePaise;
}

export function installStoreApi(opts: { signedIn?: boolean; stock?: number } = {}): FakeStoreApi {
  const stock = opts.stock ?? 10;
  const api: FakeStoreApi = {
    fetch: vi.fn(),
    calls: [],
    callsTo: (route) => api.calls.filter((c) => `${c.method} ${c.path}` === route),
    cart: { id: uuid(), couponCode: null, items: [] },
    wishlist: [],
    compare: [],
    addresses: [],
    orders: [],
    failures: new Map(),
    checkoutExtras: {},
  };

  function cartResponse() {
    const items = api.cart.items.map((i) => {
      const p = productById(i.productId)!;
      const unit = unitPriceOf(p);
      return {
        id: i.id,
        productId: i.productId,
        productName: p.name,
        productSku: p.sku,
        productImage: p.images?.[0] ?? null,
        productType: p.productType,
        metalPurity: p.metalPurity,
        metalWeightMg: p.metalWeightMg,
        quantity: i.quantity,
        unitPricePaise: unit,
        lineTotalPaise: unit * i.quantity,
        metalRatePaiseLocked: null,
        addedAt: "2026-03-01T10:00:00.000Z",
      };
    });
    const subtotal = items.reduce((s, i) => s + i.lineTotalPaise, 0);
    const pct = api.cart.couponCode ? (COUPONS[api.cart.couponCode] ?? 0) : 0;
    const discount = Math.floor((subtotal * pct) / 100);
    return {
      id: api.cart.id,
      customerId: opts.signedIn ? "c0000000-0000-4000-8000-000000000001" : null,
      sessionId: "sess",
      currencyCode: "INR",
      couponCode: api.cart.couponCode,
      items,
      subtotalPaise: subtotal,
      discountPaise: discount,
      taxPaise: 0,
      totalPaise: subtotal - discount,
      itemCount: items.reduce((s, i) => s + i.quantity, 0),
      expiresAt: "2026-04-01T10:00:00.000Z",
    };
  }

  function route(call: RecordedCall) {
    const { method, path, body } = call;
    const key = `${method} ${path}`;
    const forced = [...api.failures.entries()].find(([k]) => k === key || key.startsWith(`${k}`));
    if (forced) return err(forced[1].status, forced[1].message);

    // ── catalog (wishlist / compare pages resolve ids through it)
    const prod = path.match(/^\/products\/(.+)$/);
    if (method === "GET" && prod) {
      const found = productById(prod[1]!);
      return found ? ok(found) : notFoundRes();
    }

    // ── cart
    if (path === "/cart" && method === "GET") return ok(cartResponse());
    if (path === "/cart" && method === "DELETE") {
      api.cart.items = [];
      api.cart.couponCode = null;
      return ok(cartResponse());
    }
    if (path === "/cart/merge" && method === "POST") {
      if (!opts.signedIn) return err(401, "Customer login required");
      return ok(cartResponse());
    }
    if (path === "/cart/items" && method === "POST") {
      const productId = String(body?.productId ?? "");
      const qty = Number(body?.quantity ?? 1);
      if (!productById(productId)) return err(404, "Product not found");
      const existing = api.cart.items.find((i) => i.productId === productId);
      const desired = (existing?.quantity ?? 0) + qty;
      if (desired > stock) return err(400, `Insufficient stock. Available: ${stock}, requested: ${desired}`);
      if (existing) existing.quantity = desired;
      else api.cart.items.push({ id: uuid(), productId, quantity: qty });
      return ok(cartResponse());
    }
    const item = path.match(/^\/cart\/items\/(.+)$/);
    if (item) {
      const found = api.cart.items.find((i) => i.id === item[1]);
      if (!found) return err(404, "Cart item not found");
      if (method === "PUT") {
        const qty = Number(body?.quantity);
        if (qty > stock) return err(400, `Insufficient stock. Available: ${stock}, requested: ${qty}`);
        found.quantity = qty;
      } else if (method === "DELETE") {
        api.cart.items = api.cart.items.filter((i) => i !== found);
      }
      return ok(cartResponse());
    }
    if (path === "/cart/coupon" && method === "POST") {
      const code = String(body?.couponCode ?? "");
      if (!(code in COUPONS)) return err(400, "Invalid coupon code");
      api.cart.couponCode = code;
      return ok(cartResponse());
    }

    // ── wishlist (customer only)
    if (path.startsWith("/wishlist")) {
      if (!opts.signedIn) return err(401, "Customer login required");
      if (path === "/wishlist" && method === "GET") {
        return ok({
          total: api.wishlist.length,
          items: api.wishlist.map((productId) => ({ id: uuid(), productId })),
        });
      }
      if (path === "/wishlist" && method === "POST") {
        const id = String(body?.productId);
        if (!api.wishlist.includes(id)) api.wishlist.push(id);
        return res(201, { success: true, data: null });
      }
      const w = path.match(/^\/wishlist\/(.+)$/);
      if (w && method === "DELETE") {
        api.wishlist = api.wishlist.filter((id) => id !== w[1]);
        return ok(null);
      }
    }

    // ── compare (guest session or customer)
    if (path === "/compare" && method === "GET") {
      return ok({ id: api.compare.length ? "cmp" : "", productIds: [...api.compare], products: [] });
    }
    if (path === "/compare" && method === "POST") {
      const id = String(body?.productId);
      if (id.includes("dead")) return err(404, "Product not found");
      if (!api.compare.includes(id)) {
        if (api.compare.length >= 4) return err(400, "Cannot compare more than 4 products. Remove an item first.");
        api.compare.push(id);
      }
      return res(201, { success: true, data: { id: "cmp", productIds: [...api.compare] } });
    }
    if (path === "/compare" && method === "DELETE") {
      api.compare = [];
      return ok(null);
    }
    const c = path.match(/^\/compare\/(.+)$/);
    if (c && method === "DELETE") {
      api.compare = api.compare.filter((id) => id !== c[1]);
      return ok({ id: "cmp", productIds: [...api.compare] });
    }

    // ── addresses / checkout / orders (customer only)
    if (path === "/addresses" && method === "GET") {
      if (!opts.signedIn) return err(401, "Customer login required");
      return ok(api.addresses);
    }
    if (path === "/addresses" && method === "POST") {
      if (!opts.signedIn) return err(401, "Customer login required");
      const created = { id: uuid(), customerId: "c0000000-0000-4000-8000-000000000001", addressLine2: null, ...body };
      api.addresses.push(created);
      return res(201, { success: true, data: created });
    }
    if (path === "/checkout" && method === "POST") {
      if (!opts.signedIn) return err(401, "Customer login required");
      const cart = cartResponse();
      if (cart.items.length === 0) return err(400, "Cart is empty or not found");
      const order = { id: uuid(), status: "PENDING" };
      api.orders.push(order);
      return ok({
        id: order.id,
        orderNumber: "ORD-1",
        status: "PENDING",
        totalPaise: cart.totalPaise,
        items: [],
        shipments: [],
        payments: [],
        ...api.checkoutExtras,
      });
    }
    const complete = path.match(/^\/checkout\/(.+)\/complete$/);
    if (complete && method === "POST") {
      const order = api.orders.find((o) => o.id === complete[1]);
      if (!order) return err(404, "Order not found");
      order.status = "CONFIRMED";
      api.cart.items = [];
      api.cart.couponCode = null;
      return ok({ id: order.id, status: "CONFIRMED" });
    }
    const cancel = path.match(/^\/orders\/(.+)\/cancel$/);
    if (cancel && method === "POST") {
      const order = api.orders.find((o) => o.id === cancel[1]);
      if (order) order.status = "CANCELLED";
      return ok({ id: cancel[1], status: "CANCELLED" });
    }

    return res(404, { success: false, error: { message: `No fake route for ${key}` } });
  }

  api.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: RecordedCall = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname.replace("/api/v1/store", ""),
      query: url.searchParams,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    api.calls.push(call);
    return route(call);
  });
  vi.stubGlobal("fetch", api.fetch);
  return api;
}

export const PRODUCT_IDS = { A: PRODUCT_A_ID, B: PRODUCT_B_ID, C: PRODUCT_C_ID };
