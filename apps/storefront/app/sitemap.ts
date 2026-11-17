import type { MetadataRoute } from "next";
import { getCategories } from "@/lib/catalog";
import type { Category } from "@/lib/types";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 3600;

const STATIC_PAGES = [
  "about",
  "contact",
  "faq",
  "shipping",
  "returns",
  "size-guide",
  "jewelry-care",
  "bis-hallmark",
  "store-locator",
  "careers",
  "privacy",
  "terms",
  "consultation/request",
  "try-on",
];

function flatten(tree: Category[]): Category[] {
  return tree.flatMap((c) => [c, ...flatten(c.children ?? [])]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/category/all`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ...STATIC_PAGES.map((p) => ({
      url: `${base}/${p}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
  try {
    const slugs = new Set(flatten(await getCategories()).map((c) => c.slug).filter(Boolean));
    for (const slug of slugs) {
      entries.push({
        url: `${base}/category/${encodeURIComponent(slug)}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  } catch {
    // API unavailable: static entries only
  }
  return entries;
}
