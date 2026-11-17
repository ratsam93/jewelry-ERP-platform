import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetailService } from '../retail.service';
import { RetailPricingService } from '../retail.pricing.service';
import {
  createMockPrismaService,
  createMockEventBusService,
  createMockSale,
  mockTenantContext,
  TEST_LOCATION,
  resetMocks,
  capturePublishedEvents,
} from '../../../__tests__/mocks';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 10)),
}));

// HK-RET-01 (customer name on sale responses) and HK-POS-02 (stock decrement atomic with the sale).
describe('RetailService sale customer + stock', () => {
  let service: RetailService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let eventBus: ReturnType<typeof createMockEventBusService>;
  const { tenantId, userId } = mockTenantContext;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    eventBus = createMockEventBusService();
    capturePublishedEvents(eventBus);
    prisma.customer.findFirst = vi.fn() as never;
    service = new RetailService(
      prisma as never,
      eventBus as never,
      new RetailPricingService(prisma as never),
      { getCurrentRate: vi.fn() } as never,
    );
    eventBus.publishedEvents = [];
  });

  describe('customer name on sale responses', () => {
    it('getSale returns customerName and customerPhone from the customer relation', async () => {
      prisma.sale.findFirst.mockResolvedValue(
        createMockSale({
          customerId: 'cust-1',
          customer: { firstName: 'Priya', lastName: 'Sharma', phone: '+919800000001' },
        }),
      );
      const res = await service.getSale(tenantId, 'sale-1');
      expect(res.customerId).toBe('cust-1');
      expect(res.customerName).toBe('Priya Sharma');
      expect(res.customerPhone).toBe('+919800000001');
      expect(prisma.sale.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ customer: expect.anything() }) }),
      );
    });

    it('listSales returns customerName per row and null for walk-in', async () => {
      prisma.sale.findMany.mockResolvedValue([
        createMockSale({ id: 'a', customerId: 'c1', customer: { firstName: 'Priya', lastName: 'Sharma', phone: null } }),
        createMockSale({ id: 'b', customer: null }),
      ]);
      prisma.sale.count.mockResolvedValue(2);
      const res = await service.listSales(tenantId, {} as never, { page: 1, limit: 20, sortOrder: 'desc' } as never);
      expect(res.items[0]!.customerName).toBe('Priya Sharma');
      expect(res.items[1]!.customerName).toBeNull();
    });
  });

  describe('createSale stock decrement (atomic with the sale)', () => {
    const input = (lines: Array<{ productId?: string; quantity: number }>) => ({
      customerId: 'cust-1',
      locationId: 'loc-1',
      currencyCode: 'INR',
      lineItems: lines.map((l) => ({
        description: 'Item',
        unitPricePaise: 100000,
        metalRatePaise: 0,
        metalWeightMg: 0,
        makingChargesPaise: 0,
        wastageChargesPaise: 0,
        hsnCode: '7113',
        gstRate: 300,
        ...l,
      })),
      payments: [{ method: 'CASH', amountPaise: 100000000 }],
    });

    function setup() {
      prisma.location.findFirst.mockResolvedValue(TEST_LOCATION);
      prisma.customer.findFirst.mockResolvedValue({ state: 'MH' });
      prisma.sale.count.mockResolvedValue(0);
      const created = createMockSale();
      prisma.$transaction.mockImplementation(async (fn: unknown) =>
        typeof fn === 'function' ? fn(prisma._tx) : fn,
      );
      prisma._tx.sale.create.mockResolvedValue(created);
      prisma._tx.saleLineItem.create.mockResolvedValue({});
      prisma._tx.salePayment.create.mockResolvedValue({});
      prisma.sale.findFirst.mockResolvedValue({ ...created, lineItems: [], payments: [] });
    }

    it('decrements the sale location row by the sold quantity and writes an OUT movement in the tx', async () => {
      setup();
      (prisma._tx.stockItem.findMany as any).mockImplementation(async ({ where }: any) =>
        where.productId === 'p1' ? [{ id: 'si-1', quantityOnHand: 8 }] : [{ id: 'si-2', quantityOnHand: 5 }],
      );
      (prisma._tx.stockItem.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma._tx.stockMovement.create as any).mockResolvedValue({});

      await service.createSale(
        tenantId,
        userId,
        input([{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }, { quantity: 3 }]) as never,
      );

      expect(prisma._tx.stockItem.findMany).toHaveBeenCalledTimes(2); // free-text line skipped
      expect(prisma._tx.stockItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productId: 'p1', locationId: 'loc-1', tenantId }),
        }),
      );
      expect(prisma._tx.stockItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'si-1' }),
          data: expect.objectContaining({ quantityOnHand: { decrement: 2 } }),
        }),
      );
      expect(prisma._tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stockItemId: 'si-1',
            movementType: 'OUT',
            quantityChange: -2,
            referenceType: 'RETAIL_SALE',
            referenceId: expect.any(String),
          }),
        }),
      );
      expect(prisma._tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stockItemId: 'si-2', quantityChange: -1 }) }),
      );
      const ev = eventBus.publishedEvents.find((e) => e.type === 'retail.sale.completed') as any;
      expect(ev.payload.locationId).toBe('loc-1');
      expect(ev.payload.items[0].quantity).toBe(2);
    });

    it('never drives stock negative: clamps to quantity on hand and warns about the shortfall', async () => {
      setup();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      (prisma._tx.stockItem.findMany as any).mockResolvedValue([{ id: 'si-1', quantityOnHand: 1 }]);
      (prisma._tx.stockItem.updateMany as any).mockResolvedValue({ count: 1 });
      (prisma._tx.stockMovement.create as any).mockResolvedValue({});

      await service.createSale(tenantId, userId, input([{ productId: 'p1', quantity: 3 }]) as never);

      expect(prisma._tx.stockItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantityOnHand: { decrement: 1 } }) }),
      );
      expect(prisma._tx.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quantityChange: -1 }) }),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('short by 2'));
      warn.mockRestore();
    });
  });
});
