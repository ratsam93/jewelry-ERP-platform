// ─── Digital Gold Endpoint Integration Tests ───────────────────
// Customer routes require a verified B2C customer JWT: anonymous and staff
// callers must get 401 (never 500 / cross-customer data), and queries must be
// scoped to the customer/tenant from the token.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  generateAdminToken,
  generateB2CToken,
  TEST_B2C_CUSTOMER,
  TEST_TENANT_ID,
  type TestApp,
} from './test-app';
import { resetMocks } from './mocks';

const BASE = '/api/v1/store/digital-gold';

const RATE_ROW = {
  metalType: 'GOLD',
  purity: 999,
  ratePerGramPaise: BigInt(735000),
  ratePer10gPaise: BigInt(7350000),
  ratePerTolaPaise: BigInt(857304),
  ratePerTroyOzPaise: BigInt(2286000),
  source: 'MANUAL',
  recordedAt: new Date('2026-11-16T10:00:00Z'),
  currencyCode: 'INR',
};

const VAULT_ROW = {
  id: 'vault-001',
  tenantId: TEST_TENANT_ID,
  customerId: TEST_B2C_CUSTOMER.customerId,
  balanceMg: BigInt(2000),
  totalInvestedPaise: BigInt(1000000),
  totalSoldPaise: BigInt(0),
  avgBuyPricePer10gPaise: BigInt(7300000),
  kycVerified: true,
  isActive: true,
};

const SIP_ID = '0a1b2c3d-1111-4222-8333-444455556666';

type Method = 'get' | 'post' | 'put' | 'delete';

/** Every customer-scoped route: [method, path, body?] */
const CUSTOMER_ROUTES: Array<[Method, string, object?]> = [
  ['post', '/buy', { amountPaise: 100000, paymentMethod: 'UPI' }],
  ['post', '/sell', { weightMg: 1000 }],
  ['get', '/vault'],
  ['get', '/portfolio'],
  ['get', '/transactions'],
  [
    'post',
    '/sip',
    {
      sipType: 'FIXED_AMOUNT',
      amountPaise: 100000,
      frequency: 'MONTHLY',
      dayOfMonth: 5,
      startDate: '2027-01-01',
      paymentMethod: 'UPI',
    },
  ],
  ['get', '/sip'],
  ['get', `/sip/${SIP_ID}`],
  ['put', `/sip/${SIP_ID}/pause`],
  ['put', `/sip/${SIP_ID}/resume`],
  ['put', `/sip/${SIP_ID}/cancel`],
  ['get', `/sip/${SIP_ID}/history`],
  ['post', '/redeem', { redemptionType: 'SELL_BACK', weightMg: 1000, addressId: 'addr-1' }],
  ['get', '/redemptions'],
  ['post', '/alerts', { alertType: 'PRICE_BELOW', targetPricePer10gPaise: 7000000 }],
  ['get', '/alerts'],
  ['delete', '/alerts/alert-1'],
];

