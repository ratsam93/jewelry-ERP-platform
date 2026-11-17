import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useEffect } from "react";
import CheckoutPage from "@/app/checkout/page";
import StoreProvider from "@/components/StoreProvider";
import { useStore } from "@/lib/store";
import { mapProduct } from "@/lib/catalog";
import { formatRupees } from "@/lib/utils";
import { apiProductB } from "../fixtures/api-catalog";
import { installStoreApi, unitPriceOf, type FakeStoreApi } from "../fixtures/store-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/checkout",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/VoiceSearch", () => ({ default: () => null }));

const productB = mapProduct(apiProductB);
let api: FakeStoreApi;

const ADDRESS = {
  id: "11111111-1111-4111-8111-111111111111",
  customerId: "c0000000-0000-4000-8000-000000000001",
  label: "Home",
  firstName: "Priya",
  lastName: "Sharma",
  phone: "9876543210",
  addressLine1: "12 MG Road",
  addressLine2: null,
  city: "Mumbai",
  state: "Maharashtra",
  country: "IN",
  postalCode: "400001",
  isDefault: true,
};

function CheckoutWithItems() {
  const store = useStore();
  useEffect(() => {
    store.addToCart(productB, 1);
    store.setCartDrawerOpen(false);
  }, []);
  return createElement(CheckoutPage);
}

function renderCheckout(withItems = true) {
  return render(
    createElement(StoreProvider, null, withItems ? createElement(CheckoutWithItems) : createElement(CheckoutPage)),
  );
}

async function toPayment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /continue to review/i }));
  await user.click(screen.getByRole("button", { name: /continue to payment/i }));
}

function payButton() {
  return screen.getAllByRole("button").find((b) => b.textContent?.startsWith("Pay "))!;
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheckoutPage (signed out)", () => {
  beforeEach(() => {
    api = installStoreApi();
  });

  it("shows empty state when no items in cart", async () => {
    renderCheckout(false);
    expect(await screen.findByText("Nothing to Checkout")).toBeInTheDocument();
  });

  it("asks a guest with items to sign in and never calls authenticated routes", async () => {
    renderCheckout(true);
    expect(await screen.findByText("Sign in to Checkout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", "/auth/login");
    expect(api.calls.some((c) => c.path === "/addresses" || c.path === "/checkout")).toBe(false);
  });
});

describe("CheckoutPage (signed in)", () => {
  beforeEach(() => {
    api = installStoreApi({ signedIn: true });
    api.addresses.push(ADDRESS);
    window.localStorage.setItem("accessToken", "tok");
  });

  it("loads real addresses and shows the shipping step first", async () => {
    renderCheckout();
    expect(await screen.findByText("Shipping Address")).toBeInTheDocument();
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText(/400001/)).toBeInTheDocument();
    expect(screen.getByRole("radio")).toBeChecked();
  });

  it("shows step indicators and an order summary from the real cart", async () => {
    renderCheckout();
    await screen.findByText("Priya Sharma");
    expect(screen.getAllByText("Shipping").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("Order Summary")).toBeInTheDocument();
    const total = formatRupees(unitPriceOf(apiProductB) / 100);
    await waitFor(() => expect(screen.getAllByText(total).length).toBeGreaterThanOrEqual(1));
  });

  it("shows an error when addresses cannot be loaded", async () => {
    api.failures.set("GET /addresses", { status: 500, message: "Address service down" });
    renderCheckout();
    expect(await screen.findByText("Address service down")).toBeInTheDocument();
  });

  it("creates a new address through POST /addresses and selects it", async () => {
    api.addresses.length = 0;
    const user = userEvent.setup();
    renderCheckout();
    // no saved addresses -> the form opens directly
    const saveBtn = await screen.findByRole("button", { name: /save address/i });
    const form = saveBtn.closest("form")!;
    const inputs = Array.from(form.querySelectorAll("input[type='text'], input[type='tel']")) as HTMLInputElement[];
    const [label, fullName, phone, line1, , city, pin] = inputs;
    await user.type(label!, "Office");
    await user.type(fullName!, "Asha Rao");
    await user.type(phone!, "9000000000");
    await user.type(line1!, "5 Park Street");
    await user.type(city!, "Pune");
    await user.type(pin!, "411001");
    await user.selectOptions(form.querySelector("select")!, "Maharashtra");
    await user.click(saveBtn);
    await waitFor(() => expect(api.callsTo("POST /addresses")).toHaveLength(1));
    expect(api.callsTo("POST /addresses")[0]!.body).toMatchObject({
      firstName: "Asha",
      lastName: "Rao",
      postalCode: "411001",
      country: "IN",
      city: "Pune",
      state: "Maharashtra",
    });
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByRole("radio")).toBeChecked();
  });

  it("cash on delivery: initiates checkout then completes it and goes to the order page", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByText("Priya Sharma");
    await waitFor(() => expect(api.cart.items).toHaveLength(1));
    await toPayment(user);
    await user.click(screen.getByText(/cash on delivery/i));
    await user.click(payButton());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const init = api.callsTo("POST /checkout")[0]!;
    expect(init.body).toMatchObject({ cartId: api.cart.id, addressId: ADDRESS.id, paymentMethod: "cod" });
    expect(init.headers.Authorization).toBe("Bearer tok");
    const orderId = api.orders[0]!.id;
    expect(api.callsTo(`POST /checkout/${orderId}/complete`)).toHaveLength(1);
    expect(push).toHaveBeenCalledWith(`/account/orders/${orderId}`);
    expect(api.orders[0]!.status).toBe("CONFIRMED");
  });

  it("online payment without gateway keys: clear message, order cancelled, never completed", async () => {
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByText("Priya Sharma");
    await waitFor(() => expect(api.cart.items).toHaveLength(1));
    await toPayment(user);
    await user.click(payButton());
    expect(await screen.findByText(/Online payment is not available/)).toBeInTheDocument();
    const orderId = api.orders[0]!.id;
    expect(api.callsTo(`POST /checkout/${orderId}/complete`)).toHaveLength(0);
    expect(api.callsTo(`POST /orders/${orderId}/cancel`)).toHaveLength(1);
    expect(api.orders[0]!.status).toBe("CANCELLED");
    expect(push).not.toHaveBeenCalled();
    // the cart is untouched and the pay button is usable again
    expect(api.cart.items).toHaveLength(1);
    expect(payButton()).not.toBeDisabled();
  });

  it("shows the API error (e.g. out of stock) when initiating checkout fails", async () => {
    api.failures.set("POST /checkout", { status: 400, message: "Insufficient stock for item" });
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByText("Priya Sharma");
    await waitFor(() => expect(api.cart.items).toHaveLength(1));
    await toPayment(user);
    await user.click(screen.getByText(/cash on delivery/i));
    await user.click(payButton());
    expect(await screen.findByText("Insufficient stock for item")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
