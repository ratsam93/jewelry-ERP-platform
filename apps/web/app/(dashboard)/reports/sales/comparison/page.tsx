'use client';

import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import type { SalesComparisonResponse } from '@caratflow/shared-types';
import { formatPaise } from '@/components/format';
import { DateRangePicker, ReportExportMenu } from '@/features/reporting';
import { useReportRange } from '@/features/reporting/useReportRange';
import { computePreset, toLocalDateString } from '@/lib/date-presets';
import { money, type ExportTable } from '@/lib/report-export';

export default function SalesComparisonPage() {
  const { range: p1, onChange: setP1 } = useReportRange();
  const { range: p2, onChange: setP2 } = useReportRange(() => computePreset('lastMonth'));

  const { data, isLoading, isError } = trpc.reporting.salesComparison.useQuery({
    period1: { from: p1.from, to: p1.to },
    period2: { from: p2.from, to: p2.to },
  });
  const d = data as Partial<SalesComparisonResponse> | undefined;
  const changePct = d?.changePercent?.revenue;

  const getTable = (): ExportTable => ({
    headers: ['Metric', 'Period 1', 'Period 2'],
    rows: [
      ['Date range', `${toLocalDateString(p1.from)} to ${toLocalDateString(p1.to)}`, `${toLocalDateString(p2.from)} to ${toLocalDateString(p2.to)}`],
      ['Revenue (INR)', money(d?.period1?.totals?.totalRevenuePaise ?? 0), money(d?.period2?.totals?.totalRevenuePaise ?? 0)],
      ['Sales', d?.period1?.totals?.totalSales ?? 0, d?.period2?.totals?.totalSales ?? 0],
      ['Revenue change (%)', typeof changePct === 'number' ? changePct : '', ''],
    ],
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Sales Comparison" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'Sales', href: '/reports/sales' },
        { label: 'Comparison' },
      ]} />
      <div className="flex justify-end">
        <ReportExportMenu fileBase="sales-comparison" from={p1.from} to={p1.to} getTable={getTable} disabled={isLoading || isError || !d} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-2">Period 1</h3>
          <DateRangePicker from={p1.from} to={p1.to} onChange={setP1} presets={false} />
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold mb-2">Period 2</h3>
          <DateRangePicker from={p2.from} to={p2.to} onChange={setP2} presets={false} />
        </div>
      </div>
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-destructive">Failed to load sales comparison.</div>
      ) : (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Period 1 Revenue</span><span>{formatPaise(d?.period1?.totals?.totalRevenuePaise ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Period 2 Revenue</span><span>{formatPaise(d?.period2?.totals?.totalRevenuePaise ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Period 1 Sales</span><span>{String(d?.period1?.totals?.totalSales ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Period 2 Sales</span><span>{String(d?.period2?.totals?.totalSales ?? 0)}</span></div>
          <div className="flex justify-between border-t pt-2 font-semibold"><span>Revenue change</span><span>{typeof changePct === 'number' ? `${changePct}%` : '-'}</span></div>
        </div>
      )}
    </div>
  );
}
