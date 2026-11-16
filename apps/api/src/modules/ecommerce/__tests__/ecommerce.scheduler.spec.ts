import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EcommerceScheduler } from '../ecommerce.scheduler';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn(), close: vi.fn() })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
}));

function make() {
  const prisma = {
    tenant: { findMany: vi.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]) },
  };
  const svcs = { clickCollect: { handleExpired: vi.fn() } };
  const s = new EcommerceScheduler(prisma as never, svcs.clickCollect as never);
  return { s, prisma, svcs };
}

describe('EcommerceScheduler', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  beforeEach(() => vi.clearAllMocks());

  it('ecommerce-click-collect-expiry: calls clickCollect.handleExpired once per active tenant and survives a failing tenant', async () => {
    const { s, prisma, svcs } = make();
    svcs.clickCollect.handleExpired.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(1);
    await s.runClickCollectExpiry();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } });
    expect(svcs.clickCollect.handleExpired).toHaveBeenCalledTimes(2);
    expect(svcs.clickCollect.handleExpired).toHaveBeenCalledWith('t1');
    expect(svcs.clickCollect.handleExpired).toHaveBeenCalledWith('t2');
  });

  it('does not register queue when DISABLE_SCHEDULERS=true', async () => {
    process.env.DISABLE_SCHEDULERS = 'true';
    const { s } = make();
    await s.onModuleInit();
    const bullmq = await import('bullmq');
    expect(bullmq.Queue).not.toHaveBeenCalled();
  });

  it('registers repeat jobs when enabled', async () => {
    delete process.env.DISABLE_SCHEDULERS;
    process.env.NODE_ENV = 'production';
    const { s } = make();
    await s.onModuleInit();
    const bullmq = await import('bullmq');
    const q = (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    expect(q.add).toHaveBeenCalledTimes(1);
    await s.onModuleDestroy();
  });
});
