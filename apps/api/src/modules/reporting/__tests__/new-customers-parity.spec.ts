import { describe, it, expect, vi } from 'vitest';
import { ReportingCrmService } from '../reporting.crm.service';
import { ReportingDashboardService } from '../reporting.dashboard.service';
import { createMockPrismaService, TEST_TENANT_ID } from '../../../__tests__/setup';

// HK-REP-04: CRM "New Customers in Period" and the dashboard "New Customers" KPI
// must count customers created within [from, to] inclusive, with the same bounds.
describe('New customers: CRM report vs dashboard KPI', () => {
  const range = { from: new Date('2026-11-01T00:00:00.000Z'), to: new Date('2026-11-17T00:00:00.000Z') };

  function setup() {
    const base: any = createMockPrismaService();
    const prisma: any = {
      ...base,
      saleReturn: { ...base.saleReturn, count: vi.fn().mockResolvedValue(0) },
      jobOrder: { ...base.jobOrder, count: vi.fn().mockResolvedValue(0) },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ cnt: 0n }]),
    };
    prisma.sale.aggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { totalPaise: null }, _avg: { totalPaise: null } });
    prisma.sale.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);
    return prisma;
  }

  const createdAtFilters = (prisma: any) =>
    (prisma.customer.count.mock.calls as Array<[{ where: { tenantId: string; createdAt?: { gte: Date; lte: Date } } }]>)
      .map(([arg]) => arg.where)
      .filter((w) => w.createdAt);

  it('use identical createdAt bounds and the whole last day is included', async () => {
    const crmPrisma = setup();
    await new ReportingCrmService(crmPrisma).crmOverview(TEST_TENANT_ID, range);
    const dashPrisma = setup();
    await new ReportingDashboardService(dashPrisma).getAnalyticsDashboard(TEST_TENANT_ID, range);

    const crm = createdAtFilters(crmPrisma);
    const dash = createdAtFilters(dashPrisma);
    expect(crm).toHaveLength(1);
    expect(dash.length).toBeGreaterThanOrEqual(1);

    // current-period filter is the first createdAt count on the dashboard
    expect(dash[0]!.createdAt).toEqual(crm[0]!.createdAt);
    expect(crm[0]!.createdAt!.gte.getTime()).toBe(range.from.getTime());
    expect(crm[0]!.createdAt!.lte.getTime()).toBe(new Date('2026-11-17T23:59:59.999Z').getTime());
    expect(crm[0]!.tenantId).toBe(dash[0]!.tenantId);
  });

  it('use the same bounds when `to` already carries a time (local end of day)', async () => {
    const withTime = { from: new Date('2026-11-01T00:00:00.000Z'), to: new Date('2026-11-17T18:29:59.999Z') };
    const crmPrisma = setup();
    await new ReportingCrmService(crmPrisma).crmOverview(TEST_TENANT_ID, withTime);
    const dashPrisma = setup();
    await new ReportingDashboardService(dashPrisma).getAnalyticsDashboard(TEST_TENANT_ID, withTime);
    expect(createdAtFilters(dashPrisma)[0]!.createdAt).toEqual(createdAtFilters(crmPrisma)[0]!.createdAt);
    expect(createdAtFilters(crmPrisma)[0]!.createdAt!.lte).toEqual(withTime.to);
  });
});
