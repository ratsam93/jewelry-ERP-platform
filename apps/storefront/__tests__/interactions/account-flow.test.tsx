/**
 * Account flow interaction tests.
 * Covers dashboard, orders, wishlist, profile, addresses, loyalty, schemes.
 *
 * The account pages load their data through apiFetch (real REST calls), so
 * apiFetch is mocked here with route-based payloads shaped like the API
 * responses the pages read.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountDashboard from "@/app/account/page";
import OrdersPage from "@/app/account/orders/page";
import OrderDetailPage from "@/app/account/orders/[id]/page";
import LoyaltyPage from "@/app/account/loyalty/page";
import SchemesPage from "@/app/account/schemes/page";
import SchemeDetailPage from "@/app/account/schemes/[id]/page";
import AddressesPage from "@/app/account/addresses/page";
import ProfilePage from "@/app/account/profile/page";
import AccountWishlistPage from "@/app/account/wishlist/page";
import { StoreContext, type StoreState } from "@/lib/store";
import { ApiError } from "@/lib/api";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: apiFetchMock };
});

const mockOrders = [
  { id: "ord-1", orderNumber: "CF-2026-0001", status: "delivered", totalPaise: 12500000, itemCount: 2, createdAt: "2026-01-15T10:00:00.000Z" },
  { id: "ord-2", orderNumber: "CF-2026-0002", status: "shipped", totalPaise: 4500000, itemCount: 1, createdAt: "2026-02-10T10:00:00.000Z" },
];

const mockOrderDetail = {
  id: "ord-1",
  orderNumber: "CF-2026-0001",
  status: "delivered",
  subtotalPaise: 12000000,
  shippingPaise: 0,
  taxPaise: 500000,
  discountPaise: 0,
  totalPaise: 12500000,
  items: [
    { id: "oi-1", title: "Celestial Solitaire Ring", quantity: 1, unitPricePaise: 12000000, totalPaise: 12000000 },
  ],
};

const mockLoyalty = {
  currentPoints: 6200,
  tier: "Silver",
  nextTier: "Gold",
  pointsToNextTier: 8800,
  lifetimeEarned: 9000,
  lifetimeRedeemed: 2800,
  pointsExpiringSoon: 0,
};

const mockLoyaltyHistory = [
  { id: "t-1", transactionType: "EARNED", points: 500, description: "Purchase reward", createdAt: "2026-01-15T10:00:00.000Z" },
  { id: "t-2", transactionType: "REDEEMED", points: -200, description: "Redeemed at checkout", createdAt: "2026-02-01T10:00:00.000Z" },
];

const mockScheme = {
  id: "sch-1",
  memberNumber: "GS-0001",
  schemeType: "GOLD_SAVINGS",
  schemeName: "Gold Savings Plan",
  status: "ACTIVE",
  totalPaidPaise: 300000,
  monthlyAmountPaise: 100000,
  durationMonths: 11,
  paidInstallments: 3,
  totalInstallments: 11,
  nextDueDate: "2026-05-01T00:00:00.000Z",
};

const mockSchemeDetail = {
  ...mockScheme,
  joinedDate: "2026-01-01T00:00:00.000Z",
  maturityValuePaise: 1200000,
  installments: [
    { id: "i-1", installmentNumber: 1, dueDate: "2026-02-01T00:00:00.000Z", amountPaise: 100000, status: "PAID" },
    { id: "i-2", installmentNumber: 2, dueDate: "2026-03-01T00:00:00.000Z", amountPaise: 100000, status: "PENDING" },
  ],
};

const mockAddresses = [
  { id: "a-1", label: "Home", firstName: "Priya", lastName: "Sharma", fullName: "Priya Sharma", phone: "9876543210", addressLine1: "12 MG Road", city: "Mumbai", state: "Maharashtra", country: "IN", postalCode: "400001", isDefault: true },
  { id: "a-2", label: "Office", firstName: "Priya", lastName: "Sharma", fullName: "Priya Sharma", addressLine1: "5 Nariman Point", city: "Mumbai", state: "Maharashtra", country: "IN", postalCode: "400021", isDefault: false },
];

const mockWishlistItems = [
  { id: "w-1", productId: "prod-1", product: { id: "prod-1", name: "Celestial Solitaire Ring", pricePaise: 8500000 } },
  { id: "w-2", productId: "prod-2", product: { id: "prod-2", name: "Lotus Pendant", pricePaise: 3500000 } },
];

const RESPONSES: Record<string, unknown> = {
  "/api/v1/store/account/dashboard": {
    recentOrders: mockOrders,
    loyalty: { currentPoints: mockLoyalty.currentPoints, tier: "SILVER", pointsExpiringSoon: 0 },
    activeSchemesCount: 1,
    wishlistCount: 2,
    upcomingInstallments: [{ schemeName: "Gold Savings Plan", dueDate: "2026-05-01T00:00:00.000Z", amountPaise: 100000 }],
  },
  "/api/v1/store/account/orders": { items: mockOrders, total: mockOrders.length },
  "/api/v1/store/account/orders/ord-1": mockOrderDetail,
  "/api/v1/store/wishlist": { items: mockWishlistItems, total: mockWishlistItems.length },
  "/api/v1/store/account/profile": { firstName: "Priya", lastName: "Sharma", email: "priya@example.com", phone: "9876543210" },
  "/api/v1/store/addresses": mockAddresses,
  "/api/v1/store/account/loyalty": mockLoyalty,
  "/api/v1/store/account/loyalty/history?page=1&limit=20": { items: mockLoyaltyHistory },
  "/api/v1/store/account/schemes": { activeSchemes: [mockScheme], totalInvestedPaise: 300000 },
  "/api/v1/store/account/schemes/sch-1": mockSchemeDetail,
};

const mockParams: Record<string, string> = {};

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
    usePathname: () => "/account",
    useParams: () => mockParams,
    useSearchParams: () => new URLSearchParams(),
  };
});

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path in RESPONSES) return RESPONSES[path];
    throw new ApiError(404, "Not found");
  });
});

function mockStore(overrides?: Partial<StoreState>): StoreState {
  return {
    cartItems: [],
    cartCount: 0,
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
}

function renderWithMockStore(ui: React.ReactElement, overrides?: Partial<StoreState>) {
  return render(
    <StoreContext.Provider value={mockStore(overrides)}>
      {ui}
    </StoreContext.Provider>,
  );
}

describe("Account Flow - Dashboard", () => {
  it("renders dashboard heading and quick stats", async () => {
    render(<AccountDashboard />);
    expect(await screen.findByText("My Dashboard")).toBeInTheDocument();
    const allText = document.body.textContent ?? "";
    expect(allText).toContain("Recent Orders");
    expect(allText).toContain("Wishlist Items");
    expect(allText).toContain("Loyalty Points");
    expect(allText).toContain("Active Schemes");
  });

  it("shows recent orders with order numbers", async () => {
    render(<AccountDashboard />);
    expect(await screen.findByText(mockOrders[0]!.orderNumber)).toBeInTheDocument();
    expect(screen.getByText(mockOrders[1]!.orderNumber)).toBeInTheDocument();
  });

  it("shows loyalty tier and points", async () => {
    render(<AccountDashboard />);
    // Points appear in both the stats card and the loyalty banner
    const pointsElements = await screen.findAllByText(mockLoyalty.currentPoints.toLocaleString());
    expect(pointsElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Silver")).toBeInTheDocument();
  });

  it("shows upcoming scheme installments", async () => {
    // The dashboard no longer lists active schemes with progress; it shows a
    // count stat plus upcoming installments per scheme.
    render(<AccountDashboard />);
    expect(await screen.findByText("Upcoming Installments")).toBeInTheDocument();
    expect(screen.getByText("Gold Savings Plan")).toBeInTheDocument();
  });
});

describe("Account Flow - Orders", () => {
  it("renders orders list with order numbers", async () => {
    render(<OrdersPage />);
    expect(screen.getByText("My Orders")).toBeInTheDocument();
    for (const order of mockOrders) {
      expect(await screen.findByText(order.orderNumber)).toBeInTheDocument();
    }
  });

  it("shows order status badges", async () => {
    render(<OrdersPage />);
    expect(await screen.findByText("delivered")).toBeInTheDocument();
    expect(screen.getByText("shipped")).toBeInTheDocument();
  });
});

describe("Account Flow - Order Detail", () => {
  beforeEach(() => {
    Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  });

  it("shows order header and status for a delivered order", async () => {
    mockParams.id = "ord-1";
    render(<OrderDetailPage />);
    expect(await screen.findByText(`Order ${mockOrderDetail.orderNumber}`)).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("delivered")).toBeInTheDocument();
    expect(screen.getByText("Celestial Solitaire Ring")).toBeInTheDocument();
  });

  it("shows Request Return button for delivered orders", async () => {
    mockParams.id = "ord-1";
    render(<OrderDetailPage />);
    expect(await screen.findByRole("button", { name: /request return/i })).toBeInTheDocument();
  });

  it("shows Download Invoice button", async () => {
    mockParams.id = "ord-1";
    render(<OrderDetailPage />);
    expect(await screen.findByRole("button", { name: /download invoice/i })).toBeInTheDocument();
  });

  it("shows order not found for invalid order ID", async () => {
    mockParams.id = "nonexistent-order";
    render(<OrderDetailPage />);
    expect(await screen.findByText("Order Not Found")).toBeInTheDocument();
  });
});

describe("Account Flow - Wishlist", () => {
  it("renders wishlist items with Add to Cart buttons", async () => {
    renderWithMockStore(<AccountWishlistPage />);
    expect(await screen.findByText("My Wishlist")).toBeInTheDocument();
    for (const item of mockWishlistItems) {
      expect(await screen.findByText(item.product.name)).toBeInTheDocument();
    }
    const addButtons = screen.getAllByRole("button", { name: /add to cart/i });
    expect(addButtons.length).toBe(mockWishlistItems.length);
  });

  it("clicking Add to Cart from wishlist calls addToCart", async () => {
    const addToCartFn = vi.fn();
    const user = userEvent.setup();
    renderWithMockStore(<AccountWishlistPage />, { addToCart: addToCartFn });
    const addButtons = await screen.findAllByRole("button", { name: /add to cart/i });
    await user.click(addButtons[0]!);
    expect(addToCartFn).toHaveBeenCalledWith(mockWishlistItems[0]!.product);
  });
});

describe("Account Flow - Profile", () => {
  it("renders profile form with pre-filled name, email, phone", async () => {
    render(<ProfilePage />);
    expect(screen.getByText("My Profile")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Priya")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sharma")).toBeInTheDocument();
    expect(screen.getByDisplayValue("priya@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9876543210")).toBeInTheDocument();
  });

  it("can edit name field and save", async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);
    const nameInput = await screen.findByDisplayValue("Priya");
    await user.clear(nameInput);
    await user.type(nameInput, "Priyanka");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Profile updated successfully.")).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/store/account/profile",
      expect.objectContaining({ method: "PUT", body: expect.objectContaining({ firstName: "Priyanka" }) }),
    );
  });

  it("renders change password form", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Change Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update password/i })).toBeInTheDocument();
  });
});

describe("Account Flow - Addresses", () => {
  it("renders address list with default badge", async () => {
    render(<AddressesPage />);
    expect(await screen.findByText("Default")).toBeInTheDocument();
    expect(screen.getByText("My Addresses")).toBeInTheDocument();
    const nameElements = screen.getAllByText(mockAddresses[0]!.fullName);
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
  });

  it("Add Address button opens address form", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);
    await user.click(await screen.findByRole("button", { name: /add address/i }));
    expect(screen.getByText("New Address")).toBeInTheDocument();
  });

  it("Edit and Delete actions are shown for each saved address", async () => {
    // The page no longer has a per-card "Set as Default" button; default is
    // chosen via a checkbox in the form. Check the per-address actions instead.
    render(<AddressesPage />);
    expect(await screen.findAllByRole("button", { name: /^edit$/i })).toHaveLength(mockAddresses.length);
    expect(screen.getAllByRole("button", { name: /^delete$/i })).toHaveLength(mockAddresses.length);
  });

  it("address form offers a Set as default address option", async () => {
    const user = userEvent.setup();
    render(<AddressesPage />);
    await user.click(await screen.findByRole("button", { name: /add address/i }));
    expect(screen.getByLabelText(/set as default address/i)).toBeInTheDocument();
  });
});

describe("Account Flow - Loyalty", () => {
  it("renders loyalty points balance and tier", async () => {
    render(<LoyaltyPage />);
    expect(screen.getByText("Loyalty Program")).toBeInTheDocument();
    const pointsElements = await screen.findAllByText(mockLoyalty.currentPoints.toLocaleString());
    expect(pointsElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Silver")).toBeInTheDocument();
  });

  it("shows tier progress bar with next-tier info", async () => {
    render(<LoyaltyPage />);
    expect(await screen.findByText(`Progress to ${mockLoyalty.nextTier}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${mockLoyalty.pointsToNextTier.toLocaleString()} more points needed`))).toBeInTheDocument();
  });

  it("shows points history with earned and redeemed entries", async () => {
    render(<LoyaltyPage />);
    expect(await screen.findByText("Points History")).toBeInTheDocument();
    for (const tx of mockLoyaltyHistory) {
      expect(await screen.findByText(tx.description)).toBeInTheDocument();
    }
  });
});

describe("Account Flow - Schemes", () => {
  it("renders schemes page with scheme cards", async () => {
    render(<SchemesPage />);
    expect(screen.getByText("My Schemes")).toBeInTheDocument();
    expect(await screen.findByText(mockScheme.schemeName)).toBeInTheDocument();
    expect(screen.getByText(/3\/11 months completed/)).toBeInTheDocument();
  });

  it("shows how gold savings scheme works section", async () => {
    render(<SchemesPage />);
    expect(await screen.findByText("How Gold Savings Scheme Works")).toBeInTheDocument();
    expect(screen.getByText("1. Choose Your Plan")).toBeInTheDocument();
  });

  it("scheme detail shows installment tracker", async () => {
    mockParams.id = mockScheme.id;
    render(<SchemeDetailPage />);
    expect(await screen.findByText(mockScheme.schemeName)).toBeInTheDocument();
    expect(screen.getByText("Installment Tracker")).toBeInTheDocument();
  });

  it("scheme detail shows maturity value and Pay Now for pending installments", async () => {
    // The old "bonus: 1 month free" text no longer exists on the detail page;
    // maturity value (which includes the bonus) is the closest equivalent.
    mockParams.id = mockScheme.id;
    render(<SchemeDetailPage />);
    expect(await screen.findByText("Maturity Value")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay now/i })).toBeInTheDocument();
  });
});
