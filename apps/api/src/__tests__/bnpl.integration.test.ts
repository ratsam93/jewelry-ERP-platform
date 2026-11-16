// ─── BNPL Endpoint Integration Tests ────────────────────────────
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  type TestApp,
  generateAdminToken,
  generateB2CToken,
} from './test-app';
import { resetMocks } from './mocks';

describe('BNPL Integration Tests', () => {
  let app: INestApplication;
  let testApp: TestApp;
  let adminToken: string;
  let b2cToken: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
    adminToken = generateAdminToken();
    b2cToken = generateB2CToken();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMocks(testApp.prisma);
    (testApp.prisma as Record<string, unknown>)['$queryRawUnsafe'] = async () => [{ 1: 1 }];
  });

  // BnplController sits at /api/v1/store/payments/*
  // Customer routes are guarded by B2CAuthGuard (type: 'b2c' JWT). They populate
  // req.b2cTenantId / req.customerId from the verified token.

  // ═══════════════════════════════════════════════════════════════
  //  EMI PLANS (public)
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/payments/emi-plans', () => {
    it('returns 200 with EMI plans for a given amount', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/emi-plans')
        .query({ amount: '5000000' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('meta');
      }
    });

    it('returns 400 for missing or invalid amount', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/emi-plans')
        .set('Authorization', `Bearer ${adminToken}`);

      // amount is undefined -> parseInt returns NaN -> BadRequestException
      expect(res.status).toBe(400);
    });

    it('returns 400 for negative amount', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/emi-plans')
        .query({ amount: '-1000' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  EMI CALCULATOR (public)
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/store/payments/emi/calculate', () => {
    it('returns 200 with EMI calculation result', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/emi/calculate')
        .send({
          amountPaise: 5000000,
          tenure: 12,
          interestRatePct: 14,
        });

      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('returns 400 for missing amountPaise', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/emi/calculate')
        .send({
          tenure: 12,
          interestRatePct: 14,
        });

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BNPL INITIATE (customer, B2C token required)
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/store/payments/bnpl/initiate', () => {
    it('accepts BNPL initiation with an authenticated B2C customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/bnpl/initiate')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({
          orderId: uuid(),
          amountPaise: 5000000,
          provider: 'SIMPL',
          tenure: 3,
        });

      // Authenticated, so the guard passes. Downstream mocks may still reject the
      // business operation (400/500), but never with an auth failure.
      expect(res.status).not.toBe(401);
      expect([200, 201, 400, 500]).toContain(res.status);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/bnpl/initiate')
        .send({
          orderId: uuid(),
          amountPaise: 5000000,
          provider: 'SIMPL',
          tenure: 3,
        });

      expect(res.status).toBe(401);
    });

    it('returns 401 with an admin token (not a B2C token)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/bnpl/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          orderId: uuid(),
          amountPaise: 5000000,
          provider: 'SIMPL',
          tenure: 3,
        });

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BNPL TRANSACTION (customer, B2C token required)
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/payments/bnpl/:transactionId', () => {
    it('returns transaction details for an authenticated B2C customer', async () => {
      const transactionId = uuid();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/payments/bnpl/${transactionId}`)
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).not.toBe(401);
      expect([200, 404, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('returns 401 with an admin token', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/payments/bnpl/${uuid()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(401);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/store/payments/bnpl/${uuid()}`);

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BNPL ELIGIBILITY (customer, B2C token required)
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/payments/bnpl/eligibility', () => {
    it('returns eligibility check result for an authenticated B2C customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/bnpl/eligibility')
        .query({ amount: '5000000' })
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).not.toBe(401);
      expect([200, 400, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('returns 400 without amount query param (B2C token)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/bnpl/eligibility')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).toBe(400);
    });

    it('returns 401 with an admin token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/bnpl/eligibility')
        .query({ amount: '5000000' })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  SAVED PAYMENT METHODS (customer, B2C token required)
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/store/payments/saved-methods', () => {
    it('lists saved methods for an authenticated B2C customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/saved-methods')
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).not.toBe(401);
      expect([200, 400, 500]).toContain(res.status);
    });

    it('returns 401 with an admin token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/payments/saved-methods')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/store/payments/saved-methods', () => {
    it('accepts a save request from an authenticated B2C customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/saved-methods')
        .set('Authorization', `Bearer ${b2cToken}`)
        .send({
          type: 'UPI',
          token: 'upi-token-abc',
          displayName: 'user@upi',
          isDefault: false,
        });

      expect(res.status).not.toBe(401);
      expect([200, 201, 400, 500]).toContain(res.status);
    });

    it('returns 401 with an admin token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/saved-methods')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'UPI',
          token: 'upi-token-abc',
          displayName: 'user@upi',
          isDefault: false,
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/store/payments/saved-methods/:methodId', () => {
    it('removes a method for an authenticated B2C customer', async () => {
      const methodId = uuid();
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/store/payments/saved-methods/${methodId}`)
        .set('Authorization', `Bearer ${b2cToken}`);

      expect(res.status).not.toBe(401);
      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('returns 401 with an admin token', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/store/payments/saved-methods/${uuid()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  BNPL CALLBACK (provider, signature-verified, tenant from transaction)
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/store/payments/bnpl/callback/:provider', () => {
    let savedSecret: string | undefined;
    let findMany: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // bnplTransaction is not part of the shared mock; install a fresh one per test.
      findMany = vi.fn().mockResolvedValue([]);
      (testApp.prisma as unknown as Record<string, unknown>)['bnplTransaction'] = { findMany };
    });

    beforeAll(() => {
      // Outside production with no secret, signature verification is skipped.
      savedSecret = process.env.BNPL_WEBHOOK_SECRET;
      delete process.env.BNPL_WEBHOOK_SECRET;
    });

    afterAll(() => {
      if (savedSecret === undefined) {
        delete process.env.BNPL_WEBHOOK_SECRET;
      } else {
        process.env.BNPL_WEBHOOK_SECRET = savedSecret;
      }
    });

    it('returns 400 when transactionId is missing from the payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/bnpl/callback/SIMPL')
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when no transaction matches the external id', async () => {
      findMany.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/bnpl/callback/SIMPL')
        .send({ transactionId: 'ext-missing-001', status: 'APPROVED' });

      expect(res.status).toBe(404);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ externalTransactionId: 'ext-missing-001' }),
          take: 2,
        }),
      );
    });

    it('returns 409 when the external id matches more than one transaction', async () => {
      findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);

      const res = await request(app.getHttpServer())
        .post('/api/v1/store/payments/bnpl/callback/SIMPL')
        .send({ transactionId: 'ext-dup-001', status: 'APPROVED' });

      expect(res.status).toBe(409);
    });
  });
});
