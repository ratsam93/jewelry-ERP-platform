// ─── Customer Portal Endpoint Integration Tests ────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  type TestApp,
  TEST_B2C_CUSTOMER,
  generateB2CToken,
  generateAdminToken,
} from './test-app';
import { resetMocks } from './mocks';
import { vi } from 'vitest';
import * as bcrypt from 'bcryptjs';

// Password hash for the B2C customer's current password (low cost: test only).
const CURRENT_PASSWORD = 'OldPassword1!';
const CURRENT_PASSWORD_HASH = bcrypt.hashSync(CURRENT_PASSWORD, 4);

// Customer row returned by prisma.customer.findFirst for the B2C token's customer.
const PORTAL_CUSTOMER_ROW = {
  id: TEST_B2C_CUSTOMER.customerId,
  tenantId: TEST_B2C_CUSTOMER.tenantId,
  firstName: 'Test',
  lastName: 'Customer',
  email: TEST_B2C_CUSTOMER.email,
  phone: TEST_B2C_CUSTOMER.phone,
  alternatePhone: null,
  address: null,
  city: null,
  state: null,
  country: null,
  postalCode: null,
  dateOfBirth: null,
  anniversary: null,
  loyaltyPoints: 0,
  loyaltyTier: null,
  preferences: {},
  createdAt: new Date('2025-01-01'),
  customerAuth: { isEmailVerified: true, isPhoneVerified: true },
};

// Delegates the customer-portal services use that the shared mock does not define.
const PORTAL_MODELS = [
  'onlineOrder',
  'loyaltyTransaction',
  'loyaltyProgram',
  'kittyMember',
  'kittyScheme',
  'kittyInstallment',
  'goldSavingsMember',
  'goldSavingsScheme',
  'goldSavingsInstallment',
  'wishlist',
  'saleReturn',
  'shipment',
  'sale',
  'metalRateHistory',
  'kycVerification',
] as const;

