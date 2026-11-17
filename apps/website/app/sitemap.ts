import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/api";
import { posts } from "@/lib/posts";

export const dynamic = "force-static";

const routes = ["", "/features", "/pricing", "/about", "/blog", "/contact", "/careers", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    ...routes.map((r) => ({
      url: `${SITE_URL}${r}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: r === "" ? 1 : 0.7,
    })),
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}
