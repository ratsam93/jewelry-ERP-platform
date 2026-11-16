import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  createMockPrismaService,
  createMockEventBusService,
  mockTenantContext,
  resetMocks,
} from '../../../__tests__/mocks';
import { InventoryService } from '../inventory.service';

const TENANT = mockTenantContext.tenantId;
const USER = mockTenantContext.userId;

function makeDelegate() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  };
}

function stockItemFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'si-1',
    tenantId: TENANT,
    productId: 'prod-1',
    locationId: 'loc-1',
    quantityOnHand: 10,
    quantityReserved: 2,
    quantityOnOrder: 0,
    reorderLevel: 5,
    reorderQuantity: 10,
    lastCountedAt: null,
    binLocation: 'A1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    product: { id: 'prod-1', sku: 'SKU-1', name: 'Ring', costPricePaise: BigInt(100), sellingPricePaise: BigInt(200) },
    location: { id: 'loc-1', name: 'Main', locationType: 'SHOWROOM' },
    ...overrides,
  };
}

function transferFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-1',
    tenantId: TENANT,
    fromLocationId: 'loc-a',
    toLocationId: 'loc-b',
    status: 'DRAFT',
    fromLocation: { id: 'loc-a', name: 'From Store' },
    toLocation: { id: 'loc-b', name: 'To Store' },
    items: [
      {
        id: 'ti-1',
        productId: 'prod-1',
        quantityRequested: 3,
        quantitySent: 3,
        quantityReceived: 0,
        product: { id: 'prod-1', sku: 'SKU-1', name: 'Ring' },
      },
    ],
    ...overrides,
  };
}

function stockTakeFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'st-1',
    tenantId: TENANT,
    locationId: 'loc-1',
    status: 'IN_PROGRESS',
    items: [],
    ...overrides,
  };
}

