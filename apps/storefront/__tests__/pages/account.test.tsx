import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import AccountDashboard from "@/app/account/page";
import OrdersPage from "@/app/account/orders/page";
import AccountWishlistPage from "@/app/account/wishlist/page";
import LoyaltyPage from "@/app/account/loyalty/page";
import SchemesPage from "@/app/account/schemes/page";
import ProfilePage from "@/app/account/profile/page";
import AddressesPage from "@/app/account/addresses/page";
import { renderWithStore } from "../../components/__tests__/test-utils";
import { render } from "../../components/__tests__/test-utils";

vi.mock("@/components/VoiceSearch", () => ({
  default: () => null,
}));

// Account pages load their data through apiFetch (real REST calls). Mock it
// with route-based payloads shaped like the API responses the pages read.
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: apiFetchMock };
});

const ORDERS = [
  {
    id: "ord-1",
    orderNumber: "CF-2026-0001",
    status: "delivered",
    totalPaise: 12500000,
    itemCount: 2,
    createdAt: "2026-01-15T10:00:00.000Z",
  },
  {
    id: "ord-2",
    orderNumber: "CF-2026-0002",
    status: "shipped",
    totalPaise: 4500000,
    itemCount: 1,
    createdAt: "2026-02-10T10:00:00.000Z",
    estimatedDelivery: "2026-02-20T10:00:00.000Z",
  },
];

const RESPONSES: Record<string, unknown> = {
  "/api/v1/store/account/dashboard": {
    recentOrders: ORDERS,
    loyalty: { currentPoints: 6200, tier: "SILVER", pointsExpiringSoon: 0 },
    activeSchemesCount: 1,
    wishlistCount: 3,
  },
  "/api/v1/store/account/orders": { items: ORDERS, total: 2 },
  "/api/v1/store/wishlist": {
    items: [
      {
        id: "w-1",
        productId: "prod-1",
        product: { id: "prod-1", name: "Celestial Solitaire Ring", pricePaise: 8500000 },
      },
    ],
    total: 1,
  },
  "/api/v1/store/account/loyalty": {
    currentPoints: 6200,
    tier: "Silver",
    nextTier: "Gold",
    pointsToNextTier: 8800,
    lifetimeEarned: 9000,
    lifetimeRedeemed: 2800,
  },
  "/api/v1/store/account/loyalty/history?page=1&limit=20": {
    items: [
      { id: "t-1", transactionType: "EARNED", points: 500, description: "Purchase reward", createdAt: "2026-01-15T10:00:00.000Z" },
    ],
  },
  "/api/v1/store/account/schemes": {
    activeSchemes: [],
    totalInvestedPaise: 0,
  },
  "/api/v1/store/account/profile": {
    firstName: "Priya",
    lastName: "Sharma",
    email: "priya@example.com",
    phone: "9876543210",
  },
  "/api/v1/store/addresses": [
    {
      id: "a-1",
      label: "Home",
      firstName: "Priya",
      lastName: "Sharma",
      phone: "9876543210",
      addressLine1: "12 MG Road",
      city: "Mumbai",
      state: "Maharashtra",
      country: "IN",
      postalCode: "400001",
      isDefault: true,
    },
    {
      id: "a-2",
      label: "Office",
      firstName: "Priya",
      lastName: "Sharma",
      addressLine1: "5 Nariman Point",
      city: "Mumbai",
      state: "Maharashtra",
      country: "IN",
      postalCode: "400021",
      isDefault: false,
    },
  ],
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path in RESPONSES) return RESPONSES[path];
    throw new Error(`Unmocked apiFetch path: ${path}`);
  });
});

