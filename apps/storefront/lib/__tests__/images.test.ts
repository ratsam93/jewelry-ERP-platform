import { describe, it, expect } from "vitest";
import {
  CATEGORY_PLACEHOLDER,
  HERO_IMAGES,
  PRODUCT_PLACEHOLDER,
  applyFallbackImage,
  categoryTile,
  resolveImageUrl,
} from "@/lib/images";
import { categoryImage, mapImages } from "@/lib/catalog";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.join(__dirname, "../../public");

describe("bundled images", () => {
  it("never points at an external placeholder host", () => {
    const all = [...HERO_IMAGES, PRODUCT_PLACEHOLDER, CATEGORY_PLACEHOLDER, categoryTile("Gold")];
    for (const u of all) expect(u.startsWith("/images/")).toBe(true);
  });

  it("ships every file it references", () => {
    const all = [
      ...HERO_IMAGES,
      PRODUCT_PLACEHOLDER,
      CATEGORY_PLACEHOLDER,
      ...["Gold", "Silver", "Diamond", "Platinum", "Gemstone", "Kundan", "Rings", "Nose Pins", "Mangalsutra"].map(categoryTile),
    ];
    for (const u of all) expect(fs.existsSync(path.join(publicDir, u)), u).toBe(true);
  });

  it("matches category tiles by name or slug and falls back neutrally", () => {
    expect(categoryTile("Gold")).toBe("/images/categories/cat-gold.webp");
    expect(categoryTile("kundan")).toBe("/images/categories/cat-kundan.webp");
    expect(categoryImage("Nose Pins")).toBe("/images/products/prod-nosepin-01.webp");
    expect(categoryTile("Totally Unknown")).toBe(CATEGORY_PLACEHOLDER);
  });
});

describe("resolveImageUrl", () => {
  it("keeps absolute URLs from the API/database untouched", () => {
    expect(resolveImageUrl("https://shop.example.com/images/products/a.webp")).toBe(
      "https://shop.example.com/images/products/a.webp",
    );
  });
  it("replaces legacy placeholder-service URLs stored in older databases", () => {
    expect(resolveImageUrl("https://picsum.photos/seed/x/600/600")).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl("https://loremflickr.com/600/600/gold?lock=1")).toBe(PRODUCT_PLACEHOLDER);
  });
  it("keeps bundled /images paths relative and prefixes other API paths", () => {
    expect(resolveImageUrl("/images/products/a.webp", "https://api.x")).toBe("/images/products/a.webp");
    expect(resolveImageUrl("/uploads/a.jpg", "https://api.x")).toBe("https://api.x/uploads/a.jpg");
  });
  it("falls back to the placeholder for empty values", () => {
    expect(resolveImageUrl("")).toBe(PRODUCT_PLACEHOLDER);
    expect(resolveImageUrl(null)).toBe(PRODUCT_PLACEHOLDER);
    expect(mapImages([], "X")[0]?.url).toBe(PRODUCT_PLACEHOLDER);
  });
});

describe("applyFallbackImage", () => {
  it("swaps the source once and does not loop", () => {
    const el = { src: "https://bad/x.jpg", dataset: {} as DOMStringMap };
    applyFallbackImage({ currentTarget: el });
    expect(el.src).toBe(PRODUCT_PLACEHOLDER);
    el.src = "again";
    applyFallbackImage({ currentTarget: el });
    expect(el.src).toBe("again");
  });
});
