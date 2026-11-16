import { describe, it, expect, beforeEach } from 'vitest';
import {
  InventoryValuationService,
  computeFifoCost,
  computeAverageCost,
  computeLastPurchaseCost,
  computeAverageMarginBps,
} from '../inventory.valuation.service';
import { createMockPrismaService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';

const d = (s: string) => new Date(s);

// Receipts: 10 @ 100, 10 @ 200, then 5 sold. On hand = 15.
const movements = [
  { quantityChange: 10, unitCostPaise: 100n, movedAt: d('2025-01-01') },
  { quantityChange: 10, unitCostPaise: 200n, movedAt: d('2025-02-01') },
  { quantityChange: -5, unitCostPaise: null, movedAt: d('2025-03-01') },
];

describe('cost-layer helpers', () => {
  it('FIFO consumes the oldest layer first', () => {
    // sold 5 from the 100 layer -> 5@100 + 10@200 = 500 + 2000 = 2500
    const r = computeFifoCost(movements, 15, 999n);
    expect(r.totalValuePaise).toBe(2500n);
    expect(r.unitCostPaise).toBe(166n); // floor(2500/15)
    expect(r.fromMovements).toBe(true);
  });

  it('FIFO spans layers when an issue exceeds the oldest layer', () => {
    const m = [...movements, { quantityChange: -8, movedAt: d('2025-04-01') }];
    // 20 received, 13 issued: 100 layer gone (10), 3 from 200 layer -> 7@200 = 1400
    const r = computeFifoCost(m, 7, 999n);
    expect(r.totalValuePaise).toBe(1400n);
  });

  it('FIFO values missing opening stock at fallback cost', () => {
    // movements explain 15 units but 20 are on hand: 5 extra at fallback 50
    const r = computeFifoCost(movements, 20, 50n);
    expect(r.totalValuePaise).toBe(2500n + 250n);
  });

  it('weighted average re-averages on receipt and issues at average', () => {
    // 10@100 + 10@200 => avg 150, qty 20, value 3000. Sell 5 @150 => value 2250, qty 15
    const r = computeAverageCost(movements, 15, 999n);
    expect(r.unitCostPaise).toBe(150n);
    expect(r.totalValuePaise).toBe(2250n);
  });

  it('last purchase uses the latest costed receipt', () => {
    const r = computeLastPurchaseCost(movements, 15, 999n);
    expect(r.unitCostPaise).toBe(200n);
    expect(r.totalValuePaise).toBe(3000n);
  });

  it('last purchase ignores receipts without cost and sorts by date', () => {
    const m = [
      { quantityChange: 5, unitCostPaise: 300n, movedAt: d('2025-05-01') },
      { quantityChange: 5, unitCostPaise: 120n, movedAt: d('2025-01-01') },
      { quantityChange: 5, unitCostPaise: null, movedAt: d('2025-06-01') },
    ];
    expect(computeLastPurchaseCost(m, 15, 1n).unitCostPaise).toBe(300n);
  });

  it('all methods fall back to product cost when no movement has cost', () => {
    const m = [{ quantityChange: 10, movedAt: d('2025-01-01') }];
    for (const fn of [computeFifoCost, computeAverageCost, computeLastPurchaseCost]) {
      const r = fn(m, 10, 500n);
      expect(r.totalValuePaise).toBe(5000n);
      expect(r.fromMovements).toBe(false);
    }
  });

  it('average margin in bps is weighted by quantity', () => {
    // A: 10 x sell 200 cost 100 ; B: 10 x sell 400 cost 300 => sell 6000, cost 4000 => 3333 bps
    const bps = computeAverageMarginBps([
      { quantity: 10, sellingPricePaise: 200n, costUnitPaise: 100n },
      { quantity: 10, sellingPricePaise: 400n, costUnitPaise: 300n },
    ]);
    expect(bps).toBe(3333n);
  });
});

describe('InventoryValuationService cost layers', () => {
  const { tenantId } = mockTenantContext;
  let service: InventoryValuationService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  const product = (cost: bigint, sell: bigint) => ({
    id: 'p', sku: 'S', name: 'N', costPricePaise: cost, sellingPricePaise: sell,
    metalWeightMg: null, metalPurity: null, categoryId: null, category: null,
  });

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    service = new InventoryValuationService(prisma as never);
  });

  it('FIFO differs from product cost price when receipts carry cost', async () => {
    prisma.stockItem.findMany.mockResolvedValue([
      { productId: 'p', quantityOnHand: 15, product: product(999n, 0n), movements },
    ]);
    const r = await service.calculateFIFO(tenantId, null);
    expect(r.totalValuePaise).toBe(2500n);
  });

  it('AVG and LAST_PURCHASE produce distinct values from the same movements', async () => {
    const rows = [{ productId: 'p', quantityOnHand: 15, product: product(999n, 0n), movements }];
    prisma.stockItem.findMany.mockResolvedValue(rows);
    const avg = await service.calculateWeightedAverage(tenantId, null);
    prisma.stockItem.findMany.mockResolvedValue(rows);
    const last = await service.calculateLastPurchase(tenantId, null);
    expect(avg.totalValuePaise).toBe(2250n);
    expect(last.totalValuePaise).toBe(3000n);
  });

  it('GROSS_PROFIT applies average margin to selling price', async () => {
    // Item A: 10 on hand, avg cost 100, sell 200. Item B: 10 on hand, avg cost 300, sell 400.
    const mk = (id: string, cost: bigint, sell: bigint) => ({
      productId: id, quantityOnHand: 10, product: product(0n, sell),
      movements: [{ quantityChange: 10, unitCostPaise: cost, movedAt: d('2025-01-01') }],
    });
    prisma.stockItem.findMany.mockResolvedValue([mk('a', 100n, 200n), mk('b', 300n, 400n)]);
    const r = await service.calculateGrossProfit(tenantId, null);
    // margin 3333 bps -> unit = sell * 6667 / 10000: 200 -> 133, 400 -> 266
    expect(r.items[0].unitValuePaise).toBe(133n);
    expect(r.items[1].unitValuePaise).toBe(266n);
    expect(r.totalValuePaise).toBe(1330n + 2660n);
  });
});