describe('InventoryService (coverage)', () => {
  let service: InventoryService;
  let prisma: ReturnType<typeof createMockPrismaService> & Record<string, any>;
  let eventBus: ReturnType<typeof createMockEventBusService>;

  beforeEach(() => {
    prisma = createMockPrismaService() as typeof prisma;
    resetMocks(prisma);
    // Delegates not present in the shared mock.
    (prisma as Record<string, any>).stockTakeItem = { ...makeDelegate(), ...(prisma as any).stockTakeItem };
    (prisma as Record<string, any>).stockTransferItem = { update: vi.fn() };
    (prisma as Record<string, any>).stockTransferItem.update = vi.fn();
    (prisma as Record<string, any>).$transaction = vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return (arg as (c: unknown) => unknown)(prisma);
      return Promise.all(arg as unknown[]);
    });
    eventBus = createMockEventBusService();
    service = new InventoryService(prisma as never, eventBus as never);
  });

  // ─── Stock Items ──────────────────────────────────────────────

  describe('createStockItem', () => {
    it('throws when a stock item already exists for the product and location', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture());

      await expect(
        service.createStockItem(TENANT, USER, { productId: 'prod-1', locationId: 'loc-1' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.stockItem.create).not.toHaveBeenCalled();
    });

    it('creates a stock item with defaults and publishes an event', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(null);
      prisma.stockItem.create.mockResolvedValue(stockItemFixture({ quantityOnHand: 0, quantityReserved: 0 }));

      const result = await service.createStockItem(TENANT, USER, {
        productId: 'prod-1',
        locationId: 'loc-1',
      } as never);

      const arg = prisma.stockItem.create.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        tenantId: TENANT,
        productId: 'prod-1',
        locationId: 'loc-1',
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityOnOrder: 0,
        reorderLevel: 0,
        reorderQuantity: 0,
        binLocation: null,
        createdBy: USER,
      });
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT,
          userId: USER,
          type: 'inventory.item.created',
          payload: { productId: 'prod-1', locationId: 'loc-1', quantity: 0 },
        }),
      );
      expect(result).toMatchObject({ id: 'si-1', quantityAvailable: 0 });
    });

    it('uses explicit quantities and bin location when provided', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(null);
      prisma.stockItem.create.mockResolvedValue(stockItemFixture());

      await service.createStockItem(TENANT, USER, {
        productId: 'prod-1',
        locationId: 'loc-1',
        quantityOnHand: 7,
        quantityReserved: 1,
        quantityOnOrder: 4,
        reorderLevel: 3,
        reorderQuantity: 9,
        binLocation: 'B2',
      } as never);

      expect(prisma.stockItem.create.mock.calls[0][0].data).toMatchObject({
        quantityOnHand: 7,
        quantityReserved: 1,
        quantityOnOrder: 4,
        reorderLevel: 3,
        reorderQuantity: 9,
        binLocation: 'B2',
      });
      expect(eventBus.publish.mock.calls[0][0].payload.quantity).toBe(7);
    });
  });

  describe('findAllStockItems', () => {
    it('returns paginated stock items without filters and uses default ordering', async () => {
      prisma.stockItem.findMany.mockResolvedValue([stockItemFixture()]);
      prisma.stockItem.count.mockResolvedValue(25);

      const result = await service.findAllStockItems(TENANT, { page: 1, limit: 10 } as never);

      expect(prisma.stockItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT },
          orderBy: { updatedAt: 'desc' },
          skip: 0,
          take: 10,
        }),
      );
      expect(result).toMatchObject({
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
        hasNext: true,
        hasPrevious: false,
      });
      expect(result.items).toHaveLength(1);
    });

    it('applies location, product and search filters with custom sort and page offset', async () => {
      prisma.stockItem.findMany.mockResolvedValue([]);
      prisma.stockItem.count.mockResolvedValue(0);

      const result = await service.findAllStockItems(TENANT, {
        page: 2,
        limit: 5,
        sortBy: 'quantityOnHand',
        sortOrder: 'asc',
        locationId: 'loc-1',
        productType: 'FINISHED_GOODS',
        categoryId: 'cat-1',
        search: 'ring',
      } as never);

      expect(prisma.stockItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: TENANT,
            locationId: 'loc-1',
            product: {
              productType: 'FINISHED_GOODS',
              categoryId: 'cat-1',
              OR: [{ name: { contains: 'ring' } }, { sku: { contains: 'ring' } }],
            },
          },
          orderBy: { quantityOnHand: 'asc' },
          skip: 5,
          take: 5,
        }),
      );
      expect(result).toMatchObject({ totalPages: 0, hasNext: false, hasPrevious: true });
    });

    it('filters low stock items in the application layer when lowStockOnly is set', async () => {
      const low = stockItemFixture({ id: 'low', quantityOnHand: 2, reorderLevel: 5 });
      const ok = stockItemFixture({ id: 'ok', quantityOnHand: 50, reorderLevel: 5 });
      const zero = stockItemFixture({ id: 'zero', quantityOnHand: 0, reorderLevel: 0 });
      prisma.stockItem.findMany.mockResolvedValue([low, ok, zero]);
      prisma.stockItem.count.mockResolvedValue(3);

      const result = await service.findAllStockItems(TENANT, {
        page: 1,
        limit: 10,
        lowStockOnly: true,
      } as never);

      expect(prisma.stockItem.findMany.mock.calls[0][0].where).toMatchObject({
        tenantId: TENANT,
        reorderLevel: undefined,
        quantityOnHand: undefined,
      });
      expect(result.items.map((i: { id: string }) => i.id)).toEqual(['low']);
      expect(result.total).toBe(1);
    });
  });

  describe('findStockItemById', () => {
    it('returns the mapped stock item with recent movements', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ movements: [{ id: 'm1' }] }));

      const result = await service.findStockItemById(TENANT, 'si-1');

      expect(prisma.stockItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT, id: 'si-1' } }),
      );
      expect(result).toMatchObject({ id: 'si-1', quantityAvailable: 8 });
    });

    it('throws NotFoundException when the item does not exist for the tenant', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(null);

      await expect(service.findStockItemById(TENANT, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStockItem', () => {
    it('throws NotFoundException when the item is missing', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(null);

      await expect(service.updateStockItem(TENANT, USER, 'nope', { binLocation: 'Z' } as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.stockItem.update).not.toHaveBeenCalled();
    });

    it('updates the item, stamps updatedBy and publishes an update event', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture());
      prisma.stockItem.update.mockResolvedValue(stockItemFixture({ binLocation: 'Z9' }));

      const result = await service.updateStockItem(TENANT, USER, 'si-1', { binLocation: 'Z9' } as never);

      expect(prisma.stockItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'si-1' },
          data: { binLocation: 'Z9', updatedBy: USER },
        }),
      );
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'inventory.item.updated',
          payload: { productId: 'prod-1', changes: { binLocation: 'Z9' } },
        }),
      );
      expect(result).toMatchObject({ binLocation: 'Z9', quantityAvailable: 8 });
    });
  });

  // ─── Stock Movements ─────────────────────────────────────────

  describe('recordMovement', () => {
    it('throws NotFoundException when the stock item is missing', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(null);

      await expect(
        service.recordMovement(TENANT, USER, { stockItemId: 'x', movementType: 'IN', quantityChange: 1 } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects movements that would make on-hand quantity negative', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ quantityOnHand: 3 }));

      await expect(
        service.recordMovement(TENANT, USER, { stockItemId: 'si-1', movementType: 'OUT', quantityChange: -5 } as never),
      ).rejects.toThrow('Insufficient stock: current 3, change -5');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records movement and updates on-hand quantity atomically and publishes event', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ quantityOnHand: 10 }));
      const movedAt = new Date('2026-03-01');
      prisma.stockMovement.create.mockResolvedValue({ id: 'mv-1' });
      prisma.stockItem.update.mockResolvedValue({});

      const result = await service.recordMovement(TENANT, USER, {
        stockItemId: 'si-1',
        movementType: 'SALE',
        quantityChange: -4,
        referenceType: 'SALE',
        referenceId: 'sale-1',
        notes: 'counter sale',
        movedAt,
      } as never);

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT,
            stockItemId: 'si-1',
            quantityChange: -4,
            referenceType: 'SALE',
            referenceId: 'sale-1',
            notes: 'counter sale',
            movedAt,
          }),
        }),
      );
      expect(prisma.stockItem.update).toHaveBeenCalledWith({
        where: { id: 'si-1' },
        data: { quantityOnHand: 6, updatedBy: USER },
      });
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'inventory.stock.adjusted',
          payload: expect.objectContaining({ quantityChange: -4, reason: 'counter sale' }),
        }),
      );
      expect(result).toEqual({ id: 'mv-1' });
    });

    it('defaults optional references, movedAt and reason to movement type', async () => {
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ quantityOnHand: 0 }));
      prisma.stockMovement.create.mockResolvedValue({ id: 'mv-2' });
      prisma.stockItem.update.mockResolvedValue({});

      await service.recordMovement(TENANT, USER, {
        stockItemId: 'si-1',
        movementType: 'ADJUST',
        quantityChange: 2,
      } as never);

      const createData = prisma.stockMovement.create.mock.calls[0][0].data;
      expect(createData.referenceType).toBeNull();
      expect(createData.referenceId).toBeNull();
      expect(createData.notes).toBeNull();
      expect(createData.movedAt).toBeInstanceOf(Date);
      expect(eventBus.publish.mock.calls[0][0].payload.reason).toBe('ADJUST');
    });
  });

  describe('findAllMovements', () => {
    it('returns paginated movements with default ordering when no filters are supplied', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([{ id: 'mv-1' }]);
      prisma.stockMovement.count.mockResolvedValue(1);

      const result = await service.findAllMovements(TENANT, { page: 1, limit: 20 } as never);

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT }, orderBy: { movedAt: 'desc' }, skip: 0, take: 20 }),
      );
      expect(result).toMatchObject({ total: 1, totalPages: 1, hasNext: false, hasPrevious: false });
    });

    it('applies every filter including date range and nested stock item filters', async () => {
      prisma.stockMovement.findMany.mockResolvedValue([]);
      prisma.stockMovement.count.mockResolvedValue(40);
      const from = new Date('2026-01-01');
      const to = new Date('2026-01-31');

      const result = await service.findAllMovements(TENANT, {
        page: 3,
        limit: 10,
        sortBy: 'quantityChange',
        sortOrder: 'desc',
        stockItemId: 'si-1',
        productId: 'prod-1',
        locationId: 'loc-1',
        movementType: 'SALE',
        dateRange: { from, to },
      } as never);

      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: TENANT,
            stockItemId: 'si-1',
            movementType: 'SALE',
            movedAt: { gte: from, lte: to },
            stockItem: { productId: 'prod-1', locationId: 'loc-1' },
          },
          orderBy: { quantityChange: 'desc' },
          skip: 20,
          take: 10,
        }),
      );
      expect(result).toMatchObject({ totalPages: 4, hasNext: true, hasPrevious: true });
    });
  });

  // ─── Stock Transfers ──────────────────────────────────────────

  describe('createTransfer', () => {
    it('rejects transfers between the same source and destination', async () => {
      await expect(
        service.createTransfer(TENANT, USER, { fromLocationId: 'a', toLocationId: 'a', items: [] } as never),
      ).rejects.toThrow('Source and destination locations must be different');
      expect(prisma.stockTransfer.create).not.toHaveBeenCalled();
    });

    it('creates a draft transfer with nested items', async () => {
      prisma.stockTransfer.create.mockResolvedValue(transferFixture());

      const result = await service.createTransfer(TENANT, USER, {
        fromLocationId: 'loc-a',
        toLocationId: 'loc-b',
        notes: 'urgent',
        items: [{ productId: 'prod-1', quantityRequested: 3 }],
      } as never);

      const data = prisma.stockTransfer.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId: TENANT,
        fromLocationId: 'loc-a',
        toLocationId: 'loc-b',
        status: 'DRAFT',
        requestedBy: USER,
        notes: 'urgent',
      });
      expect(data.items.create[0]).toMatchObject({ productId: 'prod-1', quantityRequested: 3, tenantId: TENANT });
      expect(result).toMatchObject({ id: 'tr-1', status: 'DRAFT' });
    });

    it('defaults notes to null', async () => {
      prisma.stockTransfer.create.mockResolvedValue(transferFixture());

      await service.createTransfer(TENANT, USER, {
        fromLocationId: 'loc-a',
        toLocationId: 'loc-b',
        items: [],
      } as never);

      expect(prisma.stockTransfer.create.mock.calls[0][0].data.notes).toBeNull();
    });
  });

  describe('approveTransfer', () => {
    it('throws NotFoundException when the transfer does not exist', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(null);

      await expect(service.approveTransfer(TENANT, USER, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects approval when the transfer is not in DRAFT', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture({ status: 'RECEIVED' }));

      await expect(service.approveTransfer(TENANT, USER, 'tr-1')).rejects.toThrow(
        'Cannot approve transfer in status: RECEIVED',
      );
    });

    it('rejects approval when source stock is insufficient or missing', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture());
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ quantityOnHand: 1 }));

      await expect(service.approveTransfer(TENANT, USER, 'tr-1')).rejects.toThrow(
        'Insufficient stock for product prod-1 at source location',
      );

      prisma.stockItem.findFirst.mockResolvedValue(null);
      await expect(service.approveTransfer(TENANT, USER, 'tr-1')).rejects.toThrow(BadRequestException);
    });

    it('approves the transfer, decrements source stock and marks items sent', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture());
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ id: 'src-si', quantityOnHand: 10 }));
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'IN_TRANSIT' }));
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.stockItem.update.mockResolvedValue({});
      prisma.stockTransferItem.update.mockResolvedValue({});

      const result = await service.approveTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tr-1' },
          data: { status: 'IN_TRANSIT', approvedBy: USER, updatedBy: USER },
        }),
      );
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stockItemId: 'src-si',
            movementType: 'TRANSFER',
            quantityChange: -3,
            referenceType: 'STOCK_TRANSFER',
            referenceId: 'tr-1',
            notes: 'Transfer to To Store',
          }),
        }),
      );
      expect(prisma.stockTransferItem.update).toHaveBeenCalledWith({
        where: { id: 'ti-1' },
        data: { quantitySent: 3, updatedBy: USER },
      });
      expect(result).toMatchObject({ status: 'IN_TRANSIT' });
    });

    it('skips movement when source stock disappears between validation and decrement', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture());
      prisma.stockItem.findFirst
        .mockResolvedValueOnce(stockItemFixture({ quantityOnHand: 10 }))
        .mockResolvedValueOnce(null);
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'IN_TRANSIT', toLocation: undefined }));

      await service.approveTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      expect(prisma.stockTransferItem.update).not.toHaveBeenCalled();
    });
  });

  describe('receiveTransfer', () => {
    it('throws NotFoundException when the transfer is missing', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(null);

      await expect(service.receiveTransfer(TENANT, USER, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects receipt when the transfer is not IN_TRANSIT', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture({ status: 'DRAFT' }));

      await expect(service.receiveTransfer(TENANT, USER, 'tr-1')).rejects.toThrow(
        'Cannot receive transfer in status: DRAFT',
      );
    });

    it('receives into an existing destination stock item and publishes completion event', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(
        transferFixture({
          status: 'IN_TRANSIT',
          items: [{ id: 'ti-1', productId: 'prod-1', quantitySent: 3, quantityRequested: 3 }],
        }),
      );
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'RECEIVED' }));
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ id: 'dest-si', quantityOnHand: 4 }));
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.stockItem.update.mockResolvedValue({});
      prisma.stockTransferItem.update.mockResolvedValue({});

      const result = await service.receiveTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockItem.create).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stockItemId: 'dest-si',
            quantityChange: 3,
            notes: 'Transfer from From Store',
          }),
        }),
      );
      expect(prisma.stockTransferItem.update).toHaveBeenCalledWith({
        where: { id: 'ti-1' },
        data: { quantityReceived: 3, updatedBy: USER },
      });
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'inventory.transfer.completed',
          payload: {
            transferId: 'tr-1',
            fromLocationId: 'loc-a',
            toLocationId: 'loc-b',
            items: [{ productId: 'prod-1', quantity: 3 }],
          },
        }),
      );
      expect(result).toMatchObject({ status: 'RECEIVED' });
    });

    it('creates destination stock item when none exists and falls back to location id in notes', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(
        transferFixture({
          status: 'IN_TRANSIT',
          fromLocation: undefined,
          items: [{ id: 'ti-9', productId: 'prod-9', quantitySent: 2, quantityRequested: 2 }],
        }),
      );
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'RECEIVED', fromLocation: undefined }));
      prisma.stockItem.findFirst
        .mockResolvedValueOnce(null) // destination lookup
        .mockResolvedValue(stockItemFixture({ id: 'new-si', quantityOnHand: 0 })); // recordMovement lookup
      prisma.stockItem.create.mockResolvedValue({ id: 'new-si', quantityOnHand: 0 });
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.stockItem.update.mockResolvedValue({});
      prisma.stockTransferItem.update.mockResolvedValue({});

      await service.receiveTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT,
          productId: 'prod-9',
          locationId: 'loc-b',
          quantityOnHand: 0,
        }),
      });
      expect(prisma.stockMovement.create.mock.calls[0][0].data.notes).toBe('Transfer from loc-a');
    });
  });

  describe('cancelTransfer', () => {
    it('throws NotFoundException when transfer is missing', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(null);

      await expect(service.cancelTransfer(TENANT, USER, 'missing')).rejects.toThrow(NotFoundException);
    });

    it.each(['RECEIVED', 'CANCELLED'])('rejects cancelling a %s transfer', async (status) => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture({ status }));

      await expect(service.cancelTransfer(TENANT, USER, 'tr-1')).rejects.toThrow(
        `Cannot cancel transfer in status: ${status}`,
      );
    });

    it('cancels a draft transfer without reversing stock', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture({ status: 'DRAFT' }));
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'CANCELLED' }));

      const result = await service.cancelTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockItem.findFirst).not.toHaveBeenCalled();
      expect(prisma.stockTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED', updatedBy: USER } }),
      );
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });

    it('returns in-transit stock to source and records a return movement', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture({ status: 'IN_TRANSIT' }));
      prisma.stockItem.findFirst.mockResolvedValue(stockItemFixture({ id: 'src-si', quantityOnHand: 0 }));
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.stockItem.update.mockResolvedValue({});
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'CANCELLED' }));

      await service.cancelTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stockItemId: 'src-si',
            movementType: 'RETURN',
            quantityChange: 3,
            referenceType: 'STOCK_TRANSFER_CANCEL',
            notes: 'Transfer cancelled - stock returned',
          }),
        }),
      );
    });

    it('skips stock return for in-transit items whose source stock item is gone', async () => {
      prisma.stockTransfer.findFirst.mockResolvedValue(transferFixture({ status: 'IN_TRANSIT' }));
      prisma.stockItem.findFirst.mockResolvedValue(null);
      prisma.stockTransfer.update.mockResolvedValue(transferFixture({ status: 'CANCELLED' }));

      await service.cancelTransfer(TENANT, USER, 'tr-1');

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllTransfers', () => {
    it('lists transfers with all filters and explicit sort', async () => {
      prisma.stockTransfer.findMany.mockResolvedValue([transferFixture()]);
      prisma.stockTransfer.count.mockResolvedValue(11);

      const result = await service.findAllTransfers(TENANT, {
        page: 2,
        limit: 5,
        sortBy: 'status',
        sortOrder: 'asc',
        status: 'DRAFT',
        fromLocationId: 'loc-a',
        toLocationId: 'loc-b',
      } as never);

      expect(prisma.stockTransfer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, status: 'DRAFT', fromLocationId: 'loc-a', toLocationId: 'loc-b' },
          orderBy: { status: 'asc' },
          skip: 5,
          take: 5,
        }),
      );
      expect(result).toMatchObject({ total: 11, totalPages: 3, hasNext: true, hasPrevious: true });
    });

    it('uses createdAt desc ordering by default', async () => {
      prisma.stockTransfer.findMany.mockResolvedValue([]);
      prisma.stockTransfer.count.mockResolvedValue(0);

      await service.findAllTransfers(TENANT, { page: 1, limit: 10 } as never);

      expect(prisma.stockTransfer.findMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: TENANT },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ─── Stock Takes ──────────────────────────────────────────────

  describe('createStockTake', () => {
    it('pre-populates take items from the current stock at the location', async () => {
      prisma.stockItem.findMany.mockResolvedValue([
        stockItemFixture({ productId: 'p1', quantityOnHand: 4 }),
        stockItemFixture({ id: 'si-2', productId: 'p2', quantityOnHand: 9 }),
      ]);
      prisma.stockTake.create.mockResolvedValue({ id: 'st-new' });

      const result = await service.createStockTake(TENANT, USER, { locationId: 'loc-1', notes: 'Monthly' } as never);

      const data = prisma.stockTake.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ tenantId: TENANT, locationId: 'loc-1', status: 'DRAFT', notes: 'Monthly' });
      expect(data.items.create).toEqual([
        expect.objectContaining({ productId: 'p1', systemQuantity: 4, tenantId: TENANT }),
        expect.objectContaining({ productId: 'p2', systemQuantity: 9, tenantId: TENANT }),
      ]);
      expect(result).toEqual({ id: 'st-new' });
    });

    it('defaults notes to null when none are supplied', async () => {
      prisma.stockItem.findMany.mockResolvedValue([]);
      prisma.stockTake.create.mockResolvedValue({ id: 'st-2' });

      await service.createStockTake(TENANT, USER, { locationId: 'loc-1' } as never);

      expect(prisma.stockTake.create.mock.calls[0][0].data.notes).toBeNull();
    });
  });

  describe('addStockTakeCounts', () => {
    it('throws NotFoundException when the stock take is missing', async () => {
      prisma.stockTake.findFirst.mockResolvedValue(null);

      await expect(service.addStockTakeCounts(TENANT, USER, 'missing', [])).rejects.toThrow(NotFoundException);
    });

    it.each(['COMPLETED', 'CANCELLED'])('rejects counts on a %s stock take', async (status) => {
      prisma.stockTake.findFirst.mockResolvedValue(stockTakeFixture({ status }));

      await expect(service.addStockTakeCounts(TENANT, USER, 'st-1', [])).rejects.toThrow(
        `Cannot add counts to stock take in status: ${status}`,
      );
    });

    it('moves a DRAFT take to IN_PROGRESS, records variances and skips unknown products', async () => {
      prisma.stockTake.findFirst
        .mockResolvedValueOnce(stockTakeFixture({ status: 'DRAFT' }))
        .mockResolvedValueOnce(stockTakeFixture({ status: 'IN_PROGRESS', items: [{ id: 'x' }] }));
      prisma.stockTake.update.mockResolvedValue({});
      prisma.stockTakeItem.findFirst
        .mockResolvedValueOnce({ id: 'sti-1', systemQuantity: 10 })
        .mockResolvedValueOnce(null);
      prisma.stockTakeItem.update.mockResolvedValue({});

      const result = await service.addStockTakeCounts(TENANT, USER, 'st-1', [
        { productId: 'p1', countedQuantity: 7, notes: 'short' },
        { productId: 'unknown', countedQuantity: 1 },
      ] as never);

      expect(prisma.stockTake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'st-1' },
          data: expect.objectContaining({ status: 'IN_PROGRESS', updatedBy: USER }),
        }),
      );
      expect(prisma.stockTakeItem.update).toHaveBeenCalledTimes(1);
      expect(prisma.stockTakeItem.update).toHaveBeenCalledWith({
        where: { id: 'sti-1' },
        data: {
          countedQuantity: 7,
          varianceQuantity: -3,
          notes: 'short',
          updatedBy: USER,
        },
      });
      expect(result).toMatchObject({ id: 'st-1' });
    });

    it('does not transition status when already IN_PROGRESS and defaults count notes to null', async () => {
      prisma.stockTake.findFirst
        .mockResolvedValueOnce(stockTakeFixture({ status: 'IN_PROGRESS' }))
        .mockResolvedValueOnce(stockTakeFixture({ status: 'IN_PROGRESS' }));
      prisma.stockTakeItem.findFirst.mockResolvedValueOnce({ id: 'sti-2', systemQuantity: 2 });
      prisma.stockTakeItem.update.mockResolvedValue({});

      await service.addStockTakeCounts(TENANT, USER, 'st-1', [{ productId: 'p1', countedQuantity: 2 }] as never);

      expect(prisma.stockTake.update).not.toHaveBeenCalled();
      expect(prisma.stockTakeItem.update.mock.calls[0][0].data.notes).toBeNull();
      expect(prisma.stockTakeItem.update.mock.calls[0][0].data.varianceQuantity).toBe(0);
    });
  });

  describe('completeStockTake', () => {
    it('throws NotFoundException when the stock take is missing', async () => {
      prisma.stockTake.findFirst.mockResolvedValue(null);

      await expect(service.completeStockTake(TENANT, USER, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('rejects completion unless the take is IN_PROGRESS', async () => {
      prisma.stockTake.findFirst.mockResolvedValue(stockTakeFixture({ status: 'DRAFT', items: [] }));

      await expect(service.completeStockTake(TENANT, USER, 'st-1')).rejects.toThrow(
        'Cannot complete stock take in status: DRAFT',
      );
    });

    it('rejects completion while items remain uncounted', async () => {
      prisma.stockTake.findFirst.mockResolvedValue(
        stockTakeFixture({
          items: [
            { id: 'a', countedQuantity: null, varianceQuantity: null },
            { id: 'b', countedQuantity: 1, varianceQuantity: 0 },
            { id: 'c', countedQuantity: null, varianceQuantity: null },
          ],
        }),
      );

      await expect(service.completeStockTake(TENANT, USER, 'st-1')).rejects.toThrow(
        '2 items have not been counted yet',
      );
    });

    it('applies ADJUST movements for variances, skips zero/missing stock, and completes the take', async () => {
      prisma.stockTake.findFirst.mockResolvedValue(
        stockTakeFixture({
          items: [
            { id: 'a', productId: 'p1', countedQuantity: 8, systemQuantity: 10, varianceQuantity: -2 },
            { id: 'b', productId: 'p2', countedQuantity: 5, systemQuantity: 5, varianceQuantity: 0 },
            { id: 'c', productId: 'p3', countedQuantity: 6, systemQuantity: 4, varianceQuantity: 2 },
          ],
        }),
      );
      prisma.stockItem.findFirst
        .mockResolvedValueOnce(stockItemFixture({ id: 'si-p1', quantityOnHand: 10 })) // p1 lookup in completion loop
        .mockResolvedValueOnce(stockItemFixture({ id: 'si-p1', quantityOnHand: 10 })) // recordMovement lookup for p1
        .mockResolvedValueOnce(null); // p3 has no stock item, so no movement
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.stockItem.update.mockResolvedValue({});
      prisma.stockItem.updateMany.mockResolvedValue({ count: 3 });
      prisma.stockTake.update.mockResolvedValue({ id: 'st-1', status: 'COMPLETED' });

      const result = await service.completeStockTake(TENANT, USER, 'st-1');

      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: 'ADJUST',
            quantityChange: -2,
            referenceType: 'STOCK_TAKE',
            referenceId: 'st-1',
            notes: 'Stock take adjustment: variance of -2',
          }),
        }),
      );
      expect(prisma.stockItem.updateMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT, locationId: 'loc-1' },
        data: expect.objectContaining({ updatedBy: USER }),
      });
      expect(prisma.stockTake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'st-1' },
          data: expect.objectContaining({ status: 'COMPLETED', updatedBy: USER }),
        }),
      );
      expect(result).toMatchObject({ status: 'COMPLETED' });
    });
  });

  describe('findAllStockTakes', () => {
    it('lists stock takes filtered by location and status', async () => {
      prisma.stockTake.findMany.mockResolvedValue([stockTakeFixture()]);
      prisma.stockTake.count.mockResolvedValue(2);

      const result = await service.findAllStockTakes(TENANT, {
        page: 1,
        limit: 1,
        sortBy: 'status',
        sortOrder: 'desc',
        locationId: 'loc-1',
        status: 'COMPLETED',
      } as never);

      expect(prisma.stockTake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, locationId: 'loc-1', status: 'COMPLETED' },
          orderBy: { status: 'desc' },
          skip: 0,
          take: 1,
        }),
      );
      expect(result).toMatchObject({ total: 2, totalPages: 2, hasNext: true, hasPrevious: false });
    });

    it('uses createdAt ordering and no filters by default', async () => {
      prisma.stockTake.findMany.mockResolvedValue([]);
      prisma.stockTake.count.mockResolvedValue(0);

      await service.findAllStockTakes(TENANT, { page: 1, limit: 10 } as never);

      expect(prisma.stockTake.findMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: TENANT },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ─── Metal Stock ──────────────────────────────────────────────

  describe('metal stock', () => {
    it('lists metal stock by location ordered by metal type and purity', async () => {
      prisma.metalStock.findMany.mockResolvedValue([{ id: 'ms-1' }]);

      const result = await service.getMetalStockByLocation(TENANT, 'loc-1');

      expect(prisma.metalStock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, locationId: 'loc-1' },
          orderBy: [{ metalType: 'asc' }, { purityFineness: 'desc' }],
        }),
      );
      expect(result).toEqual([{ id: 'ms-1' }]);
    });

    it('adjusts an existing metal stock row and adds weight and value', async () => {
      prisma.metalStock.findFirst.mockResolvedValue({ id: 'ms-1', weightMg: 1000, valuePaise: BigInt(5000) });
      prisma.metalStock.update.mockResolvedValue({ id: 'ms-1', weightMg: BigInt(1500) });

      const result = await service.adjustMetalStock(TENANT, USER, {
        locationId: 'loc-1',
        metalType: 'GOLD',
        purityFineness: 916,
        weightChangeMg: BigInt(500),
        valueChangePaise: BigInt(1000),
      } as never);

      expect(prisma.metalStock.update).toHaveBeenCalledWith({
        where: { id: 'ms-1' },
        data: { weightMg: BigInt(1500), valuePaise: BigInt(6000), updatedBy: USER },
      });
      expect(result).toEqual({ id: 'ms-1', weightMg: BigInt(1500) });
    });

    it('clamps negative value to zero when reducing an existing metal stock', async () => {
      prisma.metalStock.findFirst.mockResolvedValue({ id: 'ms-1', weightMg: BigInt(1000), valuePaise: BigInt(100) });
      prisma.metalStock.update.mockResolvedValue({});

      await service.adjustMetalStock(TENANT, USER, {
        locationId: 'loc-1',
        metalType: 'GOLD',
        purityFineness: 916,
        weightChangeMg: BigInt(-200),
        valueChangePaise: BigInt(-5000),
      } as never);

      expect(prisma.metalStock.update.mock.calls[0][0].data).toMatchObject({
        weightMg: BigInt(800),
        valuePaise: BigInt(0),
      });
    });

    it('rejects reducing existing metal stock below zero weight', async () => {
      prisma.metalStock.findFirst.mockResolvedValue({ id: 'ms-1', weightMg: BigInt(100), valuePaise: BigInt(100) });

      await expect(
        service.adjustMetalStock(TENANT, USER, {
          locationId: 'loc-1',
          metalType: 'GOLD',
          purityFineness: 916,
          weightChangeMg: BigInt(-500),
          valueChangePaise: BigInt(0),
        } as never),
      ).rejects.toThrow('Metal stock weight cannot go below zero');
      expect(prisma.metalStock.update).not.toHaveBeenCalled();
    });

    it('creates a new metal stock row when none exists', async () => {
      prisma.metalStock.findFirst.mockResolvedValue(null);
      prisma.metalStock.create.mockResolvedValue({ id: 'ms-new' });

      const result = await service.adjustMetalStock(TENANT, USER, {
        locationId: 'loc-1',
        metalType: 'SILVER',
        purityFineness: 925,
        weightChangeMg: BigInt(300),
        valueChangePaise: BigInt(-10),
      } as never);

      expect(prisma.metalStock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT,
          locationId: 'loc-1',
          metalType: 'SILVER',
          purityFineness: 925,
          weightMg: BigInt(300),
          valuePaise: BigInt(0),
          createdBy: USER,
        }),
      });
      expect(result).toEqual({ id: 'ms-new' });
    });

    it('keeps positive value when creating a new metal stock row', async () => {
      prisma.metalStock.findFirst.mockResolvedValue(null);
      prisma.metalStock.create.mockResolvedValue({ id: 'ms-new2' });

      await service.adjustMetalStock(TENANT, USER, {
        locationId: 'loc-1',
        metalType: 'GOLD',
        purityFineness: 999,
        weightChangeMg: BigInt(10),
        valueChangePaise: BigInt(77),
      } as never);

      expect(prisma.metalStock.create.mock.calls[0][0].data.valuePaise).toBe(BigInt(77));
    });

    it('rejects deducting from metal stock that does not exist', async () => {
      prisma.metalStock.findFirst.mockResolvedValue(null);

      await expect(
        service.adjustMetalStock(TENANT, USER, {
          locationId: 'loc-1',
          metalType: 'GOLD',
          purityFineness: 916,
          weightChangeMg: BigInt(-1),
          valueChangePaise: BigInt(0),
        } as never),
      ).rejects.toThrow('Cannot deduct from non-existent metal stock');
    });
  });

  // ─── Stone Stock ──────────────────────────────────────────────

  describe('stone stock', () => {
    it('lists stone stock by location ordered by stone type', async () => {
      prisma.stoneStock.findMany.mockResolvedValue([{ id: 'ss-1' }]);

      const result = await service.getStoneStockByLocation(TENANT, 'loc-1');

      expect(prisma.stoneStock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, locationId: 'loc-1' },
          orderBy: { stoneType: 'asc' },
        }),
      );
      expect(result).toEqual([{ id: 'ss-1' }]);
    });

    it('creates stone stock with optional attributes defaulted to null', async () => {
      prisma.stoneStock.create.mockResolvedValue({ id: 'ss-new' });

      const result = await service.createStoneStock(TENANT, USER, {
        locationId: 'loc-1',
        stoneType: 'DIAMOND',
        totalWeightCt: 2.5,
        totalPieces: 4,
        valuePaise: BigInt(250000),
      } as never);

      expect(prisma.stoneStock.create.mock.calls[0][0].data).toMatchObject({
        tenantId: TENANT,
        locationId: 'loc-1',
        stoneType: 'DIAMOND',
        shape: null,
        sizeRange: null,
        color: null,
        clarity: null,
        cutGrade: null,
        certificationNumber: null,
        totalWeightCt: 2.5,
        totalPieces: 4,
        valuePaise: BigInt(250000),
      });
      expect(result).toEqual({ id: 'ss-new' });
    });

    it('creates stone stock with all optional attributes provided', async () => {
      prisma.stoneStock.create.mockResolvedValue({ id: 'ss-full' });

      await service.createStoneStock(TENANT, USER, {
        locationId: 'loc-1',
        stoneType: 'RUBY',
        shape: 'OVAL',
        sizeRange: '3-4mm',
        color: 'RED',
        clarity: 'VS',
        cutGrade: 'EX',
        totalWeightCt: 1,
        totalPieces: 1,
        valuePaise: BigInt(1),
        certificationNumber: 'CERT-1',
      } as never);

      expect(prisma.stoneStock.create.mock.calls[0][0].data).toMatchObject({
        shape: 'OVAL',
        sizeRange: '3-4mm',
        color: 'RED',
        clarity: 'VS',
        cutGrade: 'EX',
        certificationNumber: 'CERT-1',
      });
    });

    it('throws NotFoundException when adjusting unknown stone stock', async () => {
      prisma.stoneStock.findFirst.mockResolvedValue(null);

      await expect(
        service.adjustStoneStock(TENANT, USER, { id: 'nope', weightChangeCt: 1, piecesChange: 1, valueChangePaise: BigInt(0) } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects adjustments that drive weight or pieces below zero', async () => {
      prisma.stoneStock.findFirst.mockResolvedValue({ id: 'ss-1', totalWeightCt: 1, totalPieces: 2, valuePaise: BigInt(10) });

      await expect(
        service.adjustStoneStock(TENANT, USER, { id: 'ss-1', weightChangeCt: -2, piecesChange: 0, valueChangePaise: BigInt(0) } as never),
      ).rejects.toThrow('Stone stock weight/pieces cannot go below zero');

      await expect(
        service.adjustStoneStock(TENANT, USER, { id: 'ss-1', weightChangeCt: 0, piecesChange: -3, valueChangePaise: BigInt(0) } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates stone stock and clamps negative value to zero', async () => {
      prisma.stoneStock.findFirst.mockResolvedValue({ id: 'ss-1', totalWeightCt: 3, totalPieces: 5, valuePaise: BigInt(100) });
      prisma.stoneStock.update.mockResolvedValue({ id: 'ss-1' });

      const result = await service.adjustStoneStock(TENANT, USER, {
        id: 'ss-1',
        weightChangeCt: -1,
        piecesChange: 2,
        valueChangePaise: BigInt(-500),
      } as never);

      expect(prisma.stoneStock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ss-1' },
          data: { totalWeightCt: 2, totalPieces: 7, valuePaise: BigInt(0), updatedBy: USER },
        }),
      );
      expect(result).toEqual({ id: 'ss-1' });
    });

    it('updates stone stock adding positive value', async () => {
      prisma.stoneStock.findFirst.mockResolvedValue({ id: 'ss-2', totalWeightCt: 1, totalPieces: 1, valuePaise: BigInt(100) });
      prisma.stoneStock.update.mockResolvedValue({ id: 'ss-2' });

      await service.adjustStoneStock(TENANT, USER, {
        id: 'ss-2',
        weightChangeCt: 1,
        piecesChange: 0,
        valueChangePaise: BigInt(50),
      } as never);

      expect(prisma.stoneStock.update.mock.calls[0][0].data.valuePaise).toBe(BigInt(150));
    });
  });

  // ─── Batch / Lot ──────────────────────────────────────────────

  describe('batch lots', () => {
    it('creates a batch lot with current quantity seeded from initial quantity', async () => {
      prisma.batchLot.create.mockResolvedValue({ id: 'bl-1' });

      const result = await service.createBatchLot(TENANT, USER, {
        productId: 'prod-1',
        batchNumber: 'B-1',
        sourceType: 'PURCHASE',
        quantityInitial: 50,
      } as never);

      expect(prisma.batchLot.create.mock.calls[0][0].data).toMatchObject({
        tenantId: TENANT,
        productId: 'prod-1',
        batchNumber: 'B-1',
        lotNumber: null,
        sourceType: 'PURCHASE',
        sourceId: null,
        quantityInitial: 50,
        quantityCurrent: 50,
        expiryDate: null,
        notes: null,
      });
      expect(result).toEqual({ id: 'bl-1' });
    });

    it('passes through optional lot fields when provided', async () => {
      prisma.batchLot.create.mockResolvedValue({ id: 'bl-2' });
      const expiryDate = new Date('2027-01-01');

      await service.createBatchLot(TENANT, USER, {
        productId: 'prod-1',
        batchNumber: 'B-2',
        lotNumber: 'L-9',
        sourceType: 'MANUFACTURING',
        sourceId: 'mo-1',
        quantityInitial: 5,
        expiryDate,
        notes: 'fragile',
      } as never);

      expect(prisma.batchLot.create.mock.calls[0][0].data).toMatchObject({
        lotNumber: 'L-9',
        sourceId: 'mo-1',
        expiryDate,
        notes: 'fragile',
      });
    });

    it('lists batch lots with optional product filter and pagination', async () => {
      prisma.batchLot.findMany.mockResolvedValue([{ id: 'bl-1' }]);
      prisma.batchLot.count.mockResolvedValue(12);

      const result = await service.findBatchLotsByProduct(TENANT, {
        page: 2,
        limit: 4,
        sortBy: 'batchNumber',
        sortOrder: 'asc',
        productId: 'prod-1',
      } as never);

      expect(prisma.batchLot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, productId: 'prod-1' },
          orderBy: { batchNumber: 'asc' },
          skip: 4,
          take: 4,
        }),
      );
      expect(result).toMatchObject({ total: 12, totalPages: 3, hasNext: true, hasPrevious: true });
    });

    it('lists all batch lots by createdAt desc when no product is given', async () => {
      prisma.batchLot.findMany.mockResolvedValue([]);
      prisma.batchLot.count.mockResolvedValue(0);

      await service.findBatchLotsByProduct(TENANT, { page: 1, limit: 10 } as never);

      expect(prisma.batchLot.findMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: TENANT },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws NotFoundException when adjusting unknown batch lot', async () => {
      prisma.batchLot.findFirst.mockResolvedValue(null);

      await expect(service.adjustBatchLotQuantity(TENANT, USER, 'nope', 1)).rejects.toThrow(NotFoundException);
    });

    it('rejects adjustments that take quantity below zero', async () => {
      prisma.batchLot.findFirst.mockResolvedValue({ id: 'bl-1', quantityCurrent: 2 });

      await expect(service.adjustBatchLotQuantity(TENANT, USER, 'bl-1', -3)).rejects.toThrow(
        'Batch lot quantity cannot go below zero',
      );
      expect(prisma.batchLot.update).not.toHaveBeenCalled();
    });

    it('adjusts batch lot quantity', async () => {
      prisma.batchLot.findFirst.mockResolvedValue({ id: 'bl-1', quantityCurrent: 5 });
      prisma.batchLot.update.mockResolvedValue({ id: 'bl-1', quantityCurrent: 9 });

      const result = await service.adjustBatchLotQuantity(TENANT, USER, 'bl-1', 4);

      expect(prisma.batchLot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bl-1' },
          data: { quantityCurrent: 9, updatedBy: USER },
        }),
      );
      expect(result).toMatchObject({ quantityCurrent: 9 });
    });
  });

  // ─── Serial Numbers ───────────────────────────────────────────

  describe('serial numbers', () => {
    it('rejects duplicate serial numbers within the tenant', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue({ id: 'sn-existing' });

      await expect(
        service.createSerialNumber(TENANT, USER, { productId: 'p', serialNumber: 'SN-1' } as never),
      ).rejects.toThrow('Serial number already exists');
      expect(prisma.serialNumber.create).not.toHaveBeenCalled();
    });

    it('creates a serial number with AVAILABLE status and optional tags defaulted to null', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue(null);
      prisma.serialNumber.create.mockResolvedValue({ id: 'sn-1' });

      const result = await service.createSerialNumber(TENANT, USER, {
        productId: 'p1',
        serialNumber: 'SN-2',
      } as never);

      expect(prisma.serialNumber.create.mock.calls[0][0].data).toMatchObject({
        tenantId: TENANT,
        productId: 'p1',
        serialNumber: 'SN-2',
        batchLotId: null,
        locationId: null,
        status: 'AVAILABLE',
        rfidTag: null,
        barcodeData: null,
      });
      expect(result).toEqual({ id: 'sn-1' });
    });

    it('creates a serial number with supplied batch, location, RFID and barcode', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue(null);
      prisma.serialNumber.create.mockResolvedValue({ id: 'sn-2' });

      await service.createSerialNumber(TENANT, USER, {
        productId: 'p1',
        serialNumber: 'SN-3',
        batchLotId: 'bl-1',
        locationId: 'loc-1',
        rfidTag: 'RFID-3',
        barcodeData: 'BAR-3',
      } as never);

      expect(prisma.serialNumber.create.mock.calls[0][0].data).toMatchObject({
        batchLotId: 'bl-1',
        locationId: 'loc-1',
        rfidTag: 'RFID-3',
        barcodeData: 'BAR-3',
      });
    });

    it('throws NotFoundException when updating an unknown serial number', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSerialNumberStatus(TENANT, USER, { id: 'nope', status: 'SOLD' } as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates serial status and keeps existing location when none is supplied', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue({ id: 'sn-1', locationId: 'loc-old' });
      prisma.serialNumber.update.mockResolvedValue({ id: 'sn-1', status: 'SOLD' });

      const result = await service.updateSerialNumberStatus(TENANT, USER, { id: 'sn-1', status: 'SOLD' } as never);

      expect(prisma.serialNumber.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sn-1' },
          data: { status: 'SOLD', locationId: 'loc-old', updatedBy: USER },
        }),
      );
      expect(result).toMatchObject({ status: 'SOLD' });
    });

    it('updates serial status and location when a new location is supplied', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue({ id: 'sn-1', locationId: 'loc-old' });
      prisma.serialNumber.update.mockResolvedValue({ id: 'sn-1' });

      await service.updateSerialNumberStatus(TENANT, USER, {
        id: 'sn-1',
        status: 'TRANSFERRED',
        locationId: 'loc-new',
      } as never);

      expect(prisma.serialNumber.update.mock.calls[0][0].data.locationId).toBe('loc-new');
    });

    it('finds serial by number with related product, location and batch', async () => {
      const serial = { id: 'sn-1', serialNumber: 'SN-1', batchLot: { id: 'bl-1' } };
      prisma.serialNumber.findFirst.mockResolvedValue(serial);

      const result = await service.findSerialByNumber(TENANT, 'SN-1');

      expect(prisma.serialNumber.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, serialNumber: 'SN-1' },
          include: expect.objectContaining({ batchLot: true }),
        }),
      );
      expect(result).toBe(serial);
    });

    it('throws NotFoundException when serial number lookup fails', async () => {
      prisma.serialNumber.findFirst.mockResolvedValue(null);

      await expect(service.findSerialByNumber(TENANT, 'missing')).rejects.toThrow(NotFoundException);
    });

    it('lists serial numbers with every filter and search across serial, RFID and barcode', async () => {
      prisma.serialNumber.findMany.mockResolvedValue([{ id: 'sn-1' }]);
      prisma.serialNumber.count.mockResolvedValue(6);

      const result = await service.findAllSerialNumbers(TENANT, {
        page: 1,
        limit: 2,
        sortBy: 'serialNumber',
        sortOrder: 'asc',
        productId: 'p1',
        locationId: 'loc-1',
        status: 'AVAILABLE',
        search: 'ABC',
      } as never);

      expect(prisma.serialNumber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: TENANT,
            productId: 'p1',
            locationId: 'loc-1',
            status: 'AVAILABLE',
            OR: [
              { serialNumber: { contains: 'ABC' } },
              { rfidTag: { contains: 'ABC' } },
              { barcodeData: { contains: 'ABC' } },
            ],
          },
          orderBy: { serialNumber: 'asc' },
          skip: 0,
          take: 2,
        }),
      );
      expect(result).toMatchObject({ total: 6, totalPages: 3, hasNext: true, hasPrevious: false });
    });

    it('lists serial numbers without filters using createdAt desc', async () => {
      prisma.serialNumber.findMany.mockResolvedValue([]);
      prisma.serialNumber.count.mockResolvedValue(0);

      await service.findAllSerialNumbers(TENANT, { page: 1, limit: 10 } as never);

      expect(prisma.serialNumber.findMany.mock.calls[0][0]).toMatchObject({
        where: { tenantId: TENANT },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ─── Dashboard ────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('aggregates stock value, low stock alerts, metal and stone breakdowns', async () => {
      const stockItems = [
        stockItemFixture({ id: 'a', quantityOnHand: 3, product: { id: 'p1', sku: 'S1', name: 'A', costPricePaise: BigInt(100) } }),
        stockItemFixture({ id: 'b', quantityOnHand: 2, product: { id: 'p2', sku: 'S2', name: 'B', costPricePaise: null } }),
      ];
      const lowStock = [
        stockItemFixture({ id: 'low', productId: 'p3', quantityOnHand: 1, reorderLevel: 4 }),
        stockItemFixture({ id: 'fine', productId: 'p4', quantityOnHand: 10, reorderLevel: 4 }),
      ];
      prisma.stockItem.findMany
        .mockResolvedValueOnce(stockItems)
        .mockResolvedValueOnce(lowStock);
      prisma.stockTransfer.count.mockResolvedValue(2);
      prisma.metalStock.findMany.mockResolvedValue([
        { metalType: 'GOLD', purityFineness: 916, weightMg: BigInt(1000), valuePaise: BigInt(5000) },
      ]);
      prisma.stoneStock.findMany.mockResolvedValue([
        { stoneType: 'DIAMOND', totalWeightCt: 1.5, totalPieces: 2, valuePaise: BigInt(100) },
        { stoneType: 'DIAMOND', totalWeightCt: 0.5, totalPieces: 1, valuePaise: BigInt(50) },
        { stoneType: 'RUBY', totalWeightCt: 2, totalPieces: 4, valuePaise: BigInt(200) },
      ]);
      prisma.stockMovement.findMany.mockResolvedValue([{ id: 'mv-1' }]);

      const result = await service.getDashboard(TENANT);

      expect(result.totalStockValuePaise).toBe(BigInt(300));
      expect(result.totalSKUs).toBe(2);
      expect(result.pendingTransfers).toBe(2);
      expect(result.lowStockAlerts).toEqual([
        {
          stockItemId: 'low',
          productId: 'p3',
          productName: 'Ring',
          sku: 'SKU-1',
          locationName: 'Main',
          quantityOnHand: 1,
          reorderLevel: 4,
        },
      ]);
      expect(result.metalBreakdown).toEqual([
        { metalType: 'GOLD', purityFineness: 916, totalWeightMg: BigInt(1000), totalValuePaise: BigInt(5000) },
      ]);
      expect(result.stoneBreakdown).toEqual([
        { stoneType: 'DIAMOND', totalWeightCt: 2, totalPieces: 3, totalValuePaise: BigInt(150) },
        { stoneType: 'RUBY', totalWeightCt: 2, totalPieces: 4, totalValuePaise: BigInt(200) },
      ]);
      expect(result.recentMovements).toEqual([{ id: 'mv-1' }]);
      expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { movedAt: 'desc' }, take: 10 }),
      );
    });
  });

  // ─── Product with stock ───────────────────────────────────────

  describe('getProductWithStock', () => {
    it('throws NotFoundException when the product is not found for the tenant', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.getProductWithStock(TENANT, 'missing')).rejects.toThrow('Product not found');
      expect(prisma.stockItem.findMany).not.toHaveBeenCalled();
    });

    it('returns product details mapped to the mobile shape with per-location availability', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        sku: 'GR-1',
        name: 'Gold Ring',
        productType: 'GOLD_JEWELRY',
        description: 'Solid',
        metalPurity: 916,
        metalWeightMg: 5000,
        costPricePaise: BigInt(500000),
        sellingPricePaise: BigInt(650000),
        images: ['a.jpg', 42, 'b.jpg'],
      });
      prisma.stockItem.findMany.mockResolvedValue([
        { locationId: 'loc-1', quantityOnHand: 5, quantityReserved: 2, location: { id: 'loc-1', name: 'Main' } },
      ]);

      const result = await service.getProductWithStock(TENANT, 'prod-1');

      expect(result.product).toEqual({
        id: 'prod-1',
        sku: 'GR-1',
        name: 'Gold Ring',
        productType: 'GOLD_JEWELRY',
        description: 'Solid',
        metalType: 'GOLD',
        purityFineness: 916,
        weightMg: 5000,
        costPricePaise: 500000,
        sellingPricePaise: 650000,
        hsnCode: '7113',
        images: ['a.jpg', 'b.jpg'],
      });
      expect(result.stockByLocation).toEqual([
        {
          locationId: 'loc-1',
          locationName: 'Main',
          quantity: 5,
          reservedQuantity: 2,
          quantityOnHand: 5,
          quantityAvailable: 3,
        },
      ]);
    });

    it.each([
      ['SILVER_JEWELRY', 'SILVER'],
      ['PLATINUM_JEWELRY', 'PLATINUM'],
      ['FINISHED_GOODS', null],
    ])('maps product type %s to metal type %s', async (productType, metalType) => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p',
        sku: 's',
        name: 'n',
        productType,
        images: 'not-an-array',
      });
      prisma.stockItem.findMany.mockResolvedValue([]);

      const result = await service.getProductWithStock(TENANT, 'p');

      expect(result.product.metalType).toBe(metalType);
      expect(result.product.images).toEqual([]);
      expect(result.stockByLocation).toEqual([]);
    });

    it('defaults missing optional numeric and text fields', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'p',
        sku: 's',
        name: 'n',
        productType: 'FINISHED_GOODS',
        description: undefined,
        metalPurity: undefined,
        metalWeightMg: null,
        costPricePaise: null,
        sellingPricePaise: null,
        images: null,
      });
      prisma.stockItem.findMany.mockResolvedValue([]);

      const result = await service.getProductWithStock(TENANT, 'p');

      expect(result.product).toMatchObject({
        description: null,
        purityFineness: 0,
        weightMg: 0,
        costPricePaise: 0,
        sellingPricePaise: 0,
        images: [],
      });
    });
  });
});
