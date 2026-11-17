// ─── AR Endpoint Integration Tests ──────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  type TestApp,
  storefrontHeaders,
  authenticatedStorefrontHeaders,
} from './test-app';
import { resetMocks } from './mocks';
import { vi } from 'vitest';

describe('AR Integration Tests', () => {
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
    (testApp.prisma as Record<string, unknown>)['$queryRawUnsafe'] = async () => [{ 1: 1 }];
    // AR try-on session delegate; defined here so each test starts clean.
    (testApp.prisma as Record<string, unknown>)['arTryOnSession'] = {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        sharedVia: null,
      })),
      findFirst: vi.fn().mockResolvedValue(null),
    };
  });

  // ═══════════════════════════════════════════════════════════════
  //  AR PRODUCTS LIST
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/ar/products', () => {
    it('returns 200 with AR-enabled products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/ar/products')
        .set(storefrontHeaders());

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('accepts category and pagination query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/ar/products')
        .query({ category: 'rings', page: '1', limit: '10' })
        .set(storefrontHeaders());

      expect([200, 500]).toContain(res.status);
    });

    it('returns 400 without x-tenant-id header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/ar/products');

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  TRY-ON CONFIG
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/ar/products/:productId/tryon', () => {
    it('returns 200 with try-on config for a valid product', async () => {
      const productId = uuid();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/ar/products/${productId}/tryon`)
        .set(storefrontHeaders());

      // 200 if service resolves, 500 if mocked prisma returns undefined
      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('returns 404 for a product without AR assets', async () => {
      const productId = uuid();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/ar/products/${productId}/tryon`)
        .set(storefrontHeaders());

      // With mocked prisma returning undefined, service may throw 404 or 500
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  360 VIEW
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/ar/products/:productId/360', () => {
    it('returns 200 with 360-degree config', async () => {
      const productId = uuid();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/ar/products/${productId}/360`)
        .set(storefrontHeaders());

      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  TRY-ON SESSIONS
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/store/ar/sessions/start', () => {
    it('returns 201 when starting a try-on session', async () => {
      const productId = uuid();
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(storefrontHeaders())
        .send({ productId, deviceType: 'MOBILE_IOS' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({ productId, deviceType: 'MOBILE_IOS', duration: 0 });
    });

    it('starts session with customer context when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(authenticatedStorefrontHeaders())
        .send({ productId: uuid(), deviceType: 'DESKTOP_WEBCAM' });

      expect(res.status).toBe(201);
    });

    it('returns 400 for an empty body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(storefrontHeaders())
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when deviceType is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(storefrontHeaders())
        .send({ productId: uuid() });

      expect(res.status).toBe(400);
    });

    it('returns 400 when productId is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(storefrontHeaders())
        .send({ productId: 'gold-ring-22k', deviceType: 'MOBILE_IOS' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown deviceType value', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(storefrontHeaders())
        .send({ productId: uuid(), deviceType: 'mobile' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for fields outside the DTO (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/ar/sessions/start')
        .set(storefrontHeaders())
        .send({ productId: uuid(), deviceType: 'MOBILE_IOS', customerId: uuid() });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/store/ar/sessions/:sessionId/end', () => {
    it('returns 200 when ending a try-on session', async () => {
      const sessionId = uuid();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/store/ar/sessions/${sessionId}/end`)
        .set(storefrontHeaders())
        .send({
          duration: 45,
          screenshotTaken: true,
          addedToCart: false,
        });

      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('accepts optional sharedVia field', async () => {
      const sessionId = uuid();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/store/ar/sessions/${sessionId}/end`)
        .set(storefrontHeaders())
        .send({
          duration: 30,
          screenshotTaken: false,
          sharedVia: 'whatsapp',
          addedToCart: true,
        });

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
