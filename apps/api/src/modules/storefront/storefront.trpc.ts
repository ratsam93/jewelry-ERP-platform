// ─── Storefront tRPC Router ────────────────────────────────────
// Internal tRPC procedures mirroring the public REST API. The
// authenticated user id (ctx.userId) is treated as the customer id.
// `sessionId` is required as input where the underlying service uses
// guest-cart sessions.

import { Injectable } from '@nestjs/common';
import { partialUpdate } from '@caratflow/shared-types';
import { z } from 'zod';
import { TrpcService } from '../../trpc/trpc.service';
import { StorefrontCatalogService } from './storefront.catalog.service';
import { StorefrontCartService } from './storefront.cart.service';
import { StorefrontWishlistService } from './storefront.wishlist.service';
import { StorefrontCheckoutService } from './storefront.checkout.service';
import { StorefrontOrderService } from './storefront.order.service';
import { StorefrontAddressService } from './storefront.address.service';
import { StorefrontReviewService } from './storefront.review.service';
import { StorefrontHomeService } from './storefront.home.service';
import { StorefrontCouponService } from './storefront.coupon.service';
import {
  ProductListInputSchema,
  CartItemInputSchema,
  AddressInputSchema,
  CheckoutInputSchema,
  ReviewInputSchema,
  ReviewListInputSchema,
  CouponValidationInputSchema,
  PaginationSchema,
} from '@caratflow/shared-types';

@Injectable()
export class StorefrontTrpcRouter {
  constructor(
    private readonly trpc: TrpcService,
    private readonly catalogService: StorefrontCatalogService,
    private readonly cartService: StorefrontCartService,
    private readonly wishlistService: StorefrontWishlistService,
    private readonly checkoutService: StorefrontCheckoutService,
    private readonly orderService: StorefrontOrderService,
    private readonly addressService: StorefrontAddressService,
    private readonly reviewService: StorefrontReviewService,
    private readonly homeService: StorefrontHomeService,
    private readonly couponService: StorefrontCouponService,
  ) {}

  get router() {
    const anyPrincipal = this.trpc.anyPrincipalProcedure;
    // Customer-bound procedures (ctx.userId is the B2C customerId): B2C token only.
    const customer = this.trpc.customerProcedure;

    return this.trpc.router({
      // ─── Home ────────────────────────────────────────────
      home: anyPrincipal.query(({ ctx }) =>
        this.homeService.getHomepageData(ctx.tenantId),
      ),

      // ─── Catalog ─────────────────────────────────────────
      catalog: this.trpc.router({
        list: anyPrincipal
          .input(ProductListInputSchema)
          .query(({ ctx, input }) =>
            this.catalogService.getProducts(ctx.tenantId, input),
          ),

        getById: anyPrincipal
          .input(z.object({ id: z.guid() }))
          .query(({ ctx, input }) =>
            this.catalogService.getProductById(ctx.tenantId, input.id),
          ),

        search: anyPrincipal
          .input(z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) }))
          .query(({ ctx, input }) =>
            this.catalogService.searchProducts(ctx.tenantId, input.query, ctx.userId, input.limit),
          ),

        categories: anyPrincipal.query(({ ctx }) =>
          this.catalogService.getCategories(ctx.tenantId),
        ),

        compare: anyPrincipal
          .input(z.object({ productIds: z.array(z.guid()).min(2).max(4) }))
          .query(({ ctx, input }) =>
            this.catalogService.compareProducts(ctx.tenantId, input.productIds),
          ),
      }),

      // ─── Cart ────────────────────────────────────────────
      cart: this.trpc.router({
        get: customer
          .input(z.object({ sessionId: z.string().min(1) }))
          .query(({ ctx, input }) =>
            this.cartService.getOrCreateCart(ctx.tenantId, ctx.userId, input.sessionId),
          ),

        addItem: customer
          .input(z.object({ sessionId: z.string().min(1) }).merge(CartItemInputSchema))
          .mutation(async ({ ctx, input }) => {
            const cart = await this.cartService.getOrCreateCart(
              ctx.tenantId, ctx.userId, input.sessionId,
            );
            return this.cartService.addItem(
              ctx.tenantId, cart.id, input.productId, input.quantity ?? 1,
            );
          }),

        updateItem: customer
          .input(z.object({
            sessionId: z.string().min(1),
            itemId: z.guid(),
            quantity: z.number().int().min(1),
          }))
          .mutation(async ({ ctx, input }) => {
            const cart = await this.cartService.getOrCreateCart(
              ctx.tenantId, ctx.userId, input.sessionId,
            );
            return this.cartService.updateItemQuantity(
              ctx.tenantId, cart.id, input.itemId, input.quantity,
            );
          }),

        removeItem: customer
          .input(z.object({ sessionId: z.string().min(1), itemId: z.guid() }))
          .mutation(async ({ ctx, input }) => {
            const cart = await this.cartService.getOrCreateCart(
              ctx.tenantId, ctx.userId, input.sessionId,
            );
            return this.cartService.removeItem(ctx.tenantId, cart.id, input.itemId);
          }),

        clear: customer
          .input(z.object({ sessionId: z.string().min(1) }))
          .mutation(async ({ ctx, input }) => {
            const cart = await this.cartService.getOrCreateCart(
              ctx.tenantId, ctx.userId, input.sessionId,
            );
            return this.cartService.clearCart(ctx.tenantId, cart.id);
          }),

        merge: customer
          .input(z.object({ sessionId: z.string().min(1) }))
          .mutation(({ ctx, input }) =>
            this.cartService.mergeGuestCart(ctx.tenantId, input.sessionId, ctx.userId),
          ),

        applyCoupon: customer
          .input(z.object({ sessionId: z.string().min(1), couponCode: z.string().min(1) }))
          .mutation(async ({ ctx, input }) => {
            const cart = await this.cartService.getOrCreateCart(
              ctx.tenantId, ctx.userId, input.sessionId,
            );
            return this.cartService.applyCoupon(
              ctx.tenantId, cart.id, input.couponCode, ctx.userId,
            );
          }),
      }),

