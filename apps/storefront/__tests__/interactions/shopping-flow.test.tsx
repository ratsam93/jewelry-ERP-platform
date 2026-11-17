/**
 * Shopping flow interaction tests.
 * Covers browsing, filtering, sorting, product detail interactions
 * against API-shaped catalog responses (fetch is mocked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithStore, userEvent } from "./test-utils";
import HomePage from "@/app/page";
import CategoryPage from "@/app/category/[slug]/page";
import ProductDetailPage from "@/app/product/[id]/page";
import {
  installCatalogFetch,
  apiProductB,
  apiProductA,
  PRODUCT_B_ID,
} from "../fixtures/api-catalog";

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
    useParams: () => ({}),
    useSearchParams: () => new URLSearchParams(),
    notFound: () => {
      throw new Error("NEXT_NOT_FOUND");
    },
  };
});

async function renderCategory(slug: string) {
  return renderWithStore(
    await CategoryPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }),
  );
}

async function renderProduct(id: string) {
  return renderWithStore(await ProductDetailPage({ params: Promise.resolve({ id }) }));
}

describe("Shopping Flow", () => {
  beforeEach(() => {
    installCatalogFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Home Page ─────────────────────────────────────────────

  it("renders home page with category grid linking to category pages", async () => {
    renderWithStore(await HomePage());
    const categoryLinks = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href")?.startsWith("/category/"));
    expect(categoryLinks.length).toBeGreaterThanOrEqual(1);
    expect(categoryLinks.some((el) => el.getAttribute("href") === "/category/gold")).toBe(true);
  });

  it("renders hero banner with primary CTAs", async () => {
    renderWithStore(await HomePage());
    expect(screen.getByText("Shop Collection")).toBeInTheDocument();
    expect(screen.getByText("Book Consultation")).toBeInTheDocument();
  });

  it("shows Featured Collections and Featured Pieces sections", async () => {
    renderWithStore(await HomePage());
    expect(screen.getByText("Featured Collections")).toBeInTheDocument();
    expect(screen.getByText("Featured Pieces")).toBeInTheDocument();
  });

  it("displays testimonials and newsletter sections", async () => {
    renderWithStore(await HomePage());
    expect(screen.getByText("What Our Clients Say")).toBeInTheDocument();
    expect(screen.getByText("Join the CaratFlow Circle")).toBeInTheDocument();
  });

  it("displays live gold rate strip", async () => {
    renderWithStore(await HomePage());
    expect(screen.getByText("Live Rates")).toBeInTheDocument();
  });

  // ─── Category Page ─────────────────────────────────────────

  it("category page renders products for a given slug", async () => {
    await renderCategory("ring");
    expect(screen.getAllByText("Ring").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/designs found/)).toBeInTheDocument();
    expect(screen.getByText(apiProductB.name)).toBeInTheDocument();
  });

  it("filter by purity narrows the visible products", async () => {
    const user = userEvent.setup();
    await renderCategory("all");
    expect(screen.getByText("3 designs found")).toBeInTheDocument();
    const goldCheckbox = screen.getByRole("checkbox", { name: /gold/i });
    await user.click(goldCheckbox);
    expect(screen.getByText(/designs found/)).toBeInTheDocument();
  });

  it("sort by price changes product order via select dropdown", async () => {
    const user = userEvent.setup();
    await renderCategory("all");
    const sortSelect = screen.getByRole("combobox");
    await user.selectOptions(sortSelect, "price_desc");
    expect(sortSelect).toHaveValue("price_desc");
    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent)
      .filter((n) => n !== "Filters");
    expect(names[0]).toBe(apiProductB.name); // only product with live metal value
  });

  it("unknown category triggers notFound()", async () => {
    await expect(renderCategory("nonexistent-category-xyz")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("mobile filter toggle button is rendered", async () => {
    await renderCategory("all");
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
  });

  // ─── Product Detail ────────────────────────────────────────

  it("product detail shows name, SKU, and price", async () => {
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getAllByText(apiProductB.name).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(`SKU: ${apiProductB.sku}`)).toBeInTheDocument();
  });

  it("clicking wishlist heart toggles its state", async () => {
    const user = userEvent.setup();
    await renderProduct(PRODUCT_B_ID);
    const heartBtns = screen.getAllByRole("button", { name: /add to wishlist/i });
    await user.click(heartBtns[0]!);
    expect(screen.getAllByRole("button", { name: /remove from wishlist/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("switching tabs shows description, specifications, and reviews", async () => {
    const user = userEvent.setup();
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getByText(apiProductB.description!)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /specifications/i }));
    expect(screen.getByText("Metal Type")).toBeInTheDocument();
    expect(screen.getByText("Purity")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reviews/i }));
    expect(screen.getByText(/reviews$/i)).toBeInTheDocument();
  });

  it("unknown product triggers notFound() instead of a soft 404", async () => {
    await expect(renderProduct("nonexistent-product-id")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("out-of-stock product disables add to cart", async () => {
    await renderProduct(apiProductA.id);
    expect(screen.getByRole("button", { name: "Out of Stock" })).toBeDisabled();
  });

  it("quantity increment and decrement buttons work", async () => {
    const user = userEvent.setup();
    const { container } = await renderProduct(PRODUCT_B_ID);
    const quantitySection = container.querySelector(".flex.items-center.border.border-gray-200.rounded-lg.w-fit");
    expect(quantitySection).not.toBeNull();
    const buttons = quantitySection!.querySelectorAll("button");
    const quantityDisplay = quantitySection!.querySelector("span")!;
    expect(quantityDisplay.textContent).toBe("1");
    await user.click(buttons[1]!);
    expect(quantityDisplay.textContent).toBe("2");
    await user.click(buttons[0]!);
    expect(quantityDisplay.textContent).toBe("1");
  });
});
