import { describe, it, expect } from "vitest";
import { BRAND_NAME, BRAND_PREFIX, BRAND_SUFFIX, DEFAULT_SITE_URL, APP_LOGIN_URL } from "@/lib/brand";
import { metadata } from "@/app/layout";

describe("website brand", () => {
  it("defaults to TechBeyond", () => {
    expect(BRAND_NAME).toBe("TechBeyond");
    expect(BRAND_PREFIX + BRAND_SUFFIX).toBe("TechBeyond");
    expect(DEFAULT_SITE_URL).toBe("https://erp.techbeyondsolution.com");
    if (!process.env.NEXT_PUBLIC_APP_URL) expect(APP_LOGIN_URL).toBe("https://app.erp.techbeyondsolution.com/admin/login");
  });

  it("uses the brand in the title template and OG tags", () => {
    const title = metadata.title as { default: string; template: string };
    expect(title.template).toBe("%s | TechBeyond");
    expect(title.default).toContain("TechBeyond");
    expect(metadata.openGraph?.siteName).toBe("TechBeyond");
  });
});