describe("AccountDashboard", () => {
  it("renders the dashboard heading after loading", async () => {
    renderWithStore(<AccountDashboard />);
    expect(await screen.findByText("My Dashboard")).toBeInTheDocument();
  });

  it("shows quick stats", async () => {
    renderWithStore(<AccountDashboard />);
    // "Recent Orders" appears both as a stat card and a section heading
    expect((await screen.findAllByText("Recent Orders")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Wishlist Items")).toBeInTheDocument();
    expect(screen.getByText("Loyalty Points")).toBeInTheDocument();
    expect(screen.getByText("Active Schemes")).toBeInTheDocument();
  });

  it("shows loyalty tier banner", async () => {
    renderWithStore(<AccountDashboard />);
    expect(await screen.findByText("Loyalty Tier")).toBeInTheDocument();
    expect(screen.getByText("Silver")).toBeInTheDocument();
  });

  it("shows recent orders section", async () => {
    renderWithStore(<AccountDashboard />);
    expect(await screen.findByText("CF-2026-0001")).toBeInTheDocument();
    expect(screen.getAllByText("Recent Orders").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when there are no orders", async () => {
    apiFetchMock.mockImplementation(async () => ({}));
    renderWithStore(<AccountDashboard />);
    expect(await screen.findByText(/don't have any orders yet/i)).toBeInTheDocument();
  });
});

describe("OrdersPage", () => {
  it("renders My Orders heading", () => {
    render(<OrdersPage />);
    expect(screen.getByText("My Orders")).toBeInTheDocument();
  });

  it("shows order cards", async () => {
    render(<OrdersPage />);
    expect(await screen.findByText("CF-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("CF-2026-0002")).toBeInTheDocument();
  });

  it("shows order status badges", async () => {
    render(<OrdersPage />);
    expect(await screen.findByText("delivered")).toBeInTheDocument();
    expect(screen.getByText("shipped")).toBeInTheDocument();
  });

  it("shows an error state when orders fail to load", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    render(<OrdersPage />);
    expect(await screen.findByText("Couldn't load your orders")).toBeInTheDocument();
  });
});

describe("AccountWishlistPage", () => {
  it("renders My Wishlist heading", async () => {
    renderWithStore(<AccountWishlistPage />);
    expect(await screen.findByText("My Wishlist")).toBeInTheDocument();
  });

  it("shows wishlist items", async () => {
    renderWithStore(<AccountWishlistPage />);
    expect(await screen.findByText("Celestial Solitaire Ring")).toBeInTheDocument();
  });

  it("shows Add to Cart buttons", async () => {
    renderWithStore(<AccountWishlistPage />);
    const buttons = await screen.findAllByText("Add to Cart");
    expect(buttons.length).toBeGreaterThan(0);
  });
});

describe("LoyaltyPage", () => {
  it("renders Loyalty Program heading", () => {
    render(<LoyaltyPage />);
    expect(screen.getByText("Loyalty Program")).toBeInTheDocument();
  });

  it("shows current tier", async () => {
    render(<LoyaltyPage />);
    expect(await screen.findByText("Your Tier")).toBeInTheDocument();
    expect(screen.getByText("Silver")).toBeInTheDocument();
  });

  it("shows progress towards the next tier", async () => {
    render(<LoyaltyPage />);
    expect(await screen.findByText("Progress to Gold")).toBeInTheDocument();
  });

  it("shows points history", async () => {
    render(<LoyaltyPage />);
    expect(await screen.findByText("Points History")).toBeInTheDocument();
    expect(await screen.findByText("Purchase reward")).toBeInTheDocument();
  });
});

describe("SchemesPage", () => {
  it("renders My Schemes heading", () => {
    render(<SchemesPage />);
    expect(screen.getByText("My Schemes")).toBeInTheDocument();
  });

  it("shows how it works section", async () => {
    render(<SchemesPage />);
    expect(await screen.findByText("How Gold Savings Scheme Works")).toBeInTheDocument();
  });
});

describe("ProfilePage", () => {
  it("renders My Profile heading", () => {
    render(<ProfilePage />);
    expect(screen.getByText("My Profile")).toBeInTheDocument();
  });

  it("shows personal information form", async () => {
    render(<ProfilePage />);
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Priya")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sharma")).toBeInTheDocument();
  });

  it("shows change password section", () => {
    render(<ProfilePage />);
    expect(screen.getByText("Change Password")).toBeInTheDocument();
  });
});

describe("AddressesPage", () => {
  it("renders My Addresses heading", async () => {
    render(<AddressesPage />);
    expect(screen.getByText("My Addresses")).toBeInTheDocument();
    // wait for the address list to settle so no state update lands after the test
    await screen.findByText("Add Address");
  });

  it("shows existing addresses", async () => {
    render(<AddressesPage />);
    expect((await screen.findAllByText("Priya Sharma")).length).toBeGreaterThan(0);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("shows Add Address button", async () => {
    render(<AddressesPage />);
    expect(await screen.findByText("Add Address")).toBeInTheDocument();
  });

  it("shows default badge", async () => {
    render(<AddressesPage />);
    expect(await screen.findByText("Default")).toBeInTheDocument();
  });
});
