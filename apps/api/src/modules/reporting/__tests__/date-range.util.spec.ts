import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inclusiveRangeEnd } from '../date-range.util';
import { ReportingManufacturingService } from '../reporting.manufacturing.service';
import { createMockPrismaService, TEST_TENANT_ID } from '../../../__tests__/setup';

describe('inclusiveRangeEnd', () => {
  it('extends a date-only (midnight UTC) end to the last millisecond of that day', () => {
    const end = inclusiveRangeEnd(new Date('2026-11-16'));
    expect(end.toISOString()).toBe('2026-11-16T23:59:59.999Z');
  });

  it('keeps an end that already has a time component', () => {
    const to = new Date('2026-11-16T10:30:00.000Z');
    expect(inclusiveRangeEnd(to).toISOString()).toBe('2026-11-16T10:30:00.000Z');
  });

  it('includes a job created in the afternoon of the last day', () => {
    const createdAt = new Date('2026-11-16T15:00:00.000Z').getTime();
    const naive = new Date('2026-11-16').getTime();
    expect(createdAt <= naive).toBe(false);
    expect(createdAt <= inclusiveRangeEnd(new Date('2026-11-16')).getTime()).toBe(true);
  });
});

describe('reporting date-range upper bound (HK-RPT-01)', () => {
  it('jobSummary filters createdAt up to the end of the "to" day', async () => {
    const base = createMockPrismaService();
    const prisma = { ...base, jobOrder: { ...base.jobOrder, groupBy: vi.fn().mockResolvedValue([]) } };
    prisma.jobOrder.findMany.mockResolvedValue([]);
    prisma.jobOrder.count.mockResolvedValue(0);
    const service = new ReportingManufacturingService(prisma as any);

    await service.jobSummary(TEST_TENANT_ID, { from: new Date('2026-11-01'), to: new Date('2026-11-16') });

    const where = prisma.jobOrder.groupBy.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(where.createdAt.lte.toISOString()).toBe('2026-11-16T23:59:59.999Z');
  });

  it('no reporting service filters with a raw `dateRange.to` upper bound', () => {
    const dir = join(__dirname, '..');
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.service.ts'))) {
      const src = readFileSync(join(dir, file), 'utf8');
      if (/lte:\s*dateRange\.to\b/.test(src) || /push\(request\.dateRange\.to\)/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
