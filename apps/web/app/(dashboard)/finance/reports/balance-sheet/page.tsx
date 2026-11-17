'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { BalanceSheetReport } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';

type Line = { accountId?: string; accountName?: string; amount?: number };

function Section({ title, lines, total, totalLabel }: { title: string; lines: Line[]; total: unknown; totalLabel: string }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {lines.length === 0 && <div className="py-1 text-sm text-muted-foreground">No accounts</div>}
      {lines.map((l, idx) => (
        <div key={l.accountId ?? idx} className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">{l.accountName ?? '-'}</span><span>{formatPaise(l.amount)}</span></div>
      ))}
      <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>{totalLabel}</span><span>{formatPaise(total ?? 0)}</span></div>
    </div>
  );
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading, isError } = trpc.financial.reports.balanceSheet.useQuery({ asOfDate: new Date(asOf) });
  const bs = data as Partial<BalanceSheetReport> | undefined;
  const assets = Array.isArray(bs?.assets) ? bs.assets : [];
  const liabilities = Array.isArray(bs?.liabilities) ? bs.liabilities : [];
  const equity = Array.isArray(bs?.equity) ? bs.equity : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balance Sheet"
        description="Snapshot of assets and liabilities."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Reports', href: '/finance/reports' },
          { label: 'Balance Sheet' },
        ]}
      />

      <input type="date" aria-label="As of date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-destructive">Failed to load balance sheet.</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <Section title="Assets" lines={assets} total={bs?.totalAssets} totalLabel="Total Assets" />
          <Section title="Liabilities" lines={liabilities} total={bs?.totalLiabilities} totalLabel="Total Liabilities" />
          <Section title="Equity" lines={equity} total={bs?.totalEquity} totalLabel="Total Equity" />
        </div>
      )}
    </div>
  );
}
