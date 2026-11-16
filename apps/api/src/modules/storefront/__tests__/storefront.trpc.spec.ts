import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { StorefrontTrpcRouter } from '../storefront.trpc';

describe('StorefrontTrpcRouter', () => {
  const trpc = new TrpcService();

  const catalogService = {
    getProducts: vi.fn(),
    getProductById: vi.fn(),
    searchProducts: vi.fn(),
    getCategories: vi.fn(),
    compareProducts: vi.fn(),
  };
  const cartService = {
    getOrCreateCart: vi.fn(),
    addItem: vi.fn(),
    updateItemQuantity: vi.fn(),
    removeItem: vi.fn(),
    clearCart: vi.fn(),
    mergeGuestCart: vi.fn(),
    applyCoupon: vi.fn(),
  };
  const wishlistService = {
    add: vi.fn(),
    getWishlist: vi.fn(),
    remove: vi.fn(),
    enablePriceAlert: vi.fn(),
  };
  const checkoutService = {
    initiateCheckout: vi.fn(),
    completeCheckout: vi.fn(),
    cancelOrder: vi.fn(),
  };
  const orderService = {
    getMyOrders: vi.fn(),
    getOrderById: vi.fn(),
    requestReturn: vi.fn(),
    reorder: vi.fn(),
  };
  const addressService = {
    listAddresses: vi.fn(),
    getAddress: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
  };
  const reviewService = {
    submitReview: vi.fn(),
    getReviews: vi.fn(),
    markHelpful: vi.fn(),
  };
  const homeService = {
    getHomepageData: vi.fn(),
  };
  const couponService = {
    validateCoupon: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'customer',
    userPermissions: ['*'],
  };

  const routerInstance = new StorefrontTrpcRouter(
    trpc,
    catalogService as never,
    cartService as never,
    wishlistService as never,
    checkoutService as never,
    orderService as never,
    addressService as never,
    reviewService as never,
    homeService as never,
    couponService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
  const PRODUCT_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const PRODUCT_ID_2 = '3f1e2d4c-5b6a-4789-9abc-def012345679';
  const ADDRESS_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const CART_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const CART_ITEM_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
  const ORDER_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
  const REVIEW_ID = '3e4f5a6b-7c8d-4e9f-9a0b-2c3d4e5f6a7b';
  const ORDER_ITEM_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';

  const validAddress = {
    label: 'Home',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+911234567890',
    addressLine1: '123 Main St',
    city: 'Mumbai',
    state: 'MH',
    country: 'IN',
    postalCode: '400001',
    isDefault: false,
  };

  // ─── Home ────────────────────────────────────────────
  describe('home', () => {
    it('delegates to homeService.getHomepageData with tenantId', async () => {
      homeService.getHomepageData.mockResolvedValue({ banners: [] });
      const result = await caller.home();
      expect(homeService.getHomepageData).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ banners: [] });
    });
  });

  // ─── Catalog ─────────────────────────────────────────
  describe('catalog.list', () => {
    it('delegates to catalogService.getProducts', async () => {
      catalogService.getProducts.mockResolvedValue({ items: [] });
      await caller.catalog.list({});
      expect(catalogService.getProducts).toHaveBeenCalledWith('tenant-1', expect.any(Object));
    });
  });

  describe('catalog.getById', () => {
    it('delegates to catalogService.getProductById', async () => {
      catalogService.getProductById.mockResolvedValue({ id: PRODUCT_ID });
      await caller.catalog.getById({ id: PRODUCT_ID });
      expect(catalogService.getProductById).toHaveBeenCalledWith('tenant-1', PRODUCT_ID);
    });

    it('rejects invalid uuid', async () => {
      await expect(caller.catalog.getById({ id: 'bogus' })).rejects.toThrow();
    });
  });

  describe('catalog.search', () => {
    it('delegates to catalogService.searchProducts with limit default', async () => {
      catalogService.searchProducts.mockResolvedValue([]);
      await caller.catalog.search({ query: 'diamond' });
      expect(catalogService.searchProducts).toHaveBeenCalledWith('tenant-1', 'diamond', 'user-1', 20);
    });

    it('rejects empty query', async () => {
      await expect(caller.catalog.search({ query: '' })).rejects.toThrow();
    });
  });

  describe('catalog.categories', () => {
    it('delegates to catalogService.getCategories', async () => {
      catalogService.getCategories.mockResolvedValue([]);
      await caller.catalog.categories();
      expect(catalogService.getCategories).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('catalog.compare', () => {
    it('delegates to catalogService.compareProducts', async () => {
      catalogService.compareProducts.mockResolvedValue([]);
      await caller.catalog.compare({ productIds: [PRODUCT_ID, PRODUCT_ID_2] });
      expect(catalogService.compareProducts).toHaveBeenCalledWith('tenant-1', [PRODUCT_ID, PRODUCT_ID_2]);
    });

    it('rejects fewer than 2 ids', async () => {
      await expect(caller.catalog.compare({ productIds: [PRODUCT_ID] })).rejects.toThrow();
    });
  });

  // ─── Cart ────────────────────────────────────────────
  describe('cart.get', () => {
    it('delegates to cartService.getOrCreateCart', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      await caller.cart.get({ sessionId: 'sess-1' });
      expect(cartService.getOrCreateCart).toHaveBeenCalledWith('tenant-1', 'user-1', 'sess-1');
    });
  });

  describe('cart.addItem', () => {
    it('resolves cart and adds item', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      cartService.addItem.mockResolvedValue({ id: CART_ITEM_ID });
      await caller.cart.addItem({
        sessionId: 'sess-1',
        productId: PRODUCT_ID,
        quantity: 2,
      });
      expect(cartService.getOrCreateCart).toHaveBeenCalledWith('tenant-1', 'user-1', 'sess-1');
      expect(cartService.addItem).toHaveBeenCalledWith('tenant-1', CART_ID, PRODUCT_ID, 2);
    });

    it('defaults quantity to 1', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      await caller.cart.addItem({ sessionId: 'sess-1', productId: PRODUCT_ID });
      expect(cartService.addItem).toHaveBeenCalledWith('tenant-1', CART_ID, PRODUCT_ID, 1);
    });
  });

  describe('cart.updateItem', () => {
    it('resolves cart and updates quantity', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      cartService.updateItemQuantity.mockResolvedValue({});
      await caller.cart.updateItem({
        sessionId: 'sess-1',
        itemId: CART_ITEM_ID,
        quantity: 5,
      });
      expect(cartService.updateItemQuantity).toHaveBeenCalledWith('tenant-1', CART_ID, CART_ITEM_ID, 5);
    });
  });

  describe('cart.removeItem', () => {
    it('resolves cart and removes item', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      cartService.removeItem.mockResolvedValue({});
      await caller.cart.removeItem({ sessionId: 'sess-1', itemId: CART_ITEM_ID });
      expect(cartService.removeItem).toHaveBeenCalledWith('tenant-1', CART_ID, CART_ITEM_ID);
    });
  });

  describe('cart.clear', () => {
    it('resolves cart and clears', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      cartService.clearCart.mockResolvedValue({});
      await caller.cart.clear({ sessionId: 'sess-1' });
      expect(cartService.clearCart).toHaveBeenCalledWith('tenant-1', CART_ID);
    });
  });

  describe('cart.merge', () => {
    it('delegates to cartService.mergeGuestCart', async () => {
      cartService.mergeGuestCart.mockResolvedValue({});
      await caller.cart.merge({ sessionId: 'sess-1' });
      expect(cartService.mergeGuestCart).toHaveBeenCalledWith('tenant-1', 'sess-1', 'user-1');
    });
  });

  describe('cart.applyCoupon', () => {
    it('resolves cart and applies coupon', async () => {
      cartService.getOrCreateCart.mockResolvedValue({ id: CART_ID });
      cartService.applyCoupon.mockResolvedValue({});
      await caller.cart.applyCoupon({ sessionId: 'sess-1', couponCode: 'SAVE10' });
      expect(cartService.applyCoupon).toHaveBeenCalledWith('tenant-1', CART_ID, 'SAVE10', 'user-1');
    });
  });

  // ─── Wishlist ─────────────────────────────────────────
  describe('wishlist.add', () => {
    it('delegates to wishlistService.add', async () => {
      wishlistService.add.mockResolvedValue({});
      await caller.wishlist.add({ productId: PRODUCT_ID });
      expect(wishlistService.add).toHaveBeenCalledWith('tenant-1', 'user-1', PRODUCT_ID);
    });

    it('rejects invalid uuid', async () => {
      await expect(caller.wishlist.add({ productId: 'bad' })).rejects.toThrow();
    });
  });

  describe('wishlist.get', () => {
    it('delegates to wishlistService.getWishlist', async () => {
      wishlistService.getWishlist.mockResolvedValue({ items: [] });
      await caller.wishlist.get();
      expect(wishlistService.getWishlist).toHaveBeenCalledWith('tenant-1', 'user-1');
    });
  });

  describe('wishlist.remove', () => {
    it('delegates to wishlistService.remove', async () => {
      wishlistService.remove.mockResolvedValue({});
      await caller.wishlist.remove({ productId: PRODUCT_ID });
      expect(wishlistService.remove).toHaveBeenCalledWith('tenant-1', 'user-1', PRODUCT_ID);
    });
  });

  describe('wishlist.enablePriceAlert', () => {
    it('delegates to wishlistService.enablePriceAlert', async () => {
      wishlistService.enablePriceAlert.mockResolvedValue({});
      await caller.wishlist.enablePriceAlert({
        productId: PRODUCT_ID,
        targetPricePaise: 5000,
      });
      expect(wishlistService.enablePriceAlert).toHaveBeenCalledWith(
        'tenant-1', 'user-1', PRODUCT_ID, 5000,
      );
    });
  });

  // ─── Checkout ────────────────────────────────────────
  describe('checkout.initiate', () => {
    it('delegates to checkoutService.initiateCheckout', async () => {
      checkoutService.initiateCheckout.mockResolvedValue({ orderId: ORDER_ID });
      const input = {
        cartId: CART_ID,
        addressId: ADDRESS_ID,
        paymentMethod: 'UPI',
      };
      await caller.checkout.initiate(input);
      expect(checkoutService.initiateCheckout).toHaveBeenCalledWith('tenant-1', 'user-1', input);
    });
  });

  describe('checkout.complete', () => {
    it('delegates to checkoutService.completeCheckout', async () => {
      checkoutService.completeCheckout.mockResolvedValue({});
      await caller.checkout.complete({
        orderId: ORDER_ID,
        externalPaymentId: 'pay-1',
        gatewayResponse: { ok: true },
      });
      expect(checkoutService.completeCheckout).toHaveBeenCalledWith(
        'tenant-1', 'user-1', ORDER_ID,
        { externalPaymentId: 'pay-1', gatewayResponse: { ok: true } },
      );
    });
  });

  // ─── Orders ──────────────────────────────────────────
  describe('orders.list', () => {
    it('delegates to orderService.getMyOrders', async () => {
      orderService.getMyOrders.mockResolvedValue({ items: [] });
      await caller.orders.list({});
      expect(orderService.getMyOrders).toHaveBeenCalledWith('tenant-1', 'user-1', expect.any(Object));
    });
  });

  describe('orders.getById', () => {
    it('delegates to orderService.getOrderById', async () => {
      orderService.getOrderById.mockResolvedValue({ id: ORDER_ID });
      await caller.orders.getById({ id: ORDER_ID });
      expect(orderService.getOrderById).toHaveBeenCalledWith('tenant-1', 'user-1', ORDER_ID);
    });
  });

  describe('orders.requestReturn', () => {
    it('delegates to orderService.requestReturn', async () => {
      orderService.requestReturn.mockResolvedValue({});
      const items = [{ orderItemId: ORDER_ITEM_ID, quantity: 1, reason: 'damaged' }];
      await caller.orders.requestReturn({
        id: ORDER_ID,
        items,
        reason: 'defective',
      });
      expect(orderService.requestReturn).toHaveBeenCalledWith(
        'tenant-1', 'user-1', ORDER_ID, items, 'defective',
      );
    });
  });

  describe('orders.cancel', () => {
    it('delegates to checkoutService.cancelOrder', async () => {
      checkoutService.cancelOrder.mockResolvedValue({});
      await caller.orders.cancel({ id: ORDER_ID, reason: 'changed mind' });
      expect(checkoutService.cancelOrder).toHaveBeenCalledWith('tenant-1', 'user-1', ORDER_ID, 'changed mind');
    });
  });

  describe('orders.reorder', () => {
    it('delegates to orderService.reorder', async () => {
      orderService.reorder.mockResolvedValue({});
      await caller.orders.reorder({ id: ORDER_ID });
      expect(orderService.reorder).toHaveBeenCalledWith('tenant-1', 'user-1', ORDER_ID);
    });
  });

  // ─── Reviews ─────────────────────────────────────────
  describe('reviews.submit', () => {
    it('delegates to reviewService.submitReview', async () => {
      reviewService.submitReview.mockResolvedValue({ id: REVIEW_ID });
      const input = { productId: PRODUCT_ID, rating: 5 };
      await caller.reviews.submit(input);
      expect(reviewService.submitReview).toHaveBeenCalledWith('tenant-1', 'user-1', input);
    });

    it('rejects rating out of range', async () => {
      await expect(caller.reviews.submit({ productId: PRODUCT_ID, rating: 6 })).rejects.toThrow();
    });
  });

  describe('reviews.list', () => {
    it('delegates to reviewService.getReviews', async () => {
      reviewService.getReviews.mockResolvedValue({ items: [] });
      await caller.reviews.list({ productId: PRODUCT_ID });
      expect(reviewService.getReviews).toHaveBeenCalledWith('tenant-1', expect.objectContaining({
        productId: PRODUCT_ID,
      }));
    });
  });

  describe('reviews.markHelpful', () => {
    it('delegates to reviewService.markHelpful', async () => {
      reviewService.markHelpful.mockResolvedValue({});
      await caller.reviews.markHelpful({ reviewId: REVIEW_ID });
      expect(reviewService.markHelpful).toHaveBeenCalledWith('tenant-1', REVIEW_ID);
    });
  });

  // ─── Addresses ───────────────────────────────────────
  describe('addresses.list', () => {
    it('delegates to addressService.listAddresses', async () => {
      addressService.listAddresses.mockResolvedValue([]);
      await caller.addresses.list();
      expect(addressService.listAddresses).toHaveBeenCalledWith('tenant-1', 'user-1');
    });
  });

  describe('addresses.get', () => {
    it('delegates to addressService.getAddress', async () => {
      addressService.getAddress.mockResolvedValue({});
      await caller.addresses.get({ id: ADDRESS_ID });
      expect(addressService.getAddress).toHaveBeenCalledWith('tenant-1', 'user-1', ADDRESS_ID);
    });
  });

  describe('addresses.create', () => {
    it('delegates to addressService.createAddress', async () => {
      addressService.createAddress.mockResolvedValue({});
      await caller.addresses.create(validAddress);
      expect(addressService.createAddress).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ firstName: 'John' }),
      );
    });

    it('rejects invalid address (missing firstName)', async () => {
      await expect(
        caller.addresses.create({ ...validAddress, firstName: '' } as never),
      ).rejects.toThrow();
    });
  });

  describe('addresses.update', () => {
    it('delegates to addressService.updateAddress', async () => {
      addressService.updateAddress.mockResolvedValue({});
      await caller.addresses.update({ id: ADDRESS_ID, data: { phone: '+911111111111' } });
      expect(addressService.updateAddress).toHaveBeenCalledWith(
        'tenant-1', 'user-1', ADDRESS_ID, { phone: '+911111111111' },
      );
    });
  });

  describe('addresses.delete', () => {
    it('delegates to addressService.deleteAddress', async () => {
      addressService.deleteAddress.mockResolvedValue({});
      await caller.addresses.delete({ id: ADDRESS_ID });
      expect(addressService.deleteAddress).toHaveBeenCalledWith('tenant-1', 'user-1', ADDRESS_ID);
    });
  });

  // ─── Coupons ─────────────────────────────────────────
  describe('coupons.validate', () => {
    it('delegates to couponService.validateCoupon', async () => {
      couponService.validateCoupon.mockResolvedValue({ isValid: true });
      await caller.coupons.validate({ code: 'SAVE10', cartTotalPaise: 50000 });
      expect(couponService.validateCoupon).toHaveBeenCalledWith('tenant-1', 'SAVE10', 50000, 'user-1');
    });
  });

  // ─── Auth ─────────────────────────────────────────────
  it('rejects unauthenticated calls', async () => {
    const unauth = routerInstance.router.createCaller({});
    await expect(unauth.home()).rejects.toThrow();
  });
});
