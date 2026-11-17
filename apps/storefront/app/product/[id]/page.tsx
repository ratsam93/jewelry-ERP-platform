import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetailView from "@/components/ProductDetailView";
import {
  getProduct,
  getProductReviews,
  getRelatedProducts,
  type CatalogProduct,
} from "@/lib/catalog";
import { calculateProductPrice } from "@/lib/utils";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  let product: CatalogProduct | null = null;
  try {
    product = await getProduct(id);
  } catch {
    return { title: "Jewelry" };
  }
  if (!product) return { title: "Product Not Found" };
  const description = product.shortDescription || product.description || `${product.name} at CaratFlow`;
  const image = product.images[0]?.url;
  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      ...(image && !image.startsWith("data:") ? { images: [image] } : {}),
    },
  };
}

function buildJsonLd(product: CatalogProduct): string {
  const price = calculateProductPrice(product);
  const images = product.images.map((img) => img.url).filter((u) => !u.startsWith("data:"));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.sku,
    ...(images.length > 0 ? { image: images } : {}),
    brand: { "@type": "Brand", name: "CaratFlow" },
    offers: {
      "@type": "Offer",
      price: (price.total / 100).toFixed(2),
      priceCurrency: product.currencyCode || "INR",
      availability: product.isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
  };
  return JSON.stringify(jsonLd).replace(/</g, "\u003c");
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  // Reviews and related products are secondary; never fail the page for them.
  const [reviews, related] = await Promise.all([
    getProductReviews(product.id).catch(() => []),
    getRelatedProducts(product).catch(() => []),
  ]);

  return (
    <ProductDetailView
      product={product}
      reviews={reviews}
      related={related}
      jsonLd={buildJsonLd(product)}
    />
  );
}
