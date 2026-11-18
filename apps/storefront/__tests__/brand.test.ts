import { describe, it, expect } from "vitest";
import { BRAND_NAME, BRAND_LEGAL, BRAND_PREFIX, BRAND_SUFFIX, DEFAULT_SITE_URL } from "@/lib/brand";
import { getSiteUrl } from "@/lib/site";

describe("storefront brand", () => {
  it("defaults to TechBeyond", () => {
    expect(BRAND_NAME).toBe("TechBeyond");
    expect(BRAND_LEGAL).toBe("TechBeyond Jewellers");
    expect(BRAND_PREFIX + BRAND_SUFFIX).toBe(BRAND_NAME);
    expect(BRAND_PREFIX).toBe("Tech");
    expect(BRAND_SUFFIX).toBe("Beyond");
  });

  it("falls back to the production shop URL", () => {
    expect(DEFAULT_SITE_URL).toBe("https://shop.erp.techbeyondsolution.com");
    if (!process.env.NEXT_PUBLIC_SITE_URL) expect(getSiteUrl()).toBe(DEFAULT_SITE_URL);
  });
});
