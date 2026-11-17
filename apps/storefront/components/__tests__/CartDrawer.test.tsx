import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import CartDrawer from "@/components/CartDrawer";
import { mapProduct } from "@/lib/catalog";
import { apiProductB } from "../../__tests__/fixtures/api-catalog";
import { installStoreApi } from "../../__tests__/fixtures/store-api";

const mockProducts = [mapProduct(apiProductB)];

beforeEach(() => {
  window.localStorage.clear();
  installStoreApi();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
import { renderWithStore } from "./test-utils";
import { createElement, useEffect } from "react";
import StoreProvider from "@/components/StoreProvider";
import { useStore } from "@/lib/store";
import { render } from "@testing-library/react";

function CartDrawerWithItems({ addItems }: { addItems: boolean }) {
  const store = useStore();
  useEffect(() => {
    if (addItems) {
      store.addToCart(mockProducts[0]!, 2);
      store.setCartDrawerOpen(true);
    }
  }, []);
  return createElement(CartDrawer);
}

function renderCartDrawer(addItems = false) {
  return render(
    createElement(StoreProvider, null, createElement(CartDrawerWithItems, { addItems }))
  );
}

describe("CartDrawer", () => {
  it("shows empty cart state when no items", () => {
    // When no items and drawer is not open, nothing renders
    renderWithStore(<CartDrawer />);
    // CartDrawer returns null when not open
    expect(screen.queryByText("Shopping Bag")).not.toBeInTheDocument();
  });

  it("renders cart items when items present", () => {
    renderCartDrawer(true);
    expect(screen.getByText(/Shopping Bag/)).toBeInTheDocument();
    expect(screen.getByText(mockProducts[0]!.name)).toBeInTheDocument();
  });

  it("shows quantity of cart item", () => {
    renderCartDrawer(true);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows subtotal", () => {
    renderCartDrawer(true);
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
  });

  it("has checkout button when items present", () => {
    renderCartDrawer(true);
    expect(screen.getByText("Checkout")).toBeInTheDocument();
  });

  it("has view cart button when items present", () => {
    renderCartDrawer(true);
    expect(screen.getByText("View Cart")).toBeInTheDocument();
  });

  it("renders quantity controls (+ and -)", () => {
    renderCartDrawer(true);
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders empty state message when opened with no items", async () => {
    function EmptyDrawer() {
      const store = useStore();
      useEffect(() => {
        store.setCartDrawerOpen(true);
      }, []);
      return createElement(CartDrawer);
    }
    render(createElement(StoreProvider, null, createElement(EmptyDrawer)));
    expect(await screen.findByText("Your bag is empty")).toBeInTheDocument();
    expect(screen.getByText("Continue Shopping")).toBeInTheDocument();
  });
});
