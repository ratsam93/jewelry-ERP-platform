import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrmScheduler } from '../crm.scheduler';

vi.mock('bullmq', () => ({
  Queue: vi.fn(function () { return ({ add: vi.fn(), on: vi.fn(), close: vi.fn() }); }),
  Worker: vi.fn(function () { return ({ on: vi.fn(), close: vi.fn() }); }),
}));

function make() {
  const prisma = {
    tenant: { findMany: vi.fn().mockResolvedValue([{ id: 't1' }, { id: 't2' }]) },
  };
  const svcs = { notifications: { sendOccasionReminders: vi.fn() }, loyalty: { expirePoints: vi.fn() } };
  const s = new CrmScheduler(prisma as never, svcs.notifications as never, svcs.loyalty as never);
  return { s, prisma, svcs };
}

describe('CrmScheduler', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  beforeEach(() => vi.clearAllMocks());

  it('crm-occasion-reminders: calls notifications.sendOccasionReminders once per active tenant and survives a failing tenant', async () => {
    const { s, prisma, svcs } = make();
    svcs.notifications.sendOccasionReminders.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(1);
    await s.runOccasionReminders();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } });
    expect(svcs.notifications.sendOccasionReminders).toHaveBeenCalledTimes(2);
    expect(svcs.notifications.sendOccasionReminders).toHaveBeenCalledWith('t1');
    expect(svcs.notifications.sendOccasionReminders).toHaveBeenCalledWith('t2');
  });

  it('crm-expire-loyalty-points: calls loyalty.expirePoints once per active tenant and survives a failing tenant', async () => {
    const { s, prisma, svcs } = make();
    svcs.loyalty.expirePoints.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(1);
    await s.runExpirePoints();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } });
    expect(svcs.loyalty.expirePoints).toHaveBeenCalledTimes(2);
    expect(svcs.loyalty.expirePoints).toHaveBeenCalledWith('t1');
    expect(svcs.loyalty.expirePoints).toHaveBeenCalledWith('t2');
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
    expect(q.add).toHaveBeenCalledTimes(2);
    await s.onModuleDestroy();
  });
});
