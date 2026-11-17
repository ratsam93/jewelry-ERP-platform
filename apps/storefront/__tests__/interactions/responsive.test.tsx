/**
 * Responsive layout interaction tests.
 * Tests mobile vs desktop viewport behaviors for category and cart pages.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installCatalogFetch } from "../fixtures/api-catalog";
import { screen } from "@testing-library/react";
import { renderWithStore, userEvent } from "./test-utils";
import CategoryPage from "@/app/category/[slug]/page";
import WishlistPage from "@/app/wishlist/page";
import HomePage from "@/app/page";

const mockParams: Record<string, string> = {};

async function renderCategory(slug: string) {
  return renderWithStore(
    await CategoryPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }),
  );
}

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      refresh: vi.fn(),
    }),
    usePathname: () => "/",
    useParams: () => mockParams,
    notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
    },
    useSearchParams: () => new URLSearchParams(),
  };
});

describe("Responsive Layout", () => {
  beforeEach(() => {
    Object.keys(mockParams).forEach((k) => delete mockParams[k]);
    installCatalogFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("category page has mobile filter toggle button with Filters text", async () => {
    await renderCategory("all");
    // The button is always rendered but hidden on lg via CSS classes
    const filterBtn = screen.getByRole("button", { name: /filters/i });
    expect(filterBtn).toBeInTheDocument();
    // It should have the lg:hidden class
    expect(filterBtn.className).toContain("lg:hidden");
  });

  it("clicking mobile filter toggle shows the filter sidebar", async () => {
    const user = userEvent.setup();
    await renderCategory("all");
    const filterBtn = screen.getByRole("button", { name: /filters/i });
    await user.click(filterBtn);
    // When mobile filters are shown, a close button appears
    const closeButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector("svg path[d*='M6 18L18 6']") !== null,
    );
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("desktop filter sidebar container has lg:block class", async () => {
    const { container } = await renderCategory("all");
    // The sidebar wrapper should have "hidden" and "lg:block" classes
    const sidebar = container.querySelector(".lg\\:block.w-64");
    expect(sidebar).not.toBeNull();
  });

  it("home page renders trust strip with 4 items", async () => {
    renderWithStore(await HomePage());
    expect(screen.getByText("BIS Hallmarked")).toBeInTheDocument();
    expect(screen.getByText("Certified Diamonds")).toBeInTheDocument();
    expect(screen.getByText("Lifetime Exchange")).toBeInTheDocument();
    expect(screen.getByText("365-Day Returns")).toBeInTheDocument();
  });

  it("wishlist page shows empty state with explore link when no items", async () => {
    renderWithStore(<WishlistPage />);
    expect(screen.getByText(/your wishlist is empty/i)).toBeInTheDocument();
    const exploreLink = screen.getByRole("link", { name: /explore jewelry/i });
    expect(exploreLink).toHaveAttribute("href", "/");
  });
});
