"use client";

// Resolve product ids (wishlist / compare lists) to full UI products via the
// public catalog API. Results are cached for the lifetime of the page.

import { useEffect, useMemo, useState } from "react";
import { getProduct } from "./catalog";
import type { Product } from "./types";

const cache = new Map<string, Product | null>();

/** Test hook: forget cached lookups. */
export function clearProductLookupCache(): void {
  cache.clear();
}

export async function lookupProducts(ids: string[]): Promise<Product[]> {
  const missing = ids.filter((id) => !cache.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        cache.set(id, await getProduct(id));
      } catch {
        // transient failure: leave uncached so a later call retries
      }
    }),
  );
  return ids.map((id) => cache.get(id)).filter((p): p is Product => !!p);
}

export function useProductsByIds(ids: string[]): { products: Product[]; loading: boolean } {
  const key = ids.join(",");
  const stableIds = useMemo(() => (key ? key.split(",") : []), [key]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(stableIds.length > 0);

  useEffect(() => {
    let cancelled = false;
    if (stableIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    lookupProducts(stableIds).then((list) => {
      if (cancelled) return;
      setProducts(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [stableIds]);

  return { products, loading };
}
