import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, render, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useEffect } from "react";
import CartPage from "@/app/cart/page";
import StoreProvider from "@/components/StoreProvider";
import { useStore } from "@/lib/store";
import { mapProduct } from "@/lib/catalog";
import { formatRupees } from "@/lib/utils";
import { apiProductB } from "../fixtures/api-catalog";
import { installStoreApi, unitPriceOf, type FakeStoreApi } from "../fixtures/store-api";

vi.mock("@/components/VoiceSearch", () => ({
  default: () => null,
}));

const productB = mapProduct(apiProductB);
let api: FakeStoreApi;

function CartPageWithItems({ quantity = 1 }: { quantity?: number }) {
  const store = useStore();
  useEffect(() => {
    store.addToCart(productB, quantity);
    store.setCartDrawerOpen(false);
  }, []);
  return createElement(CartPage);
}

function renderCartPage(withItems = false, quantity = 1) {
  return render(
    createElement(StoreProvider, null, withItems ? createElement(CartPageWithItems, { quantity }) : createElement(CartPage)),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  api = installStoreApi();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CartPage", () => {
  it("shows a loading state, then the empty cart state when there are no items", async () => {
    renderCartPage(false);
    expect(screen.getByText("Loading your cart...")).toBeInTheDocument();
    expect(await screen.findByText("Your Cart is Empty")).toBeInTheDocument();
    expect(screen.getByText("Start Shopping")).toBeInTheDocument();
  });

  it("shows a retry state when the cart cannot be loaded", async () => {
    api.failures.set("GET /cart", { status: 500, message: "Cart service down" });
    renderCartPage(false);
    expect(await screen.findByText("Cart service down")).toBeInTheDocument();
    api.failures.clear();
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Your Cart is Empty")).toBeInTheDocument();
  });

  it("renders API cart items with real server prices", async () => {
    renderCartPage(true, 2);
    expect(await screen.findByText(/Shopping Cart/)).toBeInTheDocument();
    expect(screen.getByText(apiProductB.name)).toBeInTheDocument();
    // line total + subtotal + total all come from the API (integer paise)
    const lineTotal = formatRupees((unitPriceOf(apiProductB) * 2) / 100);
    await waitFor(() => expect(screen.getAllByText(lineTotal).length).toBeGreaterThanOrEqual(2));
  });

  it("shows coupon input", async () => {
    renderCartPage(true);
    await screen.findByText(apiProductB.name);
    expect(screen.getByPlaceholderText("Enter code")).toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
  });

  it("applies a coupon via the API and shows the real discount", async () => {
    const user = userEvent.setup();
    renderCartPage(true);
    await screen.findByText(apiProductB.name);
    await waitFor(() => expect(api.cart.items).toHaveLength(1));
    await user.type(screen.getByPlaceholderText("Enter code"), "save10");
    await user.click(screen.getByText("Apply"));
    expect(await screen.findByText("Coupon applied.")).toBeInTheDocument();
    expect(api.callsTo("POST /cart/coupon")[0]!.body).toEqual({ couponCode: "SAVE10" });
    const discount = Math.floor(unitPriceOf(apiProductB) / 10);
    expect(await screen.findByText(`-${formatRupees(discount / 100)}`)).toBeInTheDocument();
  });

  it("shows the API error for an invalid coupon", async () => {
    const user = userEvent.setup();
    renderCartPage(true);
    await screen.findByText(apiProductB.name);
    await user.type(screen.getByPlaceholderText("Enter code"), "bogus");
    await user.click(screen.getByText("Apply"));
    expect(await screen.findByText("Invalid coupon code")).toBeInTheDocument();
  });

  it("increments quantity through the API", async () => {
    const user = userEvent.setup();
    renderCartPage(true);
    await screen.findByText(apiProductB.name);
    await waitFor(() => expect(api.cart.items).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "+" }));
    await waitFor(() => expect(api.cart.items[0]!.quantity).toBe(2));
  });

  it("shows order summary and checkout button", async () => {
    renderCartPage(true);
    await screen.findByText(apiProductB.name);
    expect(screen.getByText("Order Summary")).toBeInTheDocument();
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("Proceed to Checkout")).toBeInTheDocument();
  });

  it("removes the item from the server cart", async () => {
    const user = userEvent.setup();
    renderCartPage(true);
    await screen.findByText(apiProductB.name);
    await waitFor(() => expect(api.cart.items).toHaveLength(1));
    await act(async () => {});
    const trash = screen.getAllByRole("button").find((b) => b.querySelector("svg path[d*='14.74 9']"));
    await user.click(trash!);
    expect(await screen.findByText("Your Cart is Empty")).toBeInTheDocument();
    await waitFor(() => expect(api.cart.items).toHaveLength(0));
  });
});
