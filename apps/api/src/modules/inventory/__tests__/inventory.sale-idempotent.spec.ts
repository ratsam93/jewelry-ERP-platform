import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryEventHandler } from '../inventory.event-handler';
import { createMockPrismaService, createMockEventBus, TEST_TENANT_ID, TEST_USER_ID } from '../../../__tests__/setup';

// HK-POS-02: RetailService decrements inside the sale transaction; the event handler must not double-decrement.
describe('InventoryEventHandler retail.sale.completed idempotency', () => {
  let subscribed: Map<string, (...args: any[]) => any>;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let inventory: { recordMovement: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const bus = createMockEventBus();
    prisma = createMockPrismaService();
    inventory = { recordMovement: vi.fn().mockResolvedValue({ id: 'm' }) };
    subscribed = new Map();
    bus.subscribe.mockImplementation((t: string, h: (...args: any[]) => any) => subscribed.set(t, h));
    new InventoryEventHandler(bus as any, prisma as any, inventory as any).onModuleInit();
  });

  const event = {
    type: 'retail.sale.completed',
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    payload: { saleId: 'sale-9', locationId: 'loc-1', items: [{ productId: 'prod-1', quantity: 2, pricePaise: 1 }] },
  };

  it('skips when a RETAIL_SALE movement for the sale already exists', async () => {
    prisma.stockMovement.findFirst.mockResolvedValue({ id: 'mv-existing' });
    prisma.stockItem.findMany.mockResolvedValue([{ id: 'stock-1', productId: 'prod-1' }]);

    await subscribed.get('retail.sale.completed')!(event);

    expect(prisma.stockMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TEST_TENANT_ID, referenceType: 'RETAIL_SALE', referenceId: 'sale-9' },
      }),
    );
    expect(inventory.recordMovement).not.toHaveBeenCalled();
  });

  it('falls back to decrementing the sale location when no movement exists yet', async () => {
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockItem.findMany.mockResolvedValue([{ id: 'stock-1', productId: 'prod-1' }]);

    await subscribed.get('retail.sale.completed')!(event);

    expect(prisma.stockItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: 'prod-1', locationId: 'loc-1' }) }),
    );
    expect(inventory.recordMovement).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      TEST_USER_ID,
      expect.objectContaining({ stockItemId: 'stock-1', movementType: 'OUT', quantityChange: -2, referenceId: 'sale-9' }),
    );
  });
});
