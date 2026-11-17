'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { ManufacturingReportResponse } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';

export default function ManufacturingReportsPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading, isError } = trpc.reporting.jobSummary.useQuery({
    dateRange: { from: new Date(from), to: new Date(to) },
  } as never);
  const d = data as Partial<ManufacturingReportResponse> | undefined;
  const rows = Array.isArray(d?.jobSummary) ? d.jobSummary : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Manufacturing Reports" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'Manufacturing' },
      ]} />
      <div className="flex gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
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
