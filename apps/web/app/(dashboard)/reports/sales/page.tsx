'use client';

import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import type { SalesReportResponse } from '@caratflow/shared-types';
import { formatPaise } from '@/components/format';
import { DateRangePicker, ReportExportMenu } from '@/features/reporting';
import { useReportRange } from '@/features/reporting/useReportRange';
import { money, type ExportTable } from '@/lib/report-export';

export default function SalesReportPage() {
  const { range, onChange } = useReportRange();

  const { data, isLoading, isError } = trpc.reporting.salesByPeriod.useQuery({
    dateRange: { from: range.from, to: range.to },
    groupBy: 'day',
  } as never);
  // The API returns { summary: SalesSummaryRow[], totals }, not a bare array.
  const report = data as Partial<SalesReportResponse> | undefined;
  const rows = Array.isArray(report?.summary) ? report.summary : [];

  const getTable = (): ExportTable => ({
    headers: ['Period', 'Orders', 'Revenue (INR)', 'Avg Ticket (INR)', 'Returns', 'Net Revenue (INR)'],
    rows: rows.map((r) => [r.date ?? '', r.salesCount ?? 0, money(r.totalRevenuePaise), money(r.avgTicketPaise), r.returnCount ?? 0, money(r.netRevenuePaise)]),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Sales Report" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'Sales' },
      ]} />
      <div className="flex flex-wrap items-start gap-3">
        <DateRangePicker from={range.from} to={range.to} onChange={onChange} />
        <ReportExportMenu fileBase="sales-report" from={range.from} to={range.to} getTable={getTable} disabled={isLoading || isError || rows.length === 0} />
      </div>
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Period</span>
          <span>Orders</span>
          <span>Revenue</span>
          <span>Avg Ticket</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-destructive">Failed to load sales report.</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="divide-y">
            {rows.map((r, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                <span>{r.date ?? '-'}</span>
                <span>{String(r.salesCount ?? 0)}</span>
                <span>{formatPaise(r.totalRevenuePaise)}</span>
                <span>{formatPaise(r.avgTicketPaise)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
