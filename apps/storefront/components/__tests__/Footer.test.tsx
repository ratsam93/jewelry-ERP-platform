import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import Footer from "@/components/Footer";
import { resetNavCategoryCache } from "@/components/MegaMenu";
import { render } from "./test-utils";
import { installCatalogFetch } from "../../__tests__/fixtures/api-catalog";

function shopColumnHrefs(): string[] {
  const heading = screen.getByText("Shop Jewelry");
  const column = heading.closest("div") as HTMLElement;
  return Array.from(column.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
}

describe("Footer", () => {
  beforeEach(() => {
    resetNavCategoryCache();
    installCatalogFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders all section headings", () => {
    render(<Footer />);
    expect(screen.getByText("Shop Jewelry")).toBeInTheDocument();
    expect(screen.getByText("Customer Service")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
  });

  it("renders shop links from the API categories", async () => {
    render(<Footer />);
    await waitFor(() => expect(shopColumnHrefs()).toContain("/category/gold"));
    expect(shopColumnHrefs()).toContain("/category/silver");
    expect(shopColumnHrefs()).not.toContain("/category/rings");
  });

  it("every shop link resolves to a search, all-products page, or API slug", async () => {
    render(<Footer />);
    await waitFor(() => expect(shopColumnHrefs()).toContain("/category/gold"));
    for (const href of shopColumnHrefs()) {
      const ok = /^\/search\?q=/.test(href) || /^\/category\/all(\?|$)/.test(href) || ["/category/gold", "/category/silver"].includes(href);
      expect(ok, `unexpected footer href: ${href}`).toBe(true);
    }
  });

  it("falls back to search links in the shop column when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => null })));
    render(<Footer />);
    await waitFor(() => expect(shopColumnHrefs()).toContain("/search?q=Rings"));
    for (const href of shopColumnHrefs()) {
      expect(href.startsWith("/search?q=")).toBe(true);
    }
  });

  it("renders trust badges", () => {
    render(<Footer />);
    // Trust badges may appear multiple times (in footer and other sections)
    expect(screen.getAllByText("BIS Hallmark").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("IGI Certified").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Insured Shipping").length).toBeGreaterThanOrEqual(1);
  });

  it("renders payment methods and copyright", () => {
    render(<Footer />);
    expect(screen.getByText("Visa")).toBeInTheDocument();
    expect(screen.getByText("UPI")).toBeInTheDocument();
    expect(screen.getByText(`© ${new Date().getFullYear()} TechBeyond`)).toBeInTheDocument();
    expect(screen.queryByText(/Globussoft/)).toBeNull();
  });
});
