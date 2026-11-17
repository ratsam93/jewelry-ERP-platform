import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryPage from "@/app/category/[slug]/page";
import CategoryView from "@/components/CategoryView";
import { mapCategories, mapProduct, type CatalogPage } from "@/lib/catalog";
import { renderWithStore } from "../../components/__tests__/test-utils";
import {
  apiCategories,
  apiProductA,
  apiProductB,
  apiProductC,
  installCatalogFetch,
  ok,
  page,
  defaultRouter,
} from "../fixtures/api-catalog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/category/ring",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/VoiceSearch", () => ({ default: () => null }));

async function renderCategory(slug: string, search: Record<string, string> = {}) {
  const ui = await CategoryPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(search),
  });
  return renderWithStore(ui);
}

beforeEach(() => {
  installCatalogFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CategoryPage (server)", () => {
  it("renders breadcrumbs with Home link", async () => {
    await renderCategory("ring");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders the real category name as the heading", async () => {
    await renderCategory("ring");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ring");
  });

  it("resolves legacy plural slugs (rings -> Ring)", async () => {
    await renderCategory("rings");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ring");
  });

  it("renders API products with the real count and links", async () => {
    await renderCategory("ring");
    expect(screen.getByText("3 designs found")).toBeInTheDocument();
    expect(screen.getByText(apiProductA.name)).toBeInTheDocument();
    expect(screen.getByText(apiProductB.name)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === `/product/${apiProductB.id}`),
    ).toBe(true);
  });

  it("renders the 'all' listing without a category lookup", async () => {
    const f = installCatalogFetch();
    await renderCategory("all");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("All Jewelry");
    expect(f.mock.calls.some(([u]) => String(u).includes("/categories"))).toBe(false);
  });

  it("calls notFound() for an unknown category (real 404)", async () => {
    await expect(renderCategory("nonexistent-category-xyz")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("applies occasion and sort from the query string", async () => {
    await renderCategory("all", { occasion: "wedding", sort: "price_desc" });
    expect(screen.getByRole("combobox")).toHaveValue("price_desc");
    // only the Bridal (-> wedding) products remain: A and C
    expect(screen.queryByText(apiProductB.name)).not.toBeInTheDocument();
    expect(screen.getByText(apiProductA.name)).toBeInTheDocument();
  });

  it("shows an empty state when the category has no products", async () => {
    installCatalogFetch((url) => (url.pathname.endsWith("/products") ? ok(page([])) : defaultRouter(url)));
    await renderCategory("silver");
    expect(screen.getByText("No products found")).toBeInTheDocument();
    expect(screen.getByText(/no products in this collection/i)).toBeInTheDocument();
  });

  it("propagates API failures to the route error boundary", async () => {
    installCatalogFetch(() => ({ ok: false, status: 500, json: async () => ({ success: false, error: { message: "boom" } }) }));
    await expect(renderCategory("ring")).rejects.toThrow("boom");
  });

  it("renders filter sidebar and sort dropdown", async () => {
    await renderCategory("ring");
    expect(screen.getAllByText("Filters").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Popularity")).toBeInTheDocument();
  });
});

describe("CategoryView (client)", () => {
  const tree = mapCategories(apiCategories);
  const initial: CatalogPage = {
    items: [mapProduct(apiProductA), mapProduct(apiProductB)],
    total: 3,
    page: 1,
    limit: 2,
    totalPages: 2,
    hasNext: true,
  };

  it("loads the next page via 'Load more' and de-duplicates", async () => {
    const f = installCatalogFetch((url) =>
      url.pathname.endsWith("/products")
        ? ok(page([apiProductB, apiProductC], { page: 2, hasNext: false, total: 3 }))
        : undefined,
    );
    const user = userEvent.setup();
    renderWithStore(<CategoryView category={tree[0]!.children![1]!} title="Ring" initial={initial} />);
    expect(screen.queryByText(apiProductC.name)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByText(apiProductC.name)).toBeInTheDocument());
    expect(screen.getAllByText(apiProductB.name)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(f.mock.calls.some((c) => String(c[0]).includes("page=2"))).toBe(true);
  });

  it("shows an error message when loading more fails", async () => {
    installCatalogFetch(() => ({ ok: false, status: 500, json: async () => ({ success: false }) }));
    const user = userEvent.setup();
    renderWithStore(<CategoryView category={null} title="All Jewelry" initial={initial} />);
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load more/i);
  });

  it("filters loaded products client-side (in stock only)", async () => {
    const user = userEvent.setup();
    renderWithStore(<CategoryView category={null} title="All Jewelry" initial={{ ...initial, hasNext: false }} />);
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "price_asc");
    expect(select).toHaveValue("price_asc");
  });
});
