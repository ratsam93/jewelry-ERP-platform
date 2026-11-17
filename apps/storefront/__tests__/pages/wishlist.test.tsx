import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, render } from "@testing-library/react";
import { createElement } from "react";
import WishlistPage from "@/app/wishlist/page";
import StoreProvider from "@/components/StoreProvider";
import { clearProductLookupCache } from "@/lib/product-lookup";
import { apiProductA, apiProductB } from "../fixtures/api-catalog";
import { installStoreApi, type FakeStoreApi } from "../fixtures/store-api";

vi.mock("@/components/VoiceSearch", () => ({ default: () => null }));

let api: FakeStoreApi;

function renderWishlist() {
  return render(createElement(StoreProvider, null, createElement(WishlistPage)));
}

beforeEach(() => {
  window.localStorage.clear();
  clearProductLookupCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WishlistPage", () => {
  it("shows the empty state", async () => {
    api = installStoreApi();
    renderWishlist();
    expect(await screen.findByText("Your wishlist is empty")).toBeInTheDocument();
    expect(screen.getByText("My Wishlist (0)")).toBeInTheDocument();
  });

  it("signed out: renders the locally saved products from the catalog API and offers sign-in", async () => {
    api = installStoreApi();
    window.localStorage.setItem("cf_wishlist", JSON.stringify([apiProductB.id]));
    renderWishlist();
    expect(await screen.findByText(apiProductB.name)).toBeInTheDocument();
    expect(screen.getByText(/saved on this device only/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login");
    expect(api.calls.some((c) => c.path === "/wishlist")).toBe(false);
  });

  it("signed in: renders the account wishlist from GET /wishlist", async () => {
    api = installStoreApi({ signedIn: true });
    api.wishlist.push(apiProductA.id, apiProductB.id);
    window.localStorage.setItem("accessToken", "tok");
    renderWishlist();
    expect(await screen.findByText(apiProductA.name)).toBeInTheDocument();
    expect(screen.getByText(apiProductB.name)).toBeInTheDocument();
    expect(screen.getByText("My Wishlist (2)")).toBeInTheDocument();
    expect(screen.queryByText(/saved on this device only/i)).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo("GET /wishlist")).toHaveLength(1));
  });

  it("skips ids whose product no longer exists", async () => {
    api = installStoreApi();
    window.localStorage.setItem("cf_wishlist", JSON.stringify(["00000000-0000-4000-8000-00000000dead", apiProductB.id]));
    renderWishlist();
    expect(await screen.findByText(apiProductB.name)).toBeInTheDocument();
  });
});
