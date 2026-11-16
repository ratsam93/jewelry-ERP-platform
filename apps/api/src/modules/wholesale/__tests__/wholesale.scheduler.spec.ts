import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WholesaleScheduler } from '../wholesale.scheduler';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn(), close: vi.fn() })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
}));

function make() {
  const prisma = {
    tenant: { findMany: vi.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]) },
  };
  const svcs = { credit: { updateAgingStatuses: vi.fn() } };
  const s = new WholesaleScheduler(prisma as never, svcs.credit as never);
  return { s, prisma, svcs };
}

describe('WholesaleScheduler', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  beforeEach(() => vi.clearAllMocks());

  it('wholesale-credit-aging: calls credit.updateAgingStatuses once per active tenant and survives a failing tenant', async () => {
    const { s, prisma, svcs } = make();
    svcs.credit.updateAgingStatuses.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(1);
    await s.runCreditAging();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } });
    expect(svcs.credit.updateAgingStatuses).toHaveBeenCalledTimes(2);
    expect(svcs.credit.updateAgingStatuses).toHaveBeenCalledWith('t1');
    expect(svcs.credit.updateAgingStatuses).toHaveBeenCalledWith('t2');
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
