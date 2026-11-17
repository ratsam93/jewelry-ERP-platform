'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { AgingReport } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { formatDateOnly } from '@/lib/date-only';

export default function AgingReportPage() {
  const [type, setType] = useState<'AR' | 'AP'>('AR');
  const { data, isLoading, isError } = trpc.financial.reports.aging.useQuery({ type });
  // The API returns { buckets, entries, totalOutstanding }, not a bare array.
  const report = data as Partial<AgingReport> | undefined;
  const buckets = Array.isArray(report?.buckets) ? report.buckets : [];
  const entries = Array.isArray(report?.entries) ? report.entries : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Aging Report" description="Receivables or payables aged by days past due date. Only issued, unpaid or part-paid invoices are included (Sent, Partially paid, Overdue). Draft, paid, cancelled and voided invoices are excluded: issue a draft invoice to include it." breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Finance', href: '/finance' },
        { label: 'Reports', href: '/finance/reports' },
        { label: 'Aging' },
      ]} />

      <select aria-label="Report type" value={type} onChange={(e) => setType(e.target.value as 'AR' | 'AP')} className="h-9 rounded-md border px-2 text-sm">
        <option value="AR">Accounts Receivable</option>
        <option value="AP">Accounts Payable</option>
      </select>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-destructive">Failed to load aging report.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {buckets.map((b, idx) => (
              <div key={`${b.label}-${idx}`} className="rounded-lg border p-3">
                <div className="text-xs uppercase text-muted-foreground">{b.label ?? '-'}</div>
                <div className="text-lg font-semibold">{formatPaise(b.amountPaise)}</div>
                <div className="text-xs text-muted-foreground">{String(b.count ?? 0)} invoice(s)</div>
              </div>
            ))}
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="text-xs uppercase text-muted-foreground">Total outstanding</div>
              <div className="text-lg font-bold">{formatPaise(report?.totalOutstanding ?? 0)}</div>
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
              <span>Invoice</span>
              <span>Party</span>
              <span>Due date</span>
              <span>Age (days)</span>
              <span>Total</span>
              <span>Outstanding</span>
            </div>
            {entries.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No outstanding invoices</div>
            ) : (
              <div className="divide-y">
                {entries.map((e, idx) => (
                  <div key={e.invoiceId ?? idx} className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                    <span className="font-mono">{e.invoiceNumber ?? '-'}</span>
                    <span className="font-medium">{e.partyName || '-'}</span>
                    <span>{formatDateOnly(e.dueDate)}</span>
                    <span>{String(e.ageDays ?? 0)}</span>
                    <span>{formatPaise(e.totalPaise)}</span>
                    <span>{formatPaise(e.outstandingPaise)}</span>
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
