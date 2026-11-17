import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/catalog", () => ({ getCategories: vi.fn() }));
import { getCategories } from "@/lib/catalog";
import sitemap from "../sitemap";
import robots from "../robots";

const cat = (id: string, slug: string, children?: unknown[]) =>
  ({ id, name: slug, slug, description: "", image: "", productCount: 0, children }) as never;

describe("robots", () => {
  it("allows all but private areas and points to the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/account", "/cart", "/checkout", "/auth"]));
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("sitemap", () => {


  it("lists home, static pages and API categories", async () => {
    vi.mocked(getCategories).mockResolvedValue([cat("1", "rings", [cat("2", "bands")])]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => /^https?:\/\/[^/]+$/.test(u))).toBe(true);
    expect(urls.some((u) => u.endsWith("/contact"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/category/rings"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/category/bands"))).toBe(true);
  });

  it("falls back to static entries when the API fails", async () => {
    vi.mocked(getCategories).mockImplementation(() => {
      throw new Error("down");
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.length).toBeGreaterThan(5);
    expect(urls.some((u) => u.includes("/category/rings"))).toBe(false);
  });
});