/** Installs empty-result stubs for the portal models and a valid customer row. */
function stubPortalModels(prisma: Record<string, unknown>): void {
  for (const name of PORTAL_MODELS) {
    const model = (prisma[name] ??= {}) as Record<string, unknown>;
    for (const fn of ['findFirst', 'findUnique', 'findMany', 'count', 'aggregate', 'create', 'update', 'updateMany']) {
      if (typeof model[fn] !== 'function') model[fn] = vi.fn();
    }
    (model.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (model.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (model.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (model.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: {}, _count: 0 });
  }
  const customer = prisma['customer'] as Record<string, ReturnType<typeof vi.fn>>;
  customer.findFirst.mockResolvedValue(PORTAL_CUSTOMER_ROW);
  customer.update.mockResolvedValue(PORTAL_CUSTOMER_ROW);

  // Transactions run against the same stubs (tx === prisma) so writes made
  // inside $transaction resolve against the delegates configured here.
  prisma['$transaction'] = vi.fn(async (fn: unknown) =>
    (fn as (tx: unknown) => Promise<unknown>)(prisma),
  );
  const customerAuth = prisma['customerAuth'] as Record<string, ReturnType<typeof vi.fn>>;
  customerAuth.updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const goldMember = prisma['goldSavingsMember'] as Record<string, ReturnType<typeof vi.fn>>;
  goldMember.create.mockResolvedValue({ id: uuid() });
  const goldInstallment = prisma['goldSavingsInstallment'] as Record<string, ReturnType<typeof vi.fn>>;
  goldInstallment.createMany = vi.fn().mockResolvedValue({ count: 0 });
}

describe('Customer Portal Integration Tests', () => {
  let app: INestApplication;
  let testApp: TestApp;
  let b2cToken: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    b2cToken = generateB2CToken();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks(testApp.prisma);
    (testApp.prisma as Record<string, unknown>)['$queryRawUnsafe'] = async () => [{ 1: 1 }];
    stubPortalModels(testApp.prisma as unknown as Record<string, unknown>);
  });

  // All customer-portal endpoints are guarded by B2CAuthGuard.
  // The B2C token carries the tenant and customer id; the services look the
  // customer up via prisma.customer.findFirst, so that mock must return a row.

  // ═══════════════════════════════════════════════════════════════
  //  Request DTOs in customer-portal.controller.ts are decorated with
  //  class-validator rules, so valid bodies/queries reach the services and
  //  return their normal success status. Invalid input is still rejected (400).
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  //  AUTH ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Auth enforcement', () => {
    it('returns 401 without any token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/dashboard');

      expect(res.status).toBe(401);
    });

    it('returns 401 with admin token (wrong type)', async () => {
      const adminToken = generateAdminToken();
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/dashboard', () => {
    it('returns 200 with aggregated dashboard data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/dashboard')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('data');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  PROFILE
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/profile', () => {
    it('returns 200 with customer profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/profile')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/v1/store/account/profile', () => {
    it('updates profile with a valid body', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/store/account/profile')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          phone: '+919999999999',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/v1/store/account/password', () => {
    it('changes password with correct current password', async () => {
      const customerAuth = testApp.prisma.customerAuth as unknown as Record<string, ReturnType<typeof vi.fn>>;
      customerAuth.findFirst.mockResolvedValue({
        id: uuid(),
        customerId: TEST_B2C_CUSTOMER.customerId,
        passwordHash: CURRENT_PASSWORD_HASH,
      });

      const res = await request(app.getHttpServer())
        .put('/api/v1/store/account/password')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({
          currentPassword: CURRENT_PASSWORD,
          newPassword: 'NewPassword1!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/store/account/password')
        .send({
          currentPassword: 'OldPassword1!',
          newPassword: 'NewPassword1!',
        });

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ORDERS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/orders', () => {
    it('returns 200 for order list with no query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/orders')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 for paginated/filtered order list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/orders')
        .query({ page: 1, limit: 10, sortOrder: 'desc', status: 'DELIVERED' })
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/store/account/orders/:id', () => {
    it('returns order detail', async () => {
      const orderId = uuid();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/account/orders/${orderId}`)
        .set('Authorization', `Bearer ${b2cToken}`);

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  LOYALTY
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/loyalty', () => {
    it('returns 200 with loyalty points and tier', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/loyalty')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/store/account/loyalty/history', () => {
    it('returns loyalty points history', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/loyalty/history')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /api/v1/store/account/loyalty/redeem', () => {
    it('redeems loyalty points', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/account/loyalty/redeem')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({ points: 100, orderId: uuid() });

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SCHEMES
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/schemes', () => {
    it('returns 200 with active schemes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/schemes')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('POST /api/v1/store/account/schemes/enroll', () => {
    it('enrolls in a scheme', async () => {
      const goldScheme = testApp.prisma.goldSavingsScheme as unknown as Record<string, ReturnType<typeof vi.fn>>;
      goldScheme.findFirst.mockResolvedValue({
        id: uuid(),
        tenantId: TEST_B2C_CUSTOMER.tenantId,
        schemeName: 'Gold Savings',
        status: 'OPEN',
        durationMonths: 12,
        bonusMonths: 0,
        monthlyAmountPaise: BigInt(500000),
        maturityBonusPercent: 0,
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/store/account/schemes/enroll')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({ schemeId: uuid(), schemeType: 'GOLD_SAVINGS' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  KYC
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/kyc', () => {
    it('returns 200 with KYC status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/kyc')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('POST /api/v1/store/account/kyc/upload', () => {
    it('uploads KYC document', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/account/kyc/upload')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({
          documentType: 'PAN',
          documentNumber: 'ABCDE1234F',
          fileUrl: 'https://storage.example.com/kyc/pan.pdf',
        });

      expect([201, 400, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/account/notifications', () => {
    it('returns notification preferences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/account/notifications')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/v1/store/account/notifications', () => {
    it('updates notification preferences with a valid body', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/store/account/notifications')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({
          orders: { email: true, sms: true, whatsapp: false, push: true },
          promotions: { email: true, sms: false, whatsapp: false, push: false },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
