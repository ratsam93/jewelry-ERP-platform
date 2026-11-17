"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SORT_OPTIONS } from "@/lib/constants";
import {
  applyProductFilters,
  CATEGORY_PAGE_SIZE,
  getCategoryProducts,
  type CatalogPage,
  type CatalogProduct,
} from "@/lib/catalog";
import type { Category, FilterState } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import FilterSidebar from "@/components/FilterSidebar";
import { cn } from "@/lib/utils";

const defaultFilters: FilterState = {
  metalType: [],
  purity: [],
  priceRange: [0, 1000000],
  weightRange: [0, 100],
  gemstone: [],
  gender: [],
  occasion: [],
  availability: "all",
  sortBy: "popularity",
};

interface CategoryViewProps {
  /** Resolved category, or null for the "all products" listing. */
  category: Category | null;
  title: string;
  /** First page of products, fetched on the server. */
  initial: CatalogPage;
  initialFilters?: Partial<FilterState>;
}

export default function CategoryView({ category, title, initial, initialFilters }: CategoryViewProps) {
  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters, ...initialFilters });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [loaded, setLoaded] = useState<CatalogProduct[]>(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasNext, setHasNext] = useState(initial.hasNext);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");

  const products = useMemo(() => applyProductFilters(loaded, filters), [loaded, filters]);

  async function loadMore() {
    setLoadingMore(true);
    setLoadError("");
    try {
      const next = await getCategoryProducts(category, { page: page + 1, limit: CATEGORY_PAGE_SIZE });
      setLoaded((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.items.filter((p) => !seen.has(p.id))];
      });
      setPage(next.page);
      setHasNext(next.hasNext);
    } catch {
      setLoadError("Couldn't load more products. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  const activeFilterCount = [
    filters.metalType.length,
    filters.purity.length,
    filters.gender.length,
    filters.occasion.length,
    filters.availability === "in_stock" ? 1 : 0,
  ].reduce((sum, n) => sum + n, 0);


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-navy/50 mb-6">
        <Link href="/" className="hover:text-gold transition-colors">Home</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-navy font-medium">{title}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-navy" style={{ fontFamily: "var(--font-serif)" }}>
            {title}
          </h1>
          <p className="text-sm text-navy/50 mt-1">{activeFilterCount > 0 ? products.length : Math.max(initial.total, loaded.length)} designs found</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mobile filter toggle */}
          <button
            type="button"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="lg:hidden flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-navy"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 bg-gold text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sort */}
          <select aria-label="Sort products"
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as FilterState["sortBy"] })}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-gold"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {filters.metalType.map((m) => (
            <span key={m} className="flex items-center gap-1 px-3 py-1 bg-gold/10 text-gold-dark text-xs font-medium rounded-full">
              {m}
              <button type="button" onClick={() => setFilters({ ...filters, metalType: filters.metalType.filter((v) => v !== m) })}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {filters.purity.map((p) => (
            <span key={p} className="flex items-center gap-1 px-3 py-1 bg-gold/10 text-gold-dark text-xs font-medium rounded-full">
              {p} fineness
              <button type="button" onClick={() => setFilters({ ...filters, purity: filters.purity.filter((v) => v !== p) })}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setFilters(defaultFilters)}
            className="text-xs text-navy/40 hover:text-navy transition-colors underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className={cn(
          "lg:block w-64 flex-shrink-0",
          showMobileFilters ? "fixed inset-0 z-50 bg-white overflow-y-auto p-4 lg:relative lg:p-0" : "hidden"
        )}>
          {showMobileFilters && (
            <div className="flex items-center justify-between mb-4 lg:hidden">
              <h3 className="font-bold text-navy">Filters</h3>
              <button type="button" onClick={() => setShowMobileFilters(false)} className="p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <FilterSidebar filters={filters} onFilterChange={setFilters} />
        </div>

        {/* Product Grid */}
        <div className="flex-1">
          {products.length === 0 ? (
            <div className="text-center py-20">
              <svg className="w-16 h-16 text-navy/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <h3 className="text-lg font-semibold text-navy mb-1">No products found</h3>
              {activeFilterCount > 0 ? (
                <>
                  <p className="text-sm text-navy/50 mb-4">Try adjusting your filters</p>
                  <button
                    type="button"
                    onClick={() => setFilters(defaultFilters)}
                    className="text-gold font-medium text-sm hover:text-gold-dark transition-colors"
                  >
                    Clear all filters
                  </button>
                </>
              ) : (
                <p className="text-sm text-navy/50 mb-4">There are no products in this collection yet.</p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {loadError && <p role="alert" className="text-center text-sm text-rose-600 mt-6">{loadError}</p>}
              {hasNext && (
                <div className="text-center mt-8">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 border border-gold text-gold text-sm font-semibold rounded-lg hover:bg-gold/10 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
