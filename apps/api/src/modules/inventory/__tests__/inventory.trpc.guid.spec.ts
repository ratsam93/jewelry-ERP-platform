import { describe, it, expect, vi } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { InventoryTrpcRouter } from '../inventory.trpc';

// Seeded ids are UUID-shaped (8-4-4-4-12 hex) but not RFC 4122 (version nibble 9,
// variant nibble 'd'). Id inputs must accept them instead of returning BAD_REQUEST.
describe('InventoryTrpcRouter id validation', () => {
  const inventoryService = { findStockItemById: vi.fn().mockResolvedValue({ id: 'x' }) };
  const router = new InventoryTrpcRouter(
    new TrpcService(),
    inventoryService as never,
    {} as never,
  );
  const caller = router.router.createCaller({
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  } as never);

  it('accepts a non-RFC4122 seeded id in stockItems.getById', async () => {
    const id = '32570a44-b791-98ee-d02d-4945d5b5d71f';
    await expect(caller.stockItems.getById({ id })).resolves.toEqual({ id: 'x' });
    expect(inventoryService.findStockItemById).toHaveBeenCalledWith('tenant-1', id);
  });

  it('still rejects malformed ids', async () => {
    await expect(caller.stockItems.getById({ id: 'not-a-guid' })).rejects.toThrow();
  });
});
