import { describe, it, expect, vi } from 'vitest';
import { InventoryService } from '../inventory.service';
import { StoneStockInputSchema, caratsToMg, mgToCarats } from '@caratflow/shared-types';

const T = 'tenant-1';
const U = 'user-1';
const LOC = '11111111-1111-4111-8111-111111111111';

function makeService() {
  const prisma: any = {
    metalRecovery: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), },
    metalStock: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    stoneStock: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    serialNumber: { findFirst: vi.fn(), update: vi.fn() },
  };
  const service = new InventoryService(prisma, { publish: vi.fn() } as any);
  return { service, prisma };
}

describe('carat conversions', () => {
  it('keeps fractional carats exact in mg (1 ct = 200 mg)', () => {
    expect(caratsToMg(0.37)).toBe(74n);
    expect(caratsToMg(1.005)).toBe(201n);
    expect(mgToCarats(74n)).toBeCloseTo(0.37, 10);
  });
});

describe('StoneStockInputSchema (lab-grown attributes)', () => {
  const base = { locationId: LOC, stoneType: 'Diamond', totalWeightMg: 74n, totalPieces: 1, valuePaise: 1000n };

  it('defaults to natural / no treatment', () => {
    const r = StoneStockInputSchema.parse(base);
    expect(r.origin).toBe('NATURAL');
    expect(r.growthMethod).toBe('NONE');
    expect(r.treatment).toBe('NONE');
  });
  it('requires a growth method for lab-grown stones', () => {
    expect(StoneStockInputSchema.safeParse({ ...base, origin: 'LAB_GROWN' }).success).toBe(false);
    expect(StoneStockInputSchema.safeParse({ ...base, origin: 'LAB_GROWN', growthMethod: 'CVD' }).success).toBe(true);
  });
  it('rejects a growth method on natural stones', () => {
    expect(StoneStockInputSchema.safeParse({ ...base, growthMethod: 'HPHT' }).success).toBe(false);
  });
});

describe('InventoryService stone stock', () => {
  it('adjusts weight in mg, using legacy carats when mg not yet populated', async () => {
    const { service, prisma } = makeService();
    prisma.stoneStock.findFirst.mockResolvedValue({ id: 's', totalWeightMg: 0n, totalWeightCt: 2, totalPieces: 4, valuePaise: 1000n });
    prisma.stoneStock.update.mockImplementation(async (a: any) => a.data);
    const r = await service.adjustStoneStock(T, U, { id: 's', weightChangeMg: 74n, piecesChange: 1, valueChangePaise: 0n });
    expect(r.totalWeightMg).toBe(474n); // 2 ct legacy = 400 mg + 74 mg
    expect(r.totalWeightCt).toBe(2);
  });

  it('rejects negative resulting weight', async () => {
    const { service, prisma } = makeService();
    prisma.stoneStock.findFirst.mockResolvedValue({ id: 's', totalWeightMg: 100n, totalWeightCt: 0, totalPieces: 1, valuePaise: 0n });
    await expect(
      service.adjustStoneStock(T, U, { id: 's', weightChangeMg: -101n, piecesChange: 0, valueChangePaise: 0n }),
    ).rejects.toThrow();
  });

  it('filters list by origin', async () => {
    const { service, prisma } = makeService();
    prisma.stoneStock.findMany.mockResolvedValue([]);
    await service.getStoneStockByLocation(T, LOC, { origin: 'LAB_GROWN' as any });
    expect(prisma.stoneStock.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: T, locationId: LOC, origin: 'LAB_GROWN' });
  });
});

describe('InventoryService metal recovery', () => {
  it('computes expected fine metal from gross weight and fineness', () => {
    // 100 g of 916 scrap -> 91.6 g fine
    expect(InventoryService.expectedFineMg(100_000n, 916)).toBe(91_600n);
  });

  it('creates a recovery with expected fine weight', async () => {
    const { service, prisma } = makeService();
    prisma.metalRecovery.count.mockResolvedValue(4);
    prisma.metalRecovery.create.mockImplementation(async (a: any) => a.data);
    const r = await service.createMetalRecovery(T, U, {
      locationId: LOC, sourceType: 'FILINGS' as any, metalType: 'GOLD' as any,
      grossWeightMg: 100_000n, purityFineness: 916,
    });
    expect(r.recoveryNumber).toBe('REC-000005');
    expect(r.expectedFineMg).toBe(91_600n);
    expect(r.status).toBe('PENDING');
  });

  it('completes: records loss and posts recovered metal into MetalStock', async () => {
    const { service, prisma } = makeService();
    prisma.metalRecovery.findFirst.mockResolvedValue({
      id: 'r', locationId: LOC, metalType: 'GOLD', status: 'SENT_TO_REFINER',
      expectedFineMg: 91_600n, recoveryNumber: 'REC-000001', notes: null,
    });
    prisma.metalRecovery.update.mockImplementation(async (a: any) => a.data);
    prisma.metalStock.findFirst.mockResolvedValue(null);
    prisma.metalStock.create.mockImplementation(async (a: any) => a.data);

    const r = await service.completeMetalRecovery(T, U, {
      id: 'r', recoveredFineMg: 90_000n, recoveredPurityFineness: 999, valuePaise: 5_000_000n,
    });
    expect(r.status).toBe('COMPLETED');
    expect(r.lossMg).toBe(1_600n);
    const stock = prisma.metalStock.create.mock.calls[0][0].data;
    expect(stock.purityFineness).toBe(999);
    expect(stock.weightMg).toBe(90_090n); // 90000 fine / 0.999
    expect(stock.valuePaise).toBe(5_000_000n);
  });

  it('refuses to complete an already completed recovery', async () => {
    const { service, prisma } = makeService();
    prisma.metalRecovery.findFirst.mockResolvedValue({ id: 'r', status: 'COMPLETED', expectedFineMg: 1n });
    await expect(
      service.completeMetalRecovery(T, U, { id: 'r', recoveredFineMg: 1n, recoveredPurityFineness: 999, valuePaise: 0n }),
    ).rejects.toThrow();
  });
});

describe('InventoryService serial QR', () => {
  it('builds a deterministic payload and persists it', async () => {
    const { service, prisma } = makeService();
    prisma.serialNumber.findFirst.mockResolvedValue({ id: 'x', serialNumber: 'SN-1', productId: 'p-9', qrData: null });
    prisma.serialNumber.update.mockResolvedValue({});
    const r = await service.generateSerialQr(T, U, 'SN-1');
    expect(r.qrData).toBe('CF1|tenant-1|SN-1|p-9');
    expect(prisma.serialNumber.update).toHaveBeenCalled();
    // idempotent
    prisma.serialNumber.update.mockClear();
    prisma.serialNumber.findFirst.mockResolvedValue({ id: 'x', serialNumber: 'SN-1', productId: 'p-9', qrData: r.qrData });
    await service.generateSerialQr(T, U, 'SN-1');
    expect(prisma.serialNumber.update).not.toHaveBeenCalled();
  });
});
