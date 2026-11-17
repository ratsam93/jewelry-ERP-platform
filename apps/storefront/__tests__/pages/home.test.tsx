import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import HomePage from "@/app/page";
import { renderWithStore } from "../../components/__tests__/test-utils";
import { installCatalogFetch, serverErrorRes, apiProductA, apiProductB, apiProductC } from "../fixtures/api-catalog";

async function renderHome() {
  return renderWithStore(await HomePage());
}

beforeEach(() => {
  installCatalogFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Mock SearchBar to avoid VoiceSearch complexity (kept for backwards compat)
vi.mock("@/components/VoiceSearch", () => ({
  default: () => null,
}));

describe("HomePage", () => {
  it("renders hero banner with primary CTA", async () => {
    await renderHome();
    expect(
      screen.getByText((t) => t.includes("Crafted for")),
    ).toBeInTheDocument();
    expect(screen.getByText("Shop Collection")).toBeInTheDocument();
    expect(screen.getByText("Book Consultation")).toBeInTheDocument();
  });

  it("renders featured collections strip", async () => {
    await renderHome();
    expect(screen.getByText("Featured Collections")).toBeInTheDocument();
    expect(screen.getByText("Bridal Heirloom")).toBeInTheDocument();
    expect(screen.getByText("Everyday Luxe")).toBeInTheDocument();
    expect(screen.getByText("Festive Edit")).toBeInTheDocument();
  });

  it("renders category tiles from the API categories", async () => {
    await renderHome();
    expect(screen.getByText("Shop by Category")).toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/category/gold");
    expect(hrefs).toContain("/category/silver");
  });

  it("renders featured pieces (falling back to new arrivals) linking to real product ids", async () => {
    await renderHome();
    expect(screen.getByText("Featured Pieces")).toBeInTheDocument();
    expect(screen.getByText(apiProductB.name)).toBeInTheDocument();
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `/product/${apiProductA.id}`);
    expect(link).toBeTruthy();
    // price comes from the API: 5,337,357 paise
    expect(screen.getByText("₹53,374")).toBeInTheDocument();
  });

  it("does not render time-dependent text during render (hydration safety)", async () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleTimeString");
    await renderHome();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shows graceful fallbacks and still renders the page when the API fails", async () => {
    installCatalogFetch(() => serverErrorRes());
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderHome();
    expect(screen.getByText("Crafted for", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/couldn't load our collection/i)).toBeInTheDocument();
    expect(screen.getByText(/Categories are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText("Live Rates")).not.toBeInTheDocument();
  });

  it("renders live metal rates from the API with a deterministic IST timestamp", async () => {
    await renderHome();
    expect(screen.getByText("Live Rates")).toBeInTheDocument();
    expect(screen.getByText("22K Gold")).toBeInTheDocument();
    expect(screen.getByText("18K Gold")).toBeInTheDocument();
    expect(screen.getByText("₹6,673/g")).toBeInTheDocument();
    expect(screen.getByText("Updated 12:00 IST")).toBeInTheDocument();
  });

  it("renders trust signals", async () => {
    await renderHome();
    expect(screen.getByText("BIS Hallmarked")).toBeInTheDocument();
    expect(screen.getByText("Certified Diamonds")).toBeInTheDocument();
    expect(screen.getByText("Lifetime Exchange")).toBeInTheDocument();
    expect(screen.getByText("365-Day Returns")).toBeInTheDocument();
  });

  it("renders testimonials section", async () => {
    await renderHome();
    expect(screen.getByText("What Our Clients Say")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
  });

  it("renders newsletter signup form", async () => {
    await renderHome();
    expect(screen.getByText("Join the CaratFlow Circle")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
  });
});
