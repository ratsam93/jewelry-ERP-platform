// ─── Compare list REST route: BigInt money fields ──────────────
// Regression: GET /api/v1/store/compare returned 500 "Do not know how to
// serialize a BigInt" once the list was non-empty. Prisma rows carry BigInt
// money/weight columns; REST must emit them as decimal strings.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import request from 'supertest';
import { v4 as uuid } from 'uuid';
import type { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  type TestApp,
  storefrontHeaders,
  authenticatedStorefrontHeaders,
  TEST_TENANT_ID,
} from '../../../__tests__/test-app';
import { resetMocks } from '../../../__tests__/mocks';
import { installBigIntJson } from '../../../common/bigint-json';

// main.ts installs this at boot; the test app is built by Test.createTestingModule,
// so the test installs it the same way.
installBigIntJson();

type MockModel = Record<string, Mock>;

describe('GET /api/v1/store/compare (BigInt serialization)', () => {
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
    // compareList is not part of the shared mock factory; declared for this file.
    prisma['compareList'] = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'cl-1', productIds: [] }),
      update: vi.fn().mockResolvedValue({ id: 'cl-1' }),
      delete: vi.fn().mockResolvedValue({ id: 'cl-1' }),
    };
  });

  it('returns 200 with BigInt money fields serialized as strings', async () => {
    const productA = uuid();
    const productB = uuid();
    const prisma = testApp.prisma as unknown as Record<string, MockModel>;

    prisma['compareList']!['findFirst'] = vi
      .fn()
      .mockResolvedValue({ id: 'cl-1', productIds: [productA, productB] });
    prisma['product']!['findMany'] = vi.fn().mockResolvedValue([
      {
        id: productB,
        name: 'Gold Bangle',
        sku: 'GB-002',
        productType: 'JEWELLERY',
        metalPurity: 22,
        metalWeightMg: 12000n,
        grossWeightMg: 12500n,
        netWeightMg: 12000n,
        makingCharges: 150000n,
        sellingPricePaise: 90000000000000000000n,
        images: [],
        attributes: {},
        category: { name: 'Bangles' },
      },
      {
        id: productA,
        name: 'Gold Ring',
        sku: 'GR-001',
        productType: 'JEWELLERY',
        metalPurity: 22,
        metalWeightMg: 3000n,
        grossWeightMg: 3200n,
        netWeightMg: 3000n,
        makingCharges: 0n,
        sellingPricePaise: 4500000n,
        images: [],
        attributes: {},
        category: null,
      },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/store/compare')
      .query({ sessionId: 'test-session-001' })
      .set(storefrontHeaders());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const products = res.body.data.products;
    // Order follows productIds (A then B), not the findMany order.
    expect(products.map((p: { id: string }) => p.id)).toEqual([productA, productB]);

    const [ring, bangle] = products;
    expect(ring.sellingPricePaise).toBe('4500000');
    expect(ring.makingCharges).toBe('0');
    expect(ring.metalWeightMg).toBe('3000');
    expect(ring.grossWeightMg).toBe('3200');
    expect(ring.netWeightMg).toBe('3000');
    expect(bangle.sellingPricePaise).toBe('90000000000000000000');
    expect(bangle.makingCharges).toBe('150000');
    expect(bangle.categoryName).toBe('Bangles');
    expect(ring.categoryName).toBeNull();
  });

  it('returns 200 with an empty list when nothing is compared', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/store/compare')
      .query({ sessionId: 'test-session-001' })
      .set(storefrontHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
  });

  describe('identity (guest vs signed-in customer)', () => {
    const cm = () => (testApp.prisma as unknown as Record<string, MockModel>)['compareList']!;
    beforeEach(() => {
      (testApp.prisma as unknown as Record<string, MockModel>)['product']!['findFirst'] = vi
        .fn()
        .mockResolvedValue({ id: 'p1', productType: 'JEWELLERY' });
    });

    it('guest POST keys the list by sessionId with no customerId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/compare')
        .set(storefrontHeaders())
        .send({ productId: uuid() });
      expect(res.status).toBe(201);
      const data = cm()['create']!.mock.calls[0]![0].data;
      expect(data.sessionId).toBe('test-session-001');
      expect(data.customerId).toBeUndefined();
    });

    it('signed-in POST saves the list under the token customerId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/compare')
        .set(authenticatedStorefrontHeaders('cust-A'))
        .send({ productId: uuid() });
      expect(res.status).toBe(201);
      expect(cm()['create']!.mock.calls[0]![0].data.customerId).toBe('cust-A');
    });

    it('signed-in GET looks up the list by customerId (Bearer only, no tenant header)', async () => {
      const headers = { ...authenticatedStorefrontHeaders('cust-A') } as Record<string, string>;
      delete headers['x-tenant-id'];
      const res = await request(app.getHttpServer()).get('/api/v1/store/compare').set(headers);
      expect(res.status).toBe(200);
      expect(cm()['findFirst']!.mock.calls[0]![0].where).toEqual({
        tenantId: TEST_TENANT_ID,
        customerId: 'cust-A',
      });
    });

    it('customer B never reads the list of customer A, and x-customer-id is ignored', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/store/compare')
        .set({ ...authenticatedStorefrontHeaders('cust-B'), 'x-customer-id': 'cust-A' });
      expect(cm()['findFirst']!.mock.calls[0]![0].where.customerId).toBe('cust-B');
    });

    it('x-customer-id without a token does not identify a customer', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/store/compare')
        .set(storefrontHeaders({ 'x-customer-id': 'cust-A' }));
      expect(cm()['findFirst']!.mock.calls[0]![0].where).toEqual({
        tenantId: TEST_TENANT_ID,
        sessionId: 'test-session-001',
      });
    });

    it('returns 400 when neither a customer nor a session is available', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/store/compare')
        .set({ 'x-tenant-id': TEST_TENANT_ID })
        .send({ productId: uuid() });
      expect(res.status).toBe(400);
    });

    it('reports a malformed x-tenant-id as Invalid tenant id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/store/compare')
        .set({ 'x-tenant-id': 'not-a-uuid', 'x-session-id': 's1' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Invalid tenant id');
    });
  });
});
