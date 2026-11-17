import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductDetailPage, { generateMetadata } from "@/app/product/[id]/page";
import { renderWithStore } from "../../components/__tests__/test-utils";
import {
  apiProductA,
  apiProductB,
  PRODUCT_B_ID,
  installCatalogFetch,
  serverErrorRes,
  defaultRouter,
  ok,
  page,
} from "../fixtures/api-catalog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/product/x",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/VoiceSearch", () => ({ default: () => null }));

async function renderProduct(id: string) {
  const ui = await ProductDetailPage({ params: Promise.resolve({ id }) });
  return renderWithStore(ui);
}

beforeEach(() => {
  installCatalogFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProductDetailPage (server)", () => {
  it("renders a real (UUID) product: name, SKU, gallery", async () => {
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(apiProductB.name);
    expect(screen.getByText(`SKU: ${apiProductB.sku}`)).toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("shows API-derived price and weights", async () => {
    await renderProduct(PRODUCT_B_ID);
    // 5,337,357 paise
    expect(screen.getAllByText("₹53,374").length).toBeGreaterThan(0);
    expect(screen.getByText("Price Breakdown")).toBeInTheDocument();
    expect(screen.getAllByText("8.28g").length).toBeGreaterThan(0);
  });

  it("enables Add to Cart for in-stock products and shows Out of Stock otherwise", async () => {
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getByRole("button", { name: "Add to Cart" })).toBeEnabled();
    document.body.innerHTML = "";
    await renderProduct(apiProductA.id);
    expect(screen.getByRole("button", { name: "Out of Stock" })).toBeDisabled();
  });

  it("calls notFound() for an unknown product id (real 404, fixes SF-06)", async () => {
    await expect(renderProduct("prod-001")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("does not swallow upstream server errors", async () => {
    installCatalogFetch(() => serverErrorRes());
    await expect(renderProduct(PRODUCT_B_ID)).rejects.toThrow();
  });

  it("emits JSON-LD built from the real product", async () => {
    const { container } = await renderProduct(PRODUCT_B_ID);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld).toMatchObject({
      "@type": "Product",
      name: apiProductB.name,
      sku: apiProductB.sku,
      offers: { price: "53373.57", priceCurrency: "INR", availability: "https://schema.org/InStock" },
      aggregateRating: { ratingValue: 4.5, reviewCount: 2 },
    });
  });

  it("renders description/specifications/reviews tabs and real reviews", async () => {
    const user = userEvent.setup();
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getByText(apiProductB.description!)).toBeInTheDocument();
    await user.click(screen.getByText("specifications"));
    expect(screen.getByText("Metal Type")).toBeInTheDocument();
    expect(screen.getByText("Finish")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reviews/i }));
    expect(screen.getByText("Gorgeous")).toBeInTheDocument();
    expect(screen.getByText("Priya S.")).toBeInTheDocument();
  });

  it("shows empty reviews state", async () => {
    const user = userEvent.setup();
    await renderProduct(apiProductA.id);
    await user.click(screen.getByRole("button", { name: /reviews/i }));
    expect(screen.getByText(/No reviews yet/i)).toBeInTheDocument();
  });

  it("still renders when reviews and related products fail", async () => {
    installCatalogFetch((url) => {
      if (url.pathname.includes("/reviews/")) return serverErrorRes();
      if (url.pathname.endsWith("/products")) return serverErrorRes();
      return defaultRouter(url);
    });
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(apiProductB.name);
    expect(screen.queryByText("You May Also Like")).not.toBeInTheDocument();
  });

  it("renders related products (excluding the product itself)", async () => {
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getByText("You May Also Like")).toBeInTheDocument();
    expect(screen.getByText(apiProductA.name)).toBeInTheDocument();
  });

  it("renders wishlist button", async () => {
    await renderProduct(PRODUCT_B_ID);
    expect(screen.getAllByLabelText(/wishlist/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe("generateMetadata", () => {
  it("uses the real product for title/description/OG image", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ id: PRODUCT_B_ID }) });
    expect(meta.title).toBe(apiProductB.name);
    expect(meta.openGraph?.images).toEqual([apiProductB.images![0]]);
  });

  it("returns a not-found title for unknown ids and a safe title on errors", async () => {
    expect((await generateMetadata({ params: Promise.resolve({ id: "prod-001" }) })).title).toBe("Product Not Found");
    installCatalogFetch(() => serverErrorRes());
    expect((await generateMetadata({ params: Promise.resolve({ id: PRODUCT_B_ID }) })).title).toBe("Jewelry");
  });
});
