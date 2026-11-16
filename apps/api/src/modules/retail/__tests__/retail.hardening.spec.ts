import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { RetailPricingService } from '../retail.pricing.service';
import { RetailGiftCardService } from '../retail.gift-card.service';
import { RetailRepairService } from '../retail.repair.service';
import { RetailService } from '../retail.service';
import {
  createMockPrismaService,
  createMockEventBusService,
  createMockSale,
  mockTenantContext,
  TEST_LOCATION,
  resetMocks,
} from '../../../__tests__/mocks';

vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 10)) }));

const { tenantId, userId } = mockTenantContext;

describe('GST on making charges', () => {
  const svc = new RetailPricingService(createMockPrismaService() as never);
  const item = (over: Record<string, unknown>) => ({
    description: 'Ring', quantity: 1, unitPricePaise: 1000000, makingChargesPaise: 100000,
    hsnCode: '7113', gstRate: 300, discountPaise: 0, ...over,
  });

  it('taxes metal at 3% and making at 5% intra-state', () => {
    const [r] = svc.calculateTax([item({}) as never], { sourceState: 'MH', destinationState: 'MH' });
    // metal 900000*3% = 27000, making 100000*5% = 5000 => 32000 => 16000 each
    expect(r!.cgstPaise).toBe(16000);
    expect(r!.sgstPaise).toBe(16000);
    expect(r!.igstPaise).toBe(0);
    expect(r!.lineTotalPaise).toBe(1032000);
  });

  it('uses IGST inter-state', () => {
    const [r] = svc.calculateTax([item({}) as never], { sourceState: 'MH', destinationState: 'GJ' });
    expect(r!.igstPaise).toBe(32000);
    expect(r!.cgstPaise + r!.sgstPaise).toBe(0);
  });

  it('apportions discount pro-rata and scales by quantity', () => {
    const [r] = svc.calculateTax(
      [item({ quantity: 2, discountPaise: 200000 }) as never],
      { sourceState: 'MH', destinationState: 'GJ' },
    );
    // base 2,000,000; making 200,000; discount 200,000 => making taxable 180,000, metal 1,620,000
    // tax = 1,620,000*3% + 180,000*5% = 48,600 + 9,000 = 57,600
    expect(r!.igstPaise).toBe(57600);
    expect(r!.lineTotalPaise).toBe(1800000 + 57600);
  });

  it('leaves non-jewelry rates untouched', () => {
    const [r] = svc.calculateTax([item({ gstRate: 1800 }) as never], { sourceState: 'MH', destinationState: 'GJ' });
    expect(r!.igstPaise).toBe(180000);
  });
});

describe('BUY_X_GET_Y', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let svc: RetailPricingService;
  beforeEach(() => {
    prisma = createMockPrismaService();
    svc = new RetailPricingService(prisma as never);
  });

  it('gives the cheapest Y units free per (X+Y) group', () => {
    const r = svc.computeBuyXGetYDiscount(
      { buyQuantity: 2, getQuantity: 1, applicableProducts: null },
      [{ productId: 'a', quantity: 3, unitPricePaise: 5000 }, { productId: 'b', quantity: 3, unitPricePaise: 1000 }],
    );
    // 6 units, group of 3 => 2 free = two cheapest (1000 each)
    expect(r.freeUnits).toBe(2);
    expect(r.discountPaise).toBe(2000);
  });

  it('only counts qualifying products and needs a full group', () => {
    const r = svc.computeBuyXGetYDiscount(
      { buyQuantity: 1, getQuantity: 1, applicableProducts: ['a'] },
      [{ productId: 'a', quantity: 1, unitPricePaise: 5000 }, { productId: 'b', quantity: 5, unitPricePaise: 100 }],
    );
    expect(r.freeUnits).toBe(0);
    expect(r.discountPaise).toBe(0);
  });

  it('is unconfigured without buy/get quantities', () => {
    expect(svc.computeBuyXGetYDiscount({ buyQuantity: null, getQuantity: null, applicableProducts: null }, []).isConfigured).toBe(false);
  });

  it('applyDiscount uses the rule', async () => {
    prisma.discount.findFirst.mockResolvedValue({
      id: 'd1', isActive: true, startDate: new Date(0), endDate: new Date(Date.now() + 1e9),
      usageLimit: null, usedCount: 0, minPurchasePaise: null, maxDiscountPaise: null,
      applicableProducts: null, discountType: 'BUY_X_GET_Y', value: 1, buyQuantity: 1, getQuantity: 1,
    } as never);
    const r = await svc.applyDiscount(tenantId, 'd1', 9000, [], [
      { productId: 'a', quantity: 2, unitPricePaise: 4000 }, { productId: 'b', quantity: 1, unitPricePaise: 1000 },
    ]);
    expect(r.isValid).toBe(true);
    expect(r.applicableAmount).toBe(1000);
  });
});

