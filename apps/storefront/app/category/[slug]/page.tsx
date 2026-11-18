import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CategoryView from "@/components/CategoryView";
import {
  CATEGORY_PAGE_SIZE,
  findCategory,
  getCategories,
  getCategoryProducts,
} from "@/lib/catalog";
import type { FilterState } from "@/lib/types";
import { BRAND_NAME } from "@/lib/brand";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const SORTS: FilterState["sortBy"][] = [
  "price_asc",
  "price_desc",
  "newest",
  "popularity",
  "weight_asc",
  "weight_desc",
];

async function resolveCategory(slug: string) {
  if (slug === "all") return { category: null, title: "All Jewelry" };
  const tree = await getCategories();
  const category = findCategory(slug, tree);
  if (!category) return null;
  return { category, title: category.name };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const resolved = await resolveCategory(slug);
    if (!resolved) return { title: "Category Not Found" };
    return {
      title: resolved.title,
      description: resolved.category?.description || `Shop ${resolved.title} jewelry online at ${BRAND_NAME}.`,
    };
  } catch {
    return { title: "Jewelry" };
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};

  const resolved = await resolveCategory(slug);
  if (!resolved) notFound();

  const initial = await getCategoryProducts(resolved.category, { limit: CATEGORY_PAGE_SIZE });

  const occasion = typeof sp.occasion === "string" ? sp.occasion : undefined;
  const sort = SORTS.find((s) => s === sp.sort);
  const initialFilters: Partial<FilterState> = {
    ...(occasion ? { occasion: [occasion] } : {}),
    ...(sort ? { sortBy: sort } : {}),
  };

  return (
    <CategoryView
      category={resolved.category}
      title={resolved.title}
      initial={initial}
      initialFilters={initialFilters}
    />
  );
}
