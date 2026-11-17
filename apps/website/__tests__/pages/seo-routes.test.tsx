import { describe, it, expect } from "vitest";
import sitemap from "../../app/sitemap";
import robots from "../../app/robots";
import { generateStaticParams } from "../../app/blog/[slug]/page";

describe("sitemap / robots / blog slugs", () => {
  it("lists real routes and blog posts, including the HUID guide", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/privacy"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/blog/huid-compliance-guide"))).toBe(true);
  });
  it("robots points at the sitemap", () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
  it("generates static params for each post", () => {
    expect(generateStaticParams().map((p) => p.slug)).toContain("huid-compliance-guide");
  });
});
