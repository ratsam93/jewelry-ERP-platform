import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MegaMenu, { resetNavCategoryCache } from "@/components/MegaMenu";
import { render } from "./test-utils";
import { installCatalogFetch } from "../../__tests__/fixtures/api-catalog";
import { NAV_FALLBACK_CATEGORIES } from "@/lib/constants";

// Top-level slugs the mocked API exposes (Gold, Silver).
const API_SLUGS = ["gold", "silver"];

/** Every href a nav may emit: home, search, all-products, or a slug the API has. */
function isResolvableNavHref(href: string): boolean {
  if (href === "/") return true;
  if (/^\/search(\?|$)/.test(href)) return true;
  if (/^\/category\/all(\?|$)/.test(href)) return true;
  const m = href.match(/^\/category\/([^?#/]+)$/);
  return !!m && API_SLUGS.includes(m[1]);
}

function failingFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ success: false, error: { message: "boom" } }) })),
  );
}

function allHrefs(): string[] {
  return Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
}

/** Opens the Categories mega menu and waits until the given href has rendered. */
async function openMenuUntil(href: string) {
  const user = userEvent.setup();
  render(<MegaMenu />);
  await user.hover(screen.getByText("Categories"));
  await waitFor(() => expect(document.querySelector(`a[href="${href}"]`)).not.toBeNull());
}

describe("MegaMenu category links", () => {
  beforeEach(() => resetNavCategoryCache());
  afterEach(() => vi.unstubAllGlobals());

  it("renders API categories as links to their slugged category pages", async () => {
    installCatalogFetch();
    await openMenuUntil("/category/gold");

    expect(document.querySelector('a[href="/category/gold"]')).toHaveTextContent("Gold");
    expect(document.querySelector('a[href="/category/silver"]')).toHaveTextContent("Silver");
  });

  it("does not render categories the API does not have", async () => {
    installCatalogFetch();
    await openMenuUntil("/category/gold");

    expect(allHrefs()).not.toContain("/category/rings");
    expect(allHrefs()).not.toContain("/category/necklaces");
  });

  it("falls back to search links when the API call fails", async () => {
    failingFetch();
    const user = userEvent.setup();
    render(<MegaMenu />);
    await user.hover(screen.getByText("Categories"));
    await waitFor(() => expect(allHrefs()).toContain("/search?q=Rings"));
    expect(NAV_FALLBACK_CATEGORIES.map((c) => c.name)).toContain("Rings");
  });

  it("falls back when the API returns no categories", async () => {
    installCatalogFetch((url) =>
      url.pathname.endsWith("/categories")
        ? { ok: true, status: 200, json: async () => ({ success: true, data: [] }) }
        : undefined,
    );
    const user = userEvent.setup();
    render(<MegaMenu />);
    await user.hover(screen.getByText("Categories"));
    await waitFor(() => expect(allHrefs()).toContain("/search?q=Necklaces"));
  });

  it("every link in the API-backed menu resolves (no dead category links)", async () => {
    installCatalogFetch();
    await openMenuUntil("/category/gold");

    const hrefs = allHrefs();
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(isResolvableNavHref(href), `unexpected nav href: ${href}`).toBe(true);
    }
  });

  it("every link in the fallback menu resolves", async () => {
    failingFetch();
    const user = userEvent.setup();
    render(<MegaMenu />);
    await user.hover(screen.getByText("Categories"));
    await waitFor(() => expect(allHrefs()).toContain("/search?q=Rings"));

    for (const href of allHrefs()) {
      expect(isResolvableNavHref(href), `unexpected fallback href: ${href}`).toBe(true);
    }
  });

  it("keeps the occasion and metal groupings on resolvable URLs", async () => {
    installCatalogFetch();
    await openMenuUntil("/category/gold");

    expect(document.querySelector('a[href="/category/all?occasion=wedding"]')).toHaveTextContent("Wedding");
    expect(document.querySelector('a[href="/search?q=Diamond"]')).toHaveTextContent("Diamond");
  });

  it("shares one categories request across several mounted menus", async () => {
    const fetchMock = installCatalogFetch();
    const first = render(<MegaMenu />);
    const second = render(<MegaMenu />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    const categoryCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/categories"));
    expect(categoryCalls.length).toBe(1);
    first.unmount();
    second.unmount();
  });
});
