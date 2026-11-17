import { describe, it, expect } from "vitest";
import { safeNextPath, withNext } from "@/lib/auth-next";

describe("safeNextPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNextPath("/consultation/request")).toBe("/consultation/request");
    expect(safeNextPath("/product/1?x=2")).toBe("/product/1?x=2");
  });

  it("rejects external, protocol-relative and tricky values", () => {
    const bad = ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "", null, undefined, "%2F%2Fevil.com", "/auth/login", "/%0d%0aX"];
    for (const b of bad) {
      expect(safeNextPath(b as string | null)).toBeNull();
    }
  });

  it("withNext appends an encoded next", () => {
    expect(withNext("/auth/register", "/a b")).toBe("/auth/register?next=%2Fa%20b");
    expect(withNext("/x?y=1", "/c")).toBe("/x?y=1&next=%2Fc");
    expect(withNext("/x", null)).toBe("/x");
  });
});