describe('RetailGiftCardService', () => {
  let tx: { giftCard: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> } };
  let svc: RetailGiftCardService;
  const card = (over: Record<string, unknown> = {}) => ({
    id: 'g1', tenantId, cardNumber: '111', balancePaise: 5000n, initialValuePaise: 5000n,
    customerId: null, status: 'ACTIVE', expiresAt: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  });
  beforeEach(() => {
    tx = { giftCard: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    svc = new RetailGiftCardService(createMockPrismaService() as never);
  });

  it('debits balance and marks USED at zero', async () => {
    tx.giftCard.findFirst.mockResolvedValue(card());
    const r = await svc.redeem(tenantId, userId, '111', 5000, tx as never);
    expect(r.balancePaise).toBe(0);
    expect(r.status).toBe('USED');
    expect(tx.giftCard.updateMany).toHaveBeenCalledTimes(2);
  });

  it('rejects insufficient balance, expired and inactive cards', async () => {
    tx.giftCard.findFirst.mockResolvedValue(card());
    await expect(svc.redeem(tenantId, userId, '111', 6000, tx as never)).rejects.toThrow(BadRequestException);
    tx.giftCard.findFirst.mockResolvedValue(card({ expiresAt: new Date(0) }));
    await expect(svc.redeem(tenantId, userId, '111', 100, tx as never)).rejects.toThrow(/expired/);
    tx.giftCard.findFirst.mockResolvedValue(card({ status: 'CANCELLED' }));
    await expect(svc.redeem(tenantId, userId, '111', 100, tx as never)).rejects.toThrow(BadRequestException);
  });

  it('fails when the guarded debit loses a race', async () => {
    tx.giftCard.findFirst.mockResolvedValue(card());
    tx.giftCard.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.redeem(tenantId, userId, '111', 100, tx as never)).rejects.toThrow(BadRequestException);
  });
});

describe('Repair profitability', () => {
  it('computes revenue minus labor and material', async () => {
    const prisma = createMockPrismaService();
    (prisma as any).repairOrder = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'r1', repairNumber: 'RP/1', status: 'COMPLETED',
        estimatePaise: 100000n, actualCostPaise: 120000n, laborPaise: 30000n, materialPaise: 20000n,
      }),
    };
    const svc = new RetailRepairService(prisma as never, createMockEventBusService() as never);
    const r = await svc.computeRepairProfitability(tenantId, 'r1');
    expect(r.revenuePaise).toBe(120000);
    expect(r.revenueSource).toBe('FINAL_CHARGE');
    expect(r.profitPaise).toBe(70000);
    expect(r.marginBps).toBe(5833);
  });

  it('falls back to estimate; cancelled earns nothing', async () => {
    const prisma = createMockPrismaService();
    const find = vi.fn();
    (prisma as any).repairOrder = { findFirst: find };
    const svc = new RetailRepairService(prisma as never, createMockEventBusService() as never);
    find.mockResolvedValue({ id: 'r', repairNumber: 'x', status: 'QUOTED', estimatePaise: 5000n, actualCostPaise: null, laborPaise: null, materialPaise: null });
    expect((await svc.computeRepairProfitability(tenantId, 'r')).revenueSource).toBe('ESTIMATE');
    find.mockResolvedValue({ id: 'r', repairNumber: 'x', status: 'CANCELLED', estimatePaise: 5000n, actualCostPaise: null, laborPaise: 1000n, materialPaise: 0n });
    const c = await svc.computeRepairProfitability(tenantId, 'r');
    expect(c.revenuePaise).toBe(0);
    expect(c.profitPaise).toBe(-1000);
    expect(c.marginBps).toBeNull();
  });
});

