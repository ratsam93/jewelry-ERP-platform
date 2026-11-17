'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { CrmReportResponse } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';

export default function CrmReportsPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading, isError } = trpc.reporting.crmOverview.useQuery({
    dateRange: { from: new Date(from), to: new Date(to) },
  });
  const d = data as Partial<CrmReportResponse> | undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Reports" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Reports', href: '/reports' },
        { label: 'CRM' },
      ]} />
      <div className="flex gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
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
