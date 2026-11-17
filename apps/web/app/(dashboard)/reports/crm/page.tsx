'use client';

import { PageHeader } from '@caratflow/ui';
import type { CrmReportResponse } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { DateRangePicker, ReportExportMenu } from '@/features/reporting';
import { useReportRange } from '@/features/reporting/useReportRange';
import { money, type ExportTable } from '@/lib/report-export';

export default function CrmReportsPage() {
  const { range, onChange } = useReportRange();

  const { data, isLoading, isError } = trpc.reporting.crmOverview.useQuery({
    dateRange: { from: range.from, to: range.to },
  });
  const d = data as Partial<CrmReportResponse> | undefined;

  const getTable = (): ExportTable => ({
    headers: ['Metric', 'Value'],
    rows: [
      ['Total Customers', d?.totalCustomers ?? 0],
      ['New Customers in Period', d?.newCustomersInPeriod ?? 0],
      ['Repeat Purchase Rate (%)', d?.repeatPurchaseRate ?? 0],
      ['Avg Lifetime Value (INR)', money(d?.avgLifetimeValuePaise ?? 0)],
    ],
  });

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Reports" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'CRM' },
      ]} />
      <div className="flex flex-wrap items-start gap-3">
        <DateRangePicker from={range.from} to={range.to} onChange={onChange} />
        <ReportExportMenu fileBase="crm-report" from={range.from} to={range.to} getTable={getTable} disabled={isLoading || isError || !d} />
      </div>
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-destructive">Failed to load CRM report.</div>
      ) : (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total Customers</span><span>{String(d?.totalCustomers ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">New Customers in Period</span><span>{String(d?.newCustomersInPeriod ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Repeat Purchase Rate</span><span>{typeof d?.repeatPurchaseRate === 'number' ? `${d.repeatPurchaseRate}%` : '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Avg Lifetime Value</span><span>{formatPaise(d?.avgLifetimeValuePaise ?? 0)}</span></div>
        </div>
      )}
    </div>
  );
}