describe('createSale split-payment redemption', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let giftCards: { redeem: ReturnType<typeof vi.fn> };
  let oldGold: { linkToSale: ReturnType<typeof vi.fn> };
  let service: RetailService;
  let eventBus: ReturnType<typeof createMockEventBusService>;

  const input = (payments: unknown[], customerId?: string) => ({
    locationId: 'test-location-id', currencyCode: 'INR', customerId,
    lineItems: [{ description: 'Ring', productId: 'p1', quantity: 1, unitPricePaise: 100000, makingChargesPaise: 0, hsnCode: '7113', gstRate: 300 }],
    payments,
  });

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    prisma.customer.findFirst = vi.fn().mockResolvedValue({ state: TEST_LOCATION.state }) as any;
    prisma.location.findFirst.mockResolvedValue(TEST_LOCATION);
    prisma.sale.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (fn: unknown) => (typeof fn === 'function' ? fn(prisma._tx) : fn));
    const sale = createMockSale();
    prisma._tx.sale.create.mockResolvedValue(sale);
    prisma._tx.saleLineItem.create.mockResolvedValue({});
    prisma._tx.salePayment.create.mockResolvedValue({});
    prisma.sale.findFirst.mockResolvedValue({ ...sale, lineItems: [], payments: [] });
    giftCards = { redeem: vi.fn().mockResolvedValue({}) };
    oldGold = { linkToSale: vi.fn().mockResolvedValue({ finalAmountPaise: 50000, customerId: null }) };
    service = new RetailService(
      prisma as never, (eventBus = createMockEventBusService()) as never, new RetailPricingService(prisma as never),
      { getCurrentRate: vi.fn() } as never, undefined, giftCards as never, oldGold as never,
    );
  });

  it('redeems gift card and old gold inside the transaction', async () => {
    await service.createSale(tenantId, userId, input([
      { method: 'GIFT_CARD', amountPaise: 30000, reference: '111' },
      { method: 'OLD_GOLD', amountPaise: 50000, reference: 'og-1' },
      { method: 'CASH', amountPaise: 30000 },
    ]) as never);
    expect(giftCards.redeem).toHaveBeenCalledWith(tenantId, userId, '111', 30000, prisma._tx);
    expect(oldGold.linkToSale).toHaveBeenCalledWith(tenantId, userId, 'og-1', expect.any(String), prisma._tx);
  });

  it('rejects old gold credit above purchase value', async () => {
    await expect(service.createSale(tenantId, userId, input([
      { method: 'OLD_GOLD', amountPaise: 60000, reference: 'og-1' },
      { method: 'CASH', amountPaise: 50000 },
    ]) as never)).rejects.toThrow(/exceeds purchase value/);
  });

  it('requires references and a customer for loyalty', async () => {
    await expect(service.createSale(tenantId, userId, input([{ method: 'GIFT_CARD', amountPaise: 103000 }]) as never)).rejects.toThrow(/card number/);
    await expect(service.createSale(tenantId, userId, input([{ method: 'LOYALTY_POINTS', amountPaise: 103000 }]) as never)).rejects.toThrow(/identified customer/);
  });

  it('debits loyalty points and writes a ledger row', async () => {
    (prisma._tx as any).loyaltyProgram = { findFirst: vi.fn().mockResolvedValue({ redemptionRate: 100 }) };
    (prisma._tx as any).customer = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({ loyaltyPoints: 400 }),
    };
    (prisma._tx as any).loyaltyTransaction = { create: vi.fn().mockResolvedValue({}) };
    await service.createSale(tenantId, userId, input([
      { method: 'LOYALTY_POINTS', amountPaise: 30000 },
      { method: 'CASH', amountPaise: 73000 },
    ], 'cust-1') as never);
    // 300 rupees at 100 points/rupee = 30000 points
    expect((prisma._tx as any).customer.updateMany.mock.calls[0][0].data.loyaltyPoints).toEqual({ decrement: 30000 });
    expect((prisma._tx as any).loyaltyTransaction.create).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'retail.loyalty.redeemed',
        payload: expect.objectContaining({ customerId: 'cust-1', points: 30000 }),
      }),
    );
  });

  it('fails the sale when loyalty points are insufficient', async () => {
    (prisma._tx as any).loyaltyProgram = { findFirst: vi.fn().mockResolvedValue({ redemptionRate: 1 }) };
    (prisma._tx as any).customer = { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn() };
    await expect(service.createSale(tenantId, userId, input([
      { method: 'LOYALTY_POINTS', amountPaise: 30000 }, { method: 'CASH', amountPaise: 73000 },
    ], 'cust-1') as never)).rejects.toThrow(/Insufficient loyalty/);
  });
});

describe('createSale HUID gate', () => {
  it('blocks gold lines without HUID before the transaction opens (block mode)', async () => {
    const prev = process.env.HUID_ENFORCEMENT;
    process.env.HUID_ENFORCEMENT = 'block';
    try {
      const prisma = createMockPrismaService();
      resetMocks(prisma);
      prisma.location.findFirst.mockResolvedValue(TEST_LOCATION);
      prisma.sale.count.mockResolvedValue(0);
      (prisma.product as any).findMany = vi.fn().mockResolvedValue([
        { id: 'p1', sku: 'G1', productType: 'GOLD', huidNumber: null },
      ]);
      (prisma as any).huidRecord = { findMany: vi.fn().mockResolvedValue([]) };
      const svc = new RetailService(
        prisma as never, createMockEventBusService() as never, new RetailPricingService(prisma as never),
        { getCurrentRate: vi.fn() } as never,
      );
      await expect(svc.createSale(tenantId, userId, {
        locationId: 'test-location-id', currencyCode: 'INR',
        lineItems: [{ description: 'Ring', productId: 'p1', quantity: 1, unitPricePaise: 100000, makingChargesPaise: 0, hsnCode: '7113', gstRate: 300 }],
        payments: [{ method: 'CASH', amountPaise: 103000 }],
      } as never)).rejects.toThrow(/HUID/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.HUID_ENFORCEMENT; else process.env.HUID_ENFORCEMENT = prev;
    }
  });
});
