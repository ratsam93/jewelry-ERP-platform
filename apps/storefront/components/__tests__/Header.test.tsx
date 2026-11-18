import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "@/components/Header";
import { resetNavCategoryCache } from "@/components/MegaMenu";
import { renderWithStore } from "./test-utils";
import { installCatalogFetch } from "../../__tests__/fixtures/api-catalog";

describe("Header", () => {
  beforeEach(() => {
    resetNavCategoryCache();
    installCatalogFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the logo text", () => {
    renderWithStore(<Header />);
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.getByText("Beyond")).toBeInTheDocument();
  });

  it("renders search bar (desktop)", () => {
    renderWithStore(<Header />);
    expect(screen.getByPlaceholderText(/Search for jewelry/)).toBeInTheDocument();
  });

  it("renders cart button", () => {
    renderWithStore(<Header />);
    expect(screen.getByLabelText("Cart")).toBeInTheDocument();
  });

  it("renders wishlist link", () => {
    renderWithStore(<Header />);
    expect(screen.getByLabelText("Wishlist")).toBeInTheDocument();
  });

  it("renders mobile hamburger menu button", () => {
    renderWithStore(<Header />);
    expect(screen.getByLabelText("Toggle menu")).toBeInTheDocument();
  });

  it("opens mobile menu on hamburger click", async () => {
    const user = userEvent.setup();
    renderWithStore(<Header />);
    const burger = screen.getByLabelText("Toggle menu");
    await user.click(burger);
    expect(screen.getByText("My Account")).toBeInTheDocument();
    expect(screen.getByText("Login / Register")).toBeInTheDocument();
  });

  it("shows API category links in mobile menu", async () => {
    const user = userEvent.setup();
    renderWithStore(<Header />);
    await user.click(screen.getByLabelText("Toggle menu"));
    expect(await screen.findByRole("link", { name: "Gold" })).toHaveAttribute("href", "/category/gold");
    expect(screen.getByRole("link", { name: "Silver" })).toHaveAttribute("href", "/category/silver");
    expect(screen.queryByRole("link", { name: "Rings" })).toBeNull();
  });

  it("renders account link", () => {
    renderWithStore(<Header />);
    const accountLink = screen.getByText("Account");
    expect(accountLink).toBeInTheDocument();
  });
});
