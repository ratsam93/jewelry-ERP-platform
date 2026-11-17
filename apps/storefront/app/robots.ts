import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/account", "/cart", "/checkout", "/auth"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
