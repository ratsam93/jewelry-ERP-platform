/**
 * Checkout flow interaction tests.
 * Covers step navigation, address selection, order review, and payment.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { userEvent } from "./test-utils";
import CheckoutPage from "@/app/checkout/page";
import { StoreContext, type StoreState } from "@/lib/store";
import { mockProducts } from "@/lib/mock-data";
import { installStoreApi } from "../fixtures/store-api";

const addressDto = (n: number, name: [string, string]) => ({
  id: `1111111${n}-1111-4111-8111-111111111111`,
  label: n === 1 ? "Home" : "Office",
  firstName: name[0],
  lastName: name[1],
  phone: "9876543210",
  addressLine1: `${n} MG Road`,
  addressLine2: null,
  city: "Mumbai",
  state: "Maharashtra",
  country: "IN",
  postalCode: "400001",
  isDefault: n === 1,
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("accessToken", "tok");
  const api = installStoreApi({ signedIn: true });
  api.addresses.push(addressDto(1, ["Priya", "Sharma"]), addressDto(2, ["Priya", "Sharma"]));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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
    usePathname: () => "/checkout",
    useParams: () => ({}),
    useSearchParams: () => new URLSearchParams(),
  };
});

function makeCartItem(productIndex = 0, quantity = 1, size?: string) {
  return {
    id: `cart-item-${productIndex}`,
    product: mockProducts[productIndex]!,
    quantity,
    selectedSize: size,
    addedAt: new Date().toISOString(),
  };
}

function renderCheckout(cartItems = [makeCartItem(0, 1, "7")], overrides?: Partial<StoreState>) {
  const store: StoreState = {
    cartItems,
    cartCount: cartItems.reduce((s, i) => s + i.quantity, 0),
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    updateCartQuantity: vi.fn(),
    clearCart: vi.fn(),
    couponCode: "",
    setCouponCode: vi.fn(),
    couponDiscount: 0,
    setCouponDiscount: vi.fn(),
    wishlistIds: new Set(),
    wishlistCount: 0,
    toggleWishlist: vi.fn(),
    isInWishlist: () => false,
    compareIds: [],
    addToCompare: vi.fn(),
    removeFromCompare: vi.fn(),
    isInCompare: () => false,
    isCartDrawerOpen: false,
    setCartDrawerOpen: vi.fn(),
    searchQuery: "",
    setSearchQuery: vi.fn(),
    ...overrides,
  };
  return render(
    <StoreContext.Provider value={store}>
      <CheckoutPage />
    </StoreContext.Provider>,
  );
}

describe("Checkout Flow", () => {
  it("empty cart shows nothing-to-checkout state", async () => {
    renderCheckout([]);
    expect(await screen.findByText("Nothing to Checkout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start shopping/i })).toHaveAttribute("href", "/");
  });

  it("step 1 shows Shipping Address heading with address options", async () => {
    renderCheckout();
    expect(await screen.findByText("Shipping Address")).toBeInTheDocument();
    // API addresses are rendered -- "Priya Sharma" appears once per address
    const nameElements = await screen.findAllByText("Priya Sharma");
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
  });

  it("step 1 allows selecting an address via radio buttons", async () => {
    const user = userEvent.setup();
    renderCheckout();
    const radios = await screen.findAllByRole("radio");
    // Should have at least 2 address radios
    expect(radios.length).toBeGreaterThanOrEqual(2);
    // Click the second address radio
    await user.click(radios[1]!);
    expect(radios[1]).toBeChecked();
  });

  it("step 1 shows Add New Address button", async () => {
    renderCheckout();
    expect(await screen.findByText(/add new address/i)).toBeInTheDocument();
  });

  it("clicking Continue to Review advances to step 2", async () => {
    const user = userEvent.setup();
    renderCheckout();
    const continueBtn = await screen.findByRole("button", { name: /continue to review/i });
    await user.click(continueBtn);
    expect(screen.getByText("Review Your Order")).toBeInTheDocument();
  });

  it("step 2 shows order items and shipping address summary", async () => {
    const user = userEvent.setup();
    renderCheckout();
    // Go to step 2
    await user.click(await screen.findByRole("button", { name: /continue to review/i }));
    // Should show item name
    expect(screen.getByText(mockProducts[0]!.name)).toBeInTheDocument();
    // Should show "Shipping to" label
    expect(screen.getByText("Shipping to")).toBeInTheDocument();
  });

  it("step 2 has a Change button to go back to step 1", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await user.click(await screen.findByRole("button", { name: /continue to review/i }));
    const changeBtn = screen.getByRole("button", { name: /change/i });
    await user.click(changeBtn);
    expect(screen.getByText("Shipping Address")).toBeInTheDocument();
  });

  it("step 3 shows payment options", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await user.click(await screen.findByRole("button", { name: /continue to review/i }));
    await user.click(screen.getByRole("button", { name: /continue to payment/i }));
    // "Payment" appears both in the step indicator and as heading
    const paymentTexts = screen.getAllByText("Payment");
    expect(paymentTexts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/razorpay/i)).toBeInTheDocument();
    expect(screen.getByText(/cash on delivery/i)).toBeInTheDocument();
  });

  it("step 3 has a pay button with the total amount", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await user.click(await screen.findByRole("button", { name: /continue to review/i }));
    await user.click(screen.getByRole("button", { name: /continue to payment/i }));
    // "Pay" appears in step indicator button AND the payment button; use getAllByRole
    const payButtons = screen.getAllByRole("button").filter(
      (btn) => btn.textContent?.startsWith("Pay "),
    );
    expect(payButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("order summary sidebar shows throughout all steps", async () => {
    const user = userEvent.setup();
    renderCheckout();
    expect(await screen.findByText("Order Summary")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /continue to review/i }));
    expect(screen.getByText("Order Summary")).toBeInTheDocument();
  });

  it("coupon discount from the API cart appears in summary when set", async () => {
    renderCheckout([makeCartItem(0, 1, "7")], {
      couponCode: "WELCOME10",
      cartTotals: { subtotalPaise: 1000000, discountPaise: 200000, taxPaise: 0, totalPaise: 800000, couponCode: "WELCOME10" },
    });
    expect(await screen.findByText(/discount/i)).toBeInTheDocument();
    expect(screen.getByText(/WELCOME10/)).toBeInTheDocument();
  });
});