      // ─── Wishlist ────────────────────────────────────────
      wishlist: this.trpc.router({
        add: customer
          .input(z.object({ productId: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.wishlistService.add(ctx.tenantId, ctx.userId, input.productId),
          ),

        get: customer.query(({ ctx }) =>
          this.wishlistService.getWishlist(ctx.tenantId, ctx.userId),
        ),

        remove: customer
          .input(z.object({ productId: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.wishlistService.remove(ctx.tenantId, ctx.userId, input.productId),
          ),

        enablePriceAlert: customer
          .input(z.object({ productId: z.guid(), targetPricePaise: z.number().int().nonnegative() }))
          .mutation(({ ctx, input }) =>
            this.wishlistService.enablePriceAlert(
              ctx.tenantId, ctx.userId, input.productId, input.targetPricePaise,
            ),
          ),
      }),

      // ─── Checkout ────────────────────────────────────────
      checkout: this.trpc.router({
        initiate: customer
          .input(CheckoutInputSchema)
          .mutation(({ ctx, input }) =>
            this.checkoutService.initiateCheckout(ctx.tenantId, ctx.userId, input),
          ),

        complete: customer
          .input(z.object({
            orderId: z.guid(),
            externalPaymentId: z.string().min(1),
            gatewayResponse: z.record(z.string(), z.unknown()).optional(),
          }))
          .mutation(({ ctx, input }) =>
            this.checkoutService.completeCheckout(
              ctx.tenantId,
              ctx.userId,
              input.orderId,
              {
                externalPaymentId: input.externalPaymentId,
                gatewayResponse: input.gatewayResponse,
              },
            ),
          ),
      }),

      // ─── Orders ──────────────────────────────────────────
      orders: this.trpc.router({
        list: customer
          .input(PaginationSchema)
          .query(({ ctx, input }) =>
            this.orderService.getMyOrders(ctx.tenantId, ctx.userId, input),
          ),

        getById: customer
          .input(z.object({ id: z.guid() }))
          .query(({ ctx, input }) =>
            this.orderService.getOrderById(ctx.tenantId, ctx.userId, input.id),
          ),

        requestReturn: customer
          .input(z.object({
            id: z.guid(),
            items: z.array(z.object({
              orderItemId: z.guid(),
              quantity: z.number().int().min(1),
              reason: z.string().min(1),
            })),
            reason: z.string().min(1),
          }))
          .mutation(({ ctx, input }) =>
            this.orderService.requestReturn(
              ctx.tenantId, ctx.userId, input.id, input.items, input.reason,
            ),
          ),

        cancel: customer
          .input(z.object({ id: z.guid(), reason: z.string().min(1) }))
          .mutation(({ ctx, input }) =>
            this.checkoutService.cancelOrder(ctx.tenantId, ctx.userId, input.id, input.reason),
          ),

        reorder: customer
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.orderService.reorder(ctx.tenantId, ctx.userId, input.id),
          ),
      }),

      // ─── Reviews ─────────────────────────────────────────
      reviews: this.trpc.router({
        submit: customer
          .input(ReviewInputSchema)
          .mutation(({ ctx, input }) =>
            this.reviewService.submitReview(ctx.tenantId, ctx.userId, input),
          ),

        list: anyPrincipal
          .input(ReviewListInputSchema)
          .query(({ ctx, input }) =>
            this.reviewService.getReviews(ctx.tenantId, input),
          ),

        markHelpful: anyPrincipal
          .input(z.object({ reviewId: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.reviewService.markHelpful(ctx.tenantId, input.reviewId),
          ),
      }),

      // ─── Addresses ───────────────────────────────────────
      addresses: this.trpc.router({
        list: customer.query(({ ctx }) =>
          this.addressService.listAddresses(ctx.tenantId, ctx.userId),
        ),

        get: customer
          .input(z.object({ id: z.guid() }))
          .query(({ ctx, input }) =>
            this.addressService.getAddress(ctx.tenantId, ctx.userId, input.id),
          ),

        create: customer
          .input(AddressInputSchema)
          .mutation(({ ctx, input }) =>
            this.addressService.createAddress(ctx.tenantId, ctx.userId, input),
          ),

        update: customer
          .input(z.object({ id: z.guid(), data: partialUpdate(AddressInputSchema) }))
          .mutation(({ ctx, input }) =>
            this.addressService.updateAddress(
              ctx.tenantId, ctx.userId, input.id, input.data as Record<string, unknown>,
            ),
          ),

        delete: customer
          .input(z.object({ id: z.guid() }))
          .mutation(({ ctx, input }) =>
            this.addressService.deleteAddress(ctx.tenantId, ctx.userId, input.id),
          ),
      }),

      // ─── Coupons ─────────────────────────────────────────
      coupons: this.trpc.router({
        validate: customer
          .input(CouponValidationInputSchema)
          .mutation(({ ctx, input }) =>
            this.couponService.validateCoupon(
              ctx.tenantId, input.code, input.cartTotalPaise, ctx.userId,
            ),
          ),
      }),
    });
  }
}
