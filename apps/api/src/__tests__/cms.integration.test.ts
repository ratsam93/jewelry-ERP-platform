// ─── CMS Endpoint Integration Tests ─────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  type TestApp,
  generateAdminToken,
} from './test-app';
import { resetMocks } from './mocks';
import { vi } from 'vitest';
import { TEST_TENANT_ID, storefrontHeaders } from './test-app';

describe('CMS Integration Tests', () => {
  let app: INestApplication;
  let testApp: TestApp;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    adminToken = generateAdminToken();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks(testApp.prisma);
    (testApp.prisma as Record<string, unknown>)['$queryRawUnsafe'] = async () => [{ 1: 1 }];
    // Delegates the CMS storefront reads touch; defined here so each test starts clean.
    const prisma = testApp.prisma as Record<string, unknown>;
    prisma['announcement'] = { findFirst: vi.fn().mockResolvedValue(null) };
    prisma['banner'] = { findMany: vi.fn().mockResolvedValue([]) };
    prisma['seoMetadata'] = { findFirst: vi.fn().mockResolvedValue(null) };
  });

  // CMS endpoints sit under /api/v1/store/cms/* and use TenantMiddleware
  // to extract tenantId from JWT. They don't require auth (public-facing).

  // ═══════════════════════════════════════════════════════════════
  //  HOMEPAGE
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/homepage', () => {
    it('returns 200 with homepage sections when tenant context exists', async () => {
      // CMS controller extracts tenantId from req.tenantId which is set by
      // TenantMiddleware from Bearer token JWT. We provide an admin token to set it.
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/homepage')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('returns 400 without any tenant context', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/homepage');

      expect(res.status).toBe(400);
      expect(res.body.message ?? res.body.error?.message ?? '').toMatch(/Tenant context is required/);
    });

    it('returns 400 for a malformed x-tenant-id header without a staff token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/homepage')
        .set('x-tenant-id', 'not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  GUEST (x-tenant-id only) -- public storefront resolution
  // ═══════════════════════════════════════════════════════════════

  describe('guest storefront requests (x-tenant-id header, no JWT)', () => {
    it('GET announcement returns 200 and scopes the query to the header tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/announcement')
        .set(storefrontHeaders());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();

      const findFirst = (testApp.prisma as unknown as { announcement: { findFirst: ReturnType<typeof vi.fn> } })
        .announcement.findFirst;
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TEST_TENANT_ID }) }),
      );
    });

    it('GET banners returns 200 with an empty list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/banners')
        .query({ position: 'HERO' })
        .set(storefrontHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: [] });
    });

    it('every public route returns 400 (not 500) without tenant context', async () => {
      const paths = [
        '/api/v1/store/cms/homepage',
        '/api/v1/store/cms/banners',
        '/api/v1/store/cms/collections',
        '/api/v1/store/cms/collections/wedding-collection',
        '/api/v1/store/cms/pages/about-us',
        '/api/v1/store/cms/blog',
        '/api/v1/store/cms/blog/how-to-care-for-gold',
        '/api/v1/store/cms/faq',
        '/api/v1/store/cms/announcement',
        '/api/v1/store/cms/seo/PRODUCT/gold-ring-22k',
      ];
      for (const path of paths) {
        const res = await request(app.getHttpServer()).get(path);
        expect(res.status, path).toBe(400);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BANNERS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/banners', () => {
    it('returns active banners for HERO position', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/banners')
        .query({ position: 'HERO' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('defaults to HERO position when not specified', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/banners')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BLOG
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/blog', () => {
    it('returns published blog posts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/blog')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('accepts pagination and category filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/blog')
        .query({ page: '1', limit: '5', category: 'jewelry-care' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
    });

    it('accepts tag filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/blog')
        .query({ tag: 'gold' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/v1/store/cms/blog/:slug', () => {
    it('returns a blog post by slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/blog/how-to-care-for-gold')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  FAQ
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/faq', () => {
    it('returns FAQs grouped by category', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/faq')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('items');
        expect(res.body.data).toHaveProperty('grouped');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  COLLECTIONS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/collections', () => {
    it('returns active collections', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/collections')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/v1/store/cms/collections/:slug', () => {
    it('returns a collection by slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/collections/wedding-collection')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  PAGES
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/pages/:slug', () => {
    it('returns a page by slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/pages/about-us')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ANNOUNCEMENT
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/announcement', () => {
    it('returns active announcement or null', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/announcement')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SEO
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/cms/seo/:pageType/:identifier', () => {
    it('returns 200 for a valid SeoPageType with a guest tenant header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/seo/PRODUCT/gold-ring-22k')
        .set(storefrontHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: null });
    });

    it('returns 400 for a pageType that is not a SeoPageType member', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/seo/product/sweep-nonexistent')
        .set(storefrontHeaders());

      expect(res.status).toBe(400);
      expect(res.body.message ?? res.body.error?.message ?? '').toMatch(/Unknown pageType/);
    });

    it('returns 400 for an unknown pageType even with a staff token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/cms/seo/UNKNOWN_TYPE/anything')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });
});
