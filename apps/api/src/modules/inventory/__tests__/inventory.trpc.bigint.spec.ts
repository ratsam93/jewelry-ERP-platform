import { describe, it, expect, vi } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { InventoryTrpcRouter } from '../inventory.trpc';
import { coerceBigIntFields } from '../inventory.bigint-input';

// The web client sends mg / paise as decimal strings (JSON cannot carry a BigInt).
describe('inventory tRPC bigint inputs', () => {
  const svc = {
    adjustMetalStock: vi.fn().mockResolvedValue({ id: 'm1' }),
    createMetalRecovery: vi.fn().mockResolvedValue({ id: 'r1' }),
    stockTakes: undefined,
  };
  const valuation = { calculateValuation: vi.fn().mockResolvedValue({}) };
  const router = new InventoryTrpcRouter(new TrpcService(), svc as never, valuation as never);
  const caller = router.router.createCaller({
    tenantId: 't1', userId: 'u1', userRole: 'admin', userPermissions: ['*'],
  } as never);
  const locationId = '41692d3e-00d8-4936-84aa-8c1bd6409080';

  it('metalStock.adjust accepts decimal strings and passes bigint to the service', async () => {
    await caller.metalStock.adjust({
      locationId, metalType: 'GOLD', purityFineness: 916,
      weightChangeMg: '10000', valueChangePaise: '-500000', notes: 'recount',
    } as never);
    expect(svc.adjustMetalStock).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({
      weightChangeMg: 10000n, valueChangePaise: -500000n, notes: 'recount',
    }));
  });

  it('still accepts real bigints', async () => {
    await caller.metalStock.adjust({
      locationId, metalType: 'GOLD', purityFineness: 916, weightChangeMg: 5n, valueChangePaise: 0n,
    } as never);
    expect(svc.adjustMetalStock).toHaveBeenLastCalledWith('t1', 'u1', expect.objectContaining({ weightChangeMg: 5n }));
  });

  it('rejects non-numeric strings with a validation error', async () => {
    await expect(caller.metalStock.adjust({
      locationId, metalType: 'GOLD', purityFineness: 916, weightChangeMg: '10.5g', valueChangePaise: '0',
    } as never)).rejects.toThrow();
  });

  it('valuation.calculate accepts a string rate', async () => {
    await caller.valuation.calculate({ method: 'MARKET', currentRatePaise: '600000' } as never);
    expect(valuation.calculateValuation).toHaveBeenCalledWith('t1', expect.objectContaining({ currentRatePaise: 600000n }));
  });

  it('coerceBigIntFields leaves other fields and non-objects alone', () => {
    expect(coerceBigIntFields({ a: '1', b: '2' }, ['a'])).toEqual({ a: 1n, b: '2' });
    expect(coerceBigIntFields(null, ['a'])).toBeNull();
  });
});
