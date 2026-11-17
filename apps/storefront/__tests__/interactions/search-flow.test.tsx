/**
 * Search flow interaction tests.
 * Covers search results (API-backed), no-results, error/retry, sort and filters.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithStore, userEvent } from "./test-utils";
import SearchPage from "@/app/search/page";
import {
  installCatalogFetch,
  apiProductA,
  apiProductB,
  ok,
  page,
  serverErrorRes,
} from "../fixtures/api-catalog";

let searchParamsValue = new URLSearchParams();

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
    usePathname: () => "/search",
    useParams: () => ({}),
    useSearchParams: () => searchParamsValue,
  };
});

describe("Search Flow", () => {
  beforeEach(() => {
    installCatalogFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows search page heading and prompt with no query (no API call)", async () => {
    searchParamsValue = new URLSearchParams();
    const f = installCatalogFetch();
    renderWithStore(<SearchPage />);
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(await screen.findByText(/Type a search term/i)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("displays results from the API with a count", async () => {
    searchParamsValue = new URLSearchParams("q=gold");
    const f = installCatalogFetch(() => ok(page([apiProductA, apiProductB])));
    renderWithStore(<SearchPage />);
    expect(screen.getByText(`Results for "gold"`)).toBeInTheDocument();
    expect(await screen.findByText("2 products found")).toBeInTheDocument();
    expect(screen.getByText(apiProductB.name)).toBeInTheDocument();
    const url = String(f.mock.calls[0]![0]);
    expect(url).toContain("/products/search?q=gold");
  });

  it("shows a loading state while searching", async () => {
    searchParamsValue = new URLSearchParams("q=gold");
    renderWithStore(<SearchPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/Searching/);
    await screen.findByText(/products? found/);
  });

  it("shows no results state for non-matching query", async () => {
    searchParamsValue = new URLSearchParams("q=xyznonexistent");
    renderWithStore(<SearchPage />);
    expect(await screen.findByText("No results found")).toBeInTheDocument();
  });

  it("no results state shows suggestion links", async () => {
    searchParamsValue = new URLSearchParams("q=xyznonexistent");
    renderWithStore(<SearchPage />);
    expect(await screen.findByRole("link", { name: "Rings" })).toHaveAttribute("href", "/search?q=Rings");
    expect(screen.getByRole("link", { name: "Necklaces" })).toHaveAttribute("href", "/search?q=Necklaces");
    expect(screen.getByRole("link", { name: "Diamonds" })).toHaveAttribute("href", "/search?q=Diamonds");
  });

  it("shows an error state with retry when the API fails, and recovers", async () => {
    searchParamsValue = new URLSearchParams("q=ring");
    installCatalogFetch(() => serverErrorRes());
    const user = userEvent.setup();
    renderWithStore(<SearchPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    installCatalogFetch(() => ok(page([apiProductA])));
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(apiProductA.name)).toBeInTheDocument();
  });

  it("search results page has a sort dropdown that updates", async () => {
    searchParamsValue = new URLSearchParams("q=ring");
    const user = userEvent.setup();
    renderWithStore(<SearchPage />);
    const sortSelect = await screen.findByRole("combobox");
    await user.selectOptions(sortSelect, "price_desc");
    expect(sortSelect).toHaveValue("price_desc");
  });

  it("breadcrumbs show Home > Search Results", async () => {
    searchParamsValue = new URLSearchParams("q=gold");
    renderWithStore(<SearchPage />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Search Results")).toBeInTheDocument();
    await screen.findByText(/products? found/);
  });

  it("search results link to real product ids", async () => {
    searchParamsValue = new URLSearchParams("q=bracelet");
    renderWithStore(<SearchPage />);
    await screen.findByText(apiProductB.name);
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === `/product/${apiProductB.id}`),
    ).toBe(true);
  });
});
