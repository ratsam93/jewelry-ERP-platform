"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATALOG_REVALIDATE_SECONDS, getCategories } from "@/lib/catalog";
import { METAL_TYPES, NAV_FALLBACK_CATEGORIES, OCCASIONS } from "@/lib/constants";
import type { Category } from "@/lib/types";

// ─── Category navigation (API-driven) ────────────────────────────────

export interface NavCategoryLink {
  id: string;
  name: string;
  href: string;
}

/**
 * Top-level API categories as nav links. The slug comes from lib/catalog.ts
 * (slugify of the category name), the same value the category page resolves.
 */
export function categoryLinksFromTree(tree: Category[]): NavCategoryLink[] {
  const seen = new Set<string>();
  const links: NavCategoryLink[] = [];
  for (const c of tree) {
    if (!c.slug || seen.has(c.slug)) continue;
    seen.add(c.slug);
    links.push({ id: c.id, name: c.name, href: `/category/${c.slug}` });
  }
  return links;
}

const FALLBACK_LINKS: NavCategoryLink[] = NAV_FALLBACK_CATEGORIES.map((c) => ({
  id: c.href,
  name: c.name,
  href: c.href,
}));

// Shared across Header, MegaMenu and Footer so one page load makes one request.
const NAV_CACHE_MS = CATALOG_REVALIDATE_SECONDS * 1000;
let navCache: { at: number; request: Promise<Category[]> } | null = null;

function requestCategories(): Promise<Category[]> {
  if (navCache && Date.now() - navCache.at < NAV_CACHE_MS) return navCache.request;
  const request = getCategories();
  const entry = { at: Date.now(), request };
  navCache = entry;
  // Failed requests are not cached, so the next mount retries.
  request.catch(() => {
    if (navCache === entry) navCache = null;
  });
  return request;
}

/** Test helper: forget the cached categories request. */
export function resetNavCategoryCache() {
  navCache = null;
}

/**
 * Category links from the API. While loading, `links` is empty. If the API
 * fails or returns no categories, `links` falls back to NAV_FALLBACK_CATEGORIES,
 * which only link to /search?q=... so they never 404.
 */
export function useNavCategories(): { loading: boolean; links: NavCategoryLink[] } {
  const [state, setState] = useState<{ loading: boolean; links: NavCategoryLink[] }>({
    loading: true,
    links: [],
  });

  useEffect(() => {
    let active = true;
    requestCategories()
      .then((tree) => {
        const links = categoryLinksFromTree(tree);
        if (active) setState({ loading: false, links: links.length > 0 ? links : FALLBACK_LINKS });
      })
      .catch(() => {
        if (active) setState({ loading: false, links: FALLBACK_LINKS });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

// ─── Mega menu ────────────────────────────────────────────────────────

export default function MegaMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const categories = useNavCategories();

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-navy/70 hover:text-gold transition-colors py-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        Categories
        <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 w-[680px] bg-white rounded-xl shadow-2xl border border-gray-100 p-6 z-50">
          <div className="grid grid-cols-3 gap-6">
            {/* Categories */}
            <div>
              <h3 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-3">Jewelry Type</h3>
              <div className="space-y-1">
                {categories.loading && <NavSkeleton rows={6} />}
                {!categories.loading &&
                  categories.links.slice(0, 10).map((cat) => (
                    <Link
                      key={cat.id}
                      href={cat.href}
                      className="flex items-center gap-2 py-1.5 text-sm text-navy/70 hover:text-gold transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      <span>{cat.name}</span>
                    </Link>
                  ))}
              </div>
            </div>

            {/* Metal Type */}
            <div>
              <h3 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-3">Metal Type</h3>
              <div className="space-y-1">
                {METAL_TYPES.map((metal) => (
                  <Link
                    key={metal.value}
                    href={`/search?q=${encodeURIComponent(metal.label)}`}
                    className="flex items-center gap-2 py-1.5 text-sm text-navy/70 hover:text-gold transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-gold/20 to-gold/40 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-gold/60" />
                    </span>
                    <span>{metal.label}</span>
                  </Link>
                ))}
              </div>

              <h3 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-3 mt-6">Shop by Occasion</h3>
              <div className="space-y-1">
                {OCCASIONS.slice(0, 4).map((occ) => (
                  <Link
                    key={occ.slug}
                    href={`/category/all?occasion=${occ.slug}`}
                    className="block py-1.5 text-sm text-navy/70 hover:text-gold transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    {occ.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Promo */}
            <div className="bg-gradient-to-br from-cream to-gold/10 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gold uppercase tracking-wider mb-1">Special Offer</p>
                <h4 className="text-lg font-bold text-navy leading-tight mb-1">
                  Flat 15% Off Making Charges
                </h4>
                <p className="text-xs text-navy/60 mb-3">
                  On all diamond jewelry. Use code SPARKLE15
                </p>
              </div>
              <Link
                href="/search?q=diamond"
                className="inline-block bg-gold text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-gold-dark transition-colors text-center"
                onClick={() => setIsOpen(false)}
              >
                Shop Diamonds
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="space-y-2 py-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 w-24 rounded bg-navy/10 animate-pulse" />
      ))}
    </div>
  );
}
