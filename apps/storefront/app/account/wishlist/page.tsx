"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";
import { lookupProducts } from "@/lib/product-lookup";

/** Shape returned by GET /store/wishlist (StorefrontWishlistService.getWishlist). */
interface WishlistItem {
  id: string;
  productId: string;
  productName?: string;
  productSku?: string;
  productImage?: string | null;
  productType?: string;
  currentPricePaise?: number;
  stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  priceAlertEnabled?: boolean;
  priceAlertThresholdPaise?: number | null;
  addedAt?: string;
}

interface WishlistResponse {
  items?: WishlistItem[];
  total?: number;
}

export default function AccountWishlistPage() {
  const { addToCart } = useStore();
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Try b2c-features wishlist endpoint first (the storefront REST one)
        const data = await apiFetch<WishlistResponse>("/api/v1/store/wishlist", { tenantHeaders: true });
        if (cancelled) return;
        setItems(data.items ?? []);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          if (typeof window !== "undefined") window.location.href = "/auth/login";
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load wishlist");
        setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleRemove(productId: string) {
    try {
      await apiFetch(`/api/v1/store/wishlist/${productId}`, {
        method: "DELETE",
        tenantHeaders: true,
      });
      setItems((prev) => (prev ? prev.filter((it) => it.productId !== productId) : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not remove item");
    }
  }

  async function handleAddToCart(productId: string) {
    const [product] = await lookupProducts([productId]);
    if (!product) {
      setError("Could not load this product. Please try again.");
      return;
    }
    addToCart(product);
  }

  if (items === null) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy mb-6" style={{ fontFamily: "var(--font-serif)" }}>My Wishlist</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-navy/50 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6" style={{ fontFamily: "var(--font-serif)" }}>My Wishlist</h1>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-navy/40 mb-2">Your wishlist is empty</p>
          <p className="text-sm text-navy/30 mb-4">Save items you love to your wishlist</p>
          <Link href="/" className="text-gold font-medium hover:text-gold-dark transition-colors">
            Browse Jewelry
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const productId = item.productId;
            const name = item.productName || "Product";
            const img = item.productImage || null;
            const price = item.currentPricePaise ?? 0;
            return (
              <div key={item.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4">
                <Link href={`/product/${productId}`} className="w-20 h-20 rounded-lg overflow-hidden bg-warm-gray flex-shrink-0">
                  {img ? (
                    <img src={img} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-warm-gray" />
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/product/${productId}`} className="text-sm font-medium text-navy hover:text-gold transition-colors">
                    {name}
                  </Link>
                  {item.productSku && <p className="text-xs text-navy/40 mt-0.5">SKU: {item.productSku}</p>}
                  {price > 0 && <p className="text-sm font-bold text-navy mt-1">{formatPrice(price)}</p>}
                  {item.priceAlertEnabled && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">Price alert enabled</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddToCart(productId)}
                    disabled={item.stockStatus === "OUT_OF_STOCK"}
                    className="px-4 py-2 bg-gold text-white text-xs font-semibold rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-50"
                  >
                    {item.stockStatus === "OUT_OF_STOCK" ? "Out of stock" : "Add to Cart"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(productId)}
                    className="px-4 py-2 border border-gray-200 text-navy/60 text-xs font-medium rounded-lg hover:border-rose-300 hover:text-rose-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
