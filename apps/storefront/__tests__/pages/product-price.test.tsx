import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import ProductDetailPage from "@/app/product/[id]/page";
import { renderWithStore } from "../../components/__tests__/test-utils";
import { apiProductA, PRODUCT_A_ID, installCatalogFetch, defaultRouter, ok } from "../fixtures/api-catalog";
import { mapProduct } from "@/lib/catalog";
import { calculateProductPrice } from "@/lib/utils";
import type { ApiCatalogProduct } from "@/lib/catalog";

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

// Verbatim GET /api/v1/store/products/d6bc4d38-... after the wastage fix.
const realApi: ApiCatalogProduct = {
  ...apiProductA,
  metalValuePaise: 21390000,
  makingChargesPaise: 147200,
  makingValuePaise: 147200,
  wastagePercent: 200,
  wastageValuePaise: 427800,
  subtotalPaise: 21965000,
  gstPaise: 658950,
  totalPricePaise: 22623950,
  stockStatus: "IN_STOCK",
  availableQuantity: 11,
};

beforeEach(() => {
  installCatalogFetch((url) =>
    url.pathname.endsWith(`/products/${PRODUCT_A_ID}`) ? ok(realApi) : defaultRouter(url),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("product detail price (API shape, Rs 2,26,239.50)", () => {
  it("recomputed price equals API totalPricePaise exactly and the breakdown sums to it", () => {
    const price = calculateProductPrice(mapProduct(realApi));
    expect(price.total).toBe(22623950);
    expect(price.metalValue).toBe(21390000);
    // making + wastage = 147200 + 427800
    expect(price.makingCharges).toBe(575000);
    expect(price.subtotal).toBe(realApi.subtotalPaise);
    expect(price.gst).toBe(realApi.gstPaise);
    expect(price.metalValue + price.makingCharges + price.stoneCharges + price.gst).toBe(price.total);
    expect((price.total / 100).toFixed(2)).toBe("226239.50");
  });

  it("renders the total and a breakdown that adds up, not the old 6,62,467", async () => {
    const ui = await ProductDetailPage({ params: Promise.resolve({ id: PRODUCT_A_ID }) });
    const { container } = renderWithStore(ui);
    expect(screen.getAllByText("₹2,26,240").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("6,62,467");
    expect(container.textContent).not.toContain("4,29,272");

    const box = screen.getByText("Price Breakdown").closest("div")!.parentElement!;
    const w = within(box);
    expect(w.getByText("₹2,13,900")).toBeInTheDocument(); // metal
    expect(w.getByText("₹5,750")).toBeInTheDocument(); // making + wastage
    expect(w.getByText("₹2,19,650")).toBeInTheDocument(); // subtotal
    expect(w.getByText("₹6,590")).toBeInTheDocument(); // GST (658,950 paise rounded)
    // JSON-LD carries the exact paise-derived price
    expect(container.innerHTML).toContain('"price":"226239.50"');
  });
});