describe('Digital Gold Integration Tests', () => {
  let app: INestApplication;
  let testApp: TestApp;
  // Prisma delegates not covered by the shared mock factory.
  let goldVault: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  let goldSip: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  let goldPriceAlert: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  let goldTransaction: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  let metalRateHistory: { findMany: ReturnType<typeof vi.fn> };

  const b2c = () => `Bearer ${generateB2CToken()}`;
  const staff = () => `Bearer ${generateAdminToken()}`;

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

    goldVault = { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) };
    goldSip = { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) };
    goldPriceAlert = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
    goldTransaction = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
    metalRateHistory = { findMany: vi.fn().mockResolvedValue([RATE_ROW]) };
    const prisma = testApp.prisma as unknown as Record<string, unknown>;
    prisma['goldVault'] = goldVault;
    prisma['goldSip'] = goldSip;
    prisma['goldPriceAlert'] = goldPriceAlert;
    prisma['goldTransaction'] = goldTransaction;
    prisma['metalRateHistory'] = metalRateHistory;
  });

  // ═══════════════════════════════════════════════════════════════
  //  AUTHENTICATION: every customer-scoped route
  // ═══════════════════════════════════════════════════════════════

  describe('customer routes reject non-customer callers', () => {
    for (const [method, path, body] of CUSTOMER_ROUTES) {
      it(`${method.toUpperCase()} ${path} returns 401 without a token`, async () => {
        const req = request(app.getHttpServer())[method](`${BASE}${path}`);
        const res = body ? await req.send(body) : await req;
        expect(res.status).toBe(401);
      });

      it(`${method.toUpperCase()} ${path} returns 401 with a staff token`, async () => {
        const req = request(app.getHttpServer())
          [method](`${BASE}${path}`)
          .set('Authorization', staff());
        const res = body ? await req.send(body) : await req;
        expect(res.status).toBe(401);
      });
    }

    it('never queries the database for an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get(`${BASE}/vault`);
      await request(app.getHttpServer()).get(`${BASE}/sip`);
      await request(app.getHttpServer()).get(`${BASE}/alerts`);
      expect(goldVault.findUnique).not.toHaveBeenCalled();
      expect(goldSip.findMany).not.toHaveBeenCalled();
      expect(goldPriceAlert.findMany).not.toHaveBeenCalled();
    });

    it('ignores x-tenant-id / x-customer-id headers (identity only from the token)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/sip`)
        .set('x-tenant-id', TEST_TENANT_ID)
        .set('x-customer-id', 'cust-victim');
      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  CUSTOMER ROUTES WITH A B2C TOKEN
  // ═══════════════════════════════════════════════════════════════

  describe('customer routes with a B2C token', () => {
    it('GET /vault returns 200 scoped to the token customer + tenant', async () => {
      goldVault.findUnique.mockResolvedValue(VAULT_ROW);

      const res = await request(app.getHttpServer())
        .get(`${BASE}/vault`)
        .set('Authorization', b2c());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customerId).toBe(TEST_B2C_CUSTOMER.customerId);
      expect(goldVault.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_customerId: {
            tenantId: TEST_TENANT_ID,
            customerId: TEST_B2C_CUSTOMER.customerId,
          },
        },
      });
    });

    it('GET /vault returns an empty-state vault when the customer has no vault yet', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/vault`)
        .set('Authorization', b2c());
      expect(res.status).toBe(200);
      expect(res.body.data.balanceMg).toBe(0);
      expect(res.body.data.totalInvestedPaise).toBe(0);
    });

    it('GET /portfolio and /transactions return empty state when there is no vault', async () => {
      const p = await request(app.getHttpServer())
        .get(`${BASE}/portfolio`)
        .set('Authorization', b2c());
      expect(p.status).toBe(200);
      expect(p.body.data.recentTransactions).toEqual([]);
      expect(p.body.data.vault.balanceMg).toBe(0);
      const t = await request(app.getHttpServer())
        .get(`${BASE}/transactions`)
        .set('Authorization', b2c());
      expect(t.status).toBe(200);
      expect(t.body.data).toEqual([]);
      expect(t.body.meta.total).toBe(0);
    });

    it('GET /sip returns 200 filtered by the token customer', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/sip`)
        .set('Authorization', b2c());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(goldSip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TEST_TENANT_ID, customerId: TEST_B2C_CUSTOMER.customerId },
        }),
      );
    });

    it('GET /sip/:id only finds SIPs owned by the token customer', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/sip/${SIP_ID}`)
        .set('Authorization', b2c());

      expect(res.status).toBe(404);
      expect(goldSip.findFirst).toHaveBeenCalledWith({
        where: { id: SIP_ID, customerId: TEST_B2C_CUSTOMER.customerId, tenantId: TEST_TENANT_ID },
      });
    });

    it('GET /alerts returns 200 filtered by the token customer', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/alerts`)
        .set('Authorization', b2c());

      expect(res.status).toBe(200);
      expect(goldPriceAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TEST_TENANT_ID, customerId: TEST_B2C_CUSTOMER.customerId },
        }),
      );
    });

    it('GET /redemptions returns 200 (empty when no vault)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/redemptions`)
        .set('Authorization', b2c());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /transactions returns 200 for a customer with a vault', async () => {
      goldVault.findUnique.mockResolvedValue(VAULT_ROW);

      const res = await request(app.getHttpServer())
        .get(`${BASE}/transactions`)
        .query({ page: '1', limit: '10' })
        .set('Authorization', b2c());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(goldTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TEST_TENANT_ID, vaultId: 'vault-001' },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('GET /transactions rejects a non-numeric page with 400', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/transactions`)
        .query({ page: 'abc' })
        .set('Authorization', b2c());
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  REDEEM / BUY VALIDATION
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/store/digital-gold/redeem', () => {
    it('returns 400 (not 500) for an invalid redemption type', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/redeem`)
        .set('Authorization', b2c())
        .send({ redemptionType: 'NOT_A_TYPE', weightMg: 1000, addressId: 'addr-1' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for an empty body', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/redeem`)
        .set('Authorization', b2c())
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown properties', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/redeem`)
        .set('Authorization', b2c())
        .send({ redemptionType: 'SELL_BACK', weightMg: 1000, addressId: 'a', customerId: 'cust-victim' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when a JEWELRY redemption has no productId', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/redeem`)
        .set('Authorization', b2c())
        .send({ redemptionType: 'JEWELRY', addressId: 'addr-1' });
      expect(res.status).toBe(400);
    });

    it('validation runs behind auth: invalid body without a token is 401', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/redeem`)
        .send({ redemptionType: 'NOT_A_TYPE' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/store/digital-gold/buy validation', () => {
    it('returns 400 when neither amountPaise nor weightMg is given', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/buy`)
        .set('Authorization', b2c())
        .send({ paymentMethod: 'UPI' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown payment method', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/buy`)
        .set('Authorization', b2c())
        .send({ amountPaise: 100000, paymentMethod: 'CASH' });
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC RATES
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/digital-gold/rates/current', () => {
    it('returns 200 with the current GOLD 999 rate without any auth', async () => {
      const res = await request(app.getHttpServer()).get(`${BASE}/rates/current`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purity).toBe(999);
      expect(res.body.data.ratePer10gPaise).toBe(7350000);
      expect(res.body.data.buyPricePer10gPaise).toBeGreaterThan(res.body.data.sellPricePer10gPaise);
    });
  });

  describe('GET /api/v1/store/digital-gold/rates/history', () => {
    it('accepts date range parameters', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/rates/history`)
        .query({ from: '2026-01-01', to: '2026-03-31' });
      expect(res.status).toBe(200);
    });

    it('works without date range', async () => {
      const res = await request(app.getHttpServer()).get(`${BASE}/rates/history`);
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid date', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/rates/history`)
        .query({ from: 'not-a-date', to: '2026-03-31' });
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD (staff only)
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/digital-gold/dashboard', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(`${BASE}/dashboard`);
      expect(res.status).toBe(401);
    });

    it('returns 401 with a customer token', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/dashboard`)
        .set('Authorization', b2c());
      expect(res.status).toBe(401);
    });
  });
});
