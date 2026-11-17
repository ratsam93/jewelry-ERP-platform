// ─── CaratFlow Recommendation Types ────────────────────────────
// Types for AI-powered product recommendations: personalized feeds,
// similar products, trending items, and behavior tracking.

import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────

export enum SimilarityReason {
  SAME_CATEGORY = 'SAME_CATEGORY',
  SAME_METAL = 'SAME_METAL',
  SAME_PRICE_RANGE = 'SAME_PRICE_RANGE',
  BOUGHT_TOGETHER = 'BOUGHT_TOGETHER',
  VIEWED_TOGETHER = 'VIEWED_TOGETHER',
}

export enum RecommendationType {
  PERSONALIZED = 'PERSONALIZED',
  SIMILAR = 'SIMILAR',
  TRENDING = 'TRENDING',
  RECENTLY_VIEWED = 'RECENTLY_VIEWED',
  BOUGHT_TOGETHER = 'BOUGHT_TOGETHER',
  NEW_ARRIVALS = 'NEW_ARRIVALS',
  POPULAR_IN_CATEGORY = 'POPULAR_IN_CATEGORY',
}

export enum RecommendationContext {
  HOME = 'HOME',
  PRODUCT_PAGE = 'PRODUCT_PAGE',
  CART = 'CART',
  CATEGORY = 'CATEGORY',
}

// ─── Recommended Product ──────────────────────────────────────────

export const RecommendedProductSchema = z.object({
  id: z.guid(),
  sku: z.string(),
  name: z.string(),
  productType: z.string(),
  categoryId: z.guid().nullable(),
  categoryName: z.string().nullable(),
  metalPurity: z.number().int().nullable(),
  sellingPricePaise: z.number().int().nullable(),
  currencyCode: z.string(),
  images: z.unknown().nullable(),
  score: z.number().int().min(0).max(1000),
});
export type RecommendedProduct = z.infer<typeof RecommendedProductSchema>;

// ─── Recommendation Request ───────────────────────────────────────

export const RecommendationRequestSchema = z.object({
  customerId: z.guid().optional(),
  sessionId: z.string().min(1),
  context: z.nativeEnum(RecommendationContext),
  productId: z.guid().optional(),
  categoryId: z.guid().optional(),
  limit: z.number().int().min(1).max(50).default(12),
});
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;

// ─── Recommendation Response ──────────────────────────────────────

export const RecommendationResponseSchema = z.object({
  products: z.array(RecommendedProductSchema),
  source: z.nativeEnum(RecommendationType),
  algorithm: z.string(),
});
export type RecommendationResponse = z.infer<typeof RecommendationResponseSchema>;

// ─── Personalized Feed Section ────────────────────────────────────

export const PersonalizedFeedSectionSchema = z.object({
  type: z.nativeEnum(RecommendationType),
  title: z.string(),
  products: z.array(RecommendedProductSchema),
});
export type PersonalizedFeedSection = z.infer<typeof PersonalizedFeedSectionSchema>;

export const PersonalizedFeedResponseSchema = z.object({
  sections: z.array(PersonalizedFeedSectionSchema),
});
export type PersonalizedFeedResponse = z.infer<typeof PersonalizedFeedResponseSchema>;

// ─── Similar Products Response ────────────────────────────────────

export const SimilarProductsResponseSchema = z.object({
  productId: z.guid(),
  products: z.array(RecommendedProductSchema),
  algorithm: z.string(),
});
export type SimilarProductsResponse = z.infer<typeof SimilarProductsResponseSchema>;

// ─── Trending Products Response ───────────────────────────────────

export const TrendingProductsResponseSchema = z.object({
  products: z.array(RecommendedProductSchema),
  period: z.string(),
  algorithm: z.string(),
});
export type TrendingProductsResponse = z.infer<typeof TrendingProductsResponseSchema>;

// ─── Track View Input ─────────────────────────────────────────────

export const TrackViewInputSchema = z.object({
  productId: z.guid(),
  customerId: z.guid().optional(),
  sessionId: z.string().min(1),
});
export type TrackViewInput = z.infer<typeof TrackViewInputSchema>;

// ─── Track Click Input ────────────────────────────────────────────

export const TrackClickInputSchema = z.object({
  recommendationLogId: z.guid(),
  clickedProductId: z.guid(),
});
export type TrackClickInput = z.infer<typeof TrackClickInputSchema>;

// ─── Customer Behavior Response ───────────────────────────────────

export const CustomerBehaviorResponseSchema = z.object({
  customerId: z.guid(),
  viewedCategories: z.record(z.string(), z.number()).nullable(),
  viewedProducts: z.record(z.string(), z.number()).nullable(),
  purchasedCategories: z.record(z.string(), z.number()).nullable(),
  purchasedProducts: z.record(z.string(), z.number()).nullable(),
  searchQueries: z.array(z.string()).nullable(),
  avgOrderValuePaise: z.number().int(),
  preferredMetalType: z.string().nullable(),
  preferredPurity: z.number().int().nullable(),
  priceRangeLowPaise: z.number().int().nullable(),
  priceRangeHighPaise: z.number().int().nullable(),
  lastUpdatedAt: z.coerce.date(),
});
export type CustomerBehaviorResponse = z.infer<typeof CustomerBehaviorResponseSchema>;
