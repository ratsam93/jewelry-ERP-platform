import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComplianceScheduler } from '../compliance.scheduler';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), on: vi.fn(), close: vi.fn() })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
}));

function make() {
  const prisma = {
    tenant: { findMany: vi.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]) },
  };
  const svcs = { insurance: { markExpiredPolicies: vi.fn() } };
  const s = new ComplianceScheduler(prisma as never, svcs.insurance as never);
  return { s, prisma, svcs };
}

describe('ComplianceScheduler', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  beforeEach(() => vi.clearAllMocks());

  it('compliance-mark-expired-policies: calls insurance.markExpiredPolicies once per active tenant and survives a failing tenant', async () => {
    const { s, prisma, svcs } = make();
    svcs.insurance.markExpiredPolicies.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(1);
    await s.runExpiredPolicies();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } });
    expect(svcs.insurance.markExpiredPolicies).toHaveBeenCalledTimes(2);
    expect(svcs.insurance.markExpiredPolicies).toHaveBeenCalledWith('t1');
    expect(svcs.insurance.markExpiredPolicies).toHaveBeenCalledWith('t2');
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
