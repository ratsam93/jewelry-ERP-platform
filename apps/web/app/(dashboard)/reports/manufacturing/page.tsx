'use client';

import { PageHeader } from '@caratflow/ui';
import type { ManufacturingReportResponse } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { DateRangePicker, ReportExportMenu } from '@/features/reporting';
import { useReportRange } from '@/features/reporting/useReportRange';
import { money, type ExportTable } from '@/lib/report-export';

export default function ManufacturingReportsPage() {
  const { range, onChange } = useReportRange();

  const { data, isLoading, isError } = trpc.reporting.jobSummary.useQuery({
    dateRange: { from: range.from, to: range.to },
  } as never);
  const d = data as Partial<ManufacturingReportResponse> | undefined;
  const rows = Array.isArray(d?.jobSummary) ? d.jobSummary : [];

  const getTable = (): ExportTable => ({
    headers: ['Status', 'Jobs', 'Est. Cost (INR)'],
    rows: [
      ...rows.map((r) => [r.status ?? '', r.count ?? 0, money(r.totalEstimatedCostPaise ?? 0)]),
      ['Total Jobs', d?.totalJobs ?? 0, ''],
      ['Completed Jobs', d?.completedJobs ?? 0, ''],
      ['Overdue Jobs', d?.overdueJobs ?? 0, ''],
    ],
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Manufacturing Reports" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'Manufacturing' },
      ]} />
      <div className="flex flex-wrap items-start gap-3">
        <DateRangePicker from={range.from} to={range.to} onChange={onChange} />
        <ReportExportMenu fileBase="manufacturing-report" from={range.from} to={range.to} getTable={getTable} disabled={isLoading || isError || !d} />
      </div>
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-destructive">Failed to load manufacturing report.</div>
      ) : (
        <>
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Jobs</span><span>{String(d?.totalJobs ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Completed Jobs</span><span>{String(d?.completedJobs ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Overdue Jobs</span><span>{String(d?.overdueJobs ?? 0)}</span></div>
          </div>
          <div className="rounded-lg border">
            <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
              <span>Status</span>
              <span>Jobs</span>
              <span>Est. Cost</span>
            </div>
            {rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No data</div>
            ) : (
              <div className="divide-y">
                {rows.map((r, idx) => (
                  <div key={`${r.status}-${idx}`} className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                    <span>{r.status ?? '-'}</span>
                    <span>{String(r.count ?? 0)}</span>
                    <span>{formatPaise(r.totalEstimatedCostPaise ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
