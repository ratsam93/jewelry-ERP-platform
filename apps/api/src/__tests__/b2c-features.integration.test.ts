// ─── B2C Features Endpoint Integration Tests ───────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  type TestApp,
  storefrontHeaders,
  authenticatedStorefrontHeaders,
  generateAdminToken,
} from './test-app';
import { resetMocks, createMockProduct } from './mocks';

// Staff (admin) token + tenant header. TenantMiddleware resolves req.tenantId
// from staff tokens only, which is what the public B2C routes (compare,
// anonymous back-in-stock) currently read. The B2CAuthGuard rejects it.
function staffHeaders(): Record<string, string> {
  return { ...storefrontHeaders(), Authorization: `Bearer ${generateAdminToken()}` };
}

type MockModel = Record<string, Mock>;

describe('B2C Features Integration Tests', () => {
  let app: INestApplication;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks(testApp.prisma);
    const prisma = testApp.prisma as unknown as Record<string, MockModel | Mock>;
    prisma['$queryRawUnsafe'] = vi.fn().mockResolvedValue([{ 1: 1 }]);

    // Models the B2C and storefront services touch. Not part of the shared
    // mock factory, so they are declared here for this file only.
    prisma['wishlist'] = {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(3),
      create: vi.fn().mockResolvedValue({ id: 'wl-1' }),
      upsert: vi.fn().mockResolvedValue({ id: 'wl-1' }),
      update: vi.fn().mockResolvedValue({ id: 'wl-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'wl-1' }),
    };
    prisma['priceAlert'] = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'pa-1' }),
      update: vi.fn().mockResolvedValue({ id: 'pa-1' }),
    };
    prisma['compareList'] = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'cl-1', productIds: [] }),
      update: vi.fn().mockResolvedValue({ id: 'cl-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'cl-1' }),
    };
    prisma['backInStockAlert'] = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'bis-1', status: 'ACTIVE' }),
      update: vi.fn().mockResolvedValue({ id: 'bis-1', status: 'CANCELLED' }),
    };
    prisma['couponCode'] = {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    };
    prisma['couponUsage'] = {
      count: vi.fn().mockResolvedValue(0),
    };
    (testApp.prisma.product.findFirst as Mock).mockResolvedValue(createMockProduct());
  });

  // ═══════════════════════════════════════════════════════════════
  //  WISHLIST (customer routes; storefront controller shares the paths)
  // ═══════════════════════════════════════════════════════════════

  describe('Wishlist - B2cFeaturesController', () => {
    it('GET /api/v1/store/wishlist requires customer auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/wishlist')
        .set(storefrontHeaders());

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/store/wishlist adds item for an authenticated customer', async () => {
      const productId = uuid();
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/wishlist')
        .set(authenticatedStorefrontHeaders())
        .send({ productId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/store/wishlist rejects guests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/wishlist')
        .set(storefrontHeaders())
        .send({ productId: uuid() });

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/store/wishlist rejects admin tokens with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/wishlist')
        .set(staffHeaders())
        .send({ productId: uuid() });

      expect(res.status).toBe(401);
    });

    it('DELETE /api/v1/store/wishlist/:productId removes item for an authenticated customer', async () => {
      const productId = uuid();
      (testApp.prisma as unknown as Record<string, MockModel>)['wishlist']!['findUnique'] = vi
        .fn()
        .mockResolvedValue({ id: 'wl-1', productId });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/store/wishlist/${productId}`)
        .set(authenticatedStorefrontHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/store/wishlist/:productId/price-alert enables alert for an authenticated customer', async () => {
      const productId = uuid();
      (testApp.prisma as unknown as Record<string, MockModel>)['wishlist']!['findUnique'] = vi
        .fn()
        .mockResolvedValue({ id: 'wl-1', productId });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/store/wishlist/${productId}/price-alert`)
        .set(authenticatedStorefrontHeaders())
        .send({ targetPricePaise: 450000 });

      expect(res.status).toBe(201);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  COMPARE (public; tenant from TenantMiddleware, optional sessionId)
  // ═══════════════════════════════════════════════════════════════

  describe('Compare Products', () => {
    it('POST /api/v1/store/compare adds product to compare list', async () => {
      const productId = uuid();
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/compare')
        .set(staffHeaders())
        .send({ productId, sessionId: 'test-session-001' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/store/compare accepts a guest with x-tenant-id and sessionId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/compare')
        .set(storefrontHeaders())
        .send({ productId: uuid(), sessionId: 'test-session-001' });

      expect(res.status).toBe(201);
    });

    it('GET /api/v1/store/compare returns the B2C session comparison list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/compare')
        .query({ sessionId: 'test-session-001' })
        .set(staffHeaders());

      expect(res.status).toBe(200);
    });

    it('DELETE /api/v1/store/compare/:productId removes from compare', async () => {
      const productId = uuid();
      (testApp.prisma as unknown as Record<string, MockModel>)['compareList']!['findFirst'] = vi
        .fn()
        .mockResolvedValue({ id: 'cl-1', productIds: [productId, uuid()] });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/store/compare/${productId}`)
        .query({ sessionId: 'test-session-001' })
        .set(staffHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/v1/store/compare clears entire compare list', async () => {
      (testApp.prisma as unknown as Record<string, MockModel>)['compareList']!['findFirst'] = vi
        .fn()
        .mockResolvedValue({ id: 'cl-1', productIds: [uuid()] });

      const res = await request(app.getHttpServer())
        .delete('/api/v1/store/compare')
        .query({ sessionId: 'test-session-001' })
        .set(staffHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  COUPONS
  // ═══════════════════════════════════════════════════════════════

  describe('Coupons - B2cFeaturesController', () => {
    it('POST /api/v1/store/coupons/validate is served by the storefront controller for guests', async () => {
      // Shadowed: the storefront controller also declares POST coupons/validate
      // and is registered first, so the B2C customer guard is not applied here.
      // POST defaults to 201 in Nest.
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/coupons/validate')
        .set(storefrontHeaders())
        .send({ code: 'SUMMER2026', cartTotalPaise: 500000 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/store/coupons/auto-apply returns best coupons for an authenticated customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/coupons/auto-apply')
        .set(authenticatedStorefrontHeaders())
        .send({
          cartTotalPaise: 500000,
          cartItems: [{ productId: uuid(), pricePaise: 500000, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // No auto-apply coupons configured: service returns null (best coupon or null)
      expect(res.body.data).toBeNull();
    });

    it('POST /api/v1/store/coupons/auto-apply rejects guests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/coupons/auto-apply')
        .set(storefrontHeaders())
        .send({ cartTotalPaise: 500000, cartItems: [] });

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/store/coupons/auto-apply rejects admin tokens with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/coupons/auto-apply')
        .set(staffHeaders())
        .send({ cartTotalPaise: 500000, cartItems: [] });

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BACK IN STOCK
  // ═══════════════════════════════════════════════════════════════

  describe('Back In Stock Subscriptions', () => {
    it('POST /api/v1/store/back-in-stock/subscribe creates subscription', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/back-in-stock/subscribe')
        .set(staffHeaders())
        .send({
          productId: uuid(),
          email: 'notify@example.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    // Known production gap: same tenant resolution issue as compare. A guest
    // with x-tenant-id gets 400 instead of creating an anonymous subscription.
    it('POST /api/v1/store/back-in-stock/subscribe accepts an anonymous guest with x-tenant-id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/back-in-stock/subscribe')
        .set(storefrontHeaders())
        .send({ productId: uuid(), email: 'notify@example.com' });

      expect(res.status).toBe(201);
    });

    it('DELETE /api/v1/store/back-in-stock/:alertId unsubscribes', async () => {
      const alertId = uuid();
      (testApp.prisma as unknown as Record<string, MockModel>)['backInStockAlert']!['findFirst'] = vi
        .fn()
        .mockResolvedValue({ id: alertId, customerId: null, status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/store/back-in-stock/${alertId}`)
        .set(staffHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE /api/v1/store/back-in-stock/:alertId returns 404 for unknown alert', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/store/back-in-stock/${uuid()}`)
        .set(staffHeaders());

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/store/back-in-stock requires customer auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/back-in-stock')
        .set(storefrontHeaders());

      expect(res.status).toBe(401);
    });

    it('GET /api/v1/store/back-in-stock rejects admin tokens with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/back-in-stock')
        .set(staffHeaders());

      expect(res.status).toBe(401);
    });

    it('GET /api/v1/store/back-in-stock returns subscriptions for an authenticated customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/back-in-stock')
        .set(authenticatedStorefrontHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  WISHLIST COUNT
  // ═══════════════════════════════════════════════════════════════

  describe('Wishlist Count', () => {
    it('GET /api/v1/store/wishlist/count requires customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/wishlist/count')
        .set(storefrontHeaders());

      expect(res.status).toBe(401);
    });

    it('GET /api/v1/store/wishlist/count rejects admin tokens with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/wishlist/count')
        .set(staffHeaders());

      expect(res.status).toBe(401);
    });

    it('GET /api/v1/store/wishlist/count returns count for an authenticated customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/wishlist/count')
        .set(authenticatedStorefrontHeaders());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ count: 3 });
    });
  });
});
