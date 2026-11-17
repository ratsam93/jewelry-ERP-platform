'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { ProfitAndLossReport } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';

export default function PnlReportPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading, isError } = trpc.financial.reports.profitAndLoss.useQuery({
    dateRange: { from: new Date(from), to: new Date(to) },
  });
  const pnl = data as Partial<ProfitAndLossReport> | undefined;
  const revenue = Array.isArray(pnl?.revenue) ? pnl.revenue : [];
  const expenses = Array.isArray(pnl?.expenses) ? pnl.expenses : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss"
        description="Income vs. expenses for a period."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Reports', href: '/finance/reports' },
          { label: 'P&L' },
        ]}
      />

      <div className="flex gap-3">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div className="py-12 text-center text-sm text-destructive">Failed to load profit and loss.</div>
      ) : (
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <h3 className="font-semibold">Revenue</h3>
          {revenue.length === 0 && <div className="text-muted-foreground">No revenue in this period.</div>}
          {revenue.map((r, idx) => (
            <div key={r.accountId ?? idx} className="flex justify-between"><span className="text-muted-foreground">{r.accountName ?? '-'}</span><span>{formatPaise(r.amount)}</span></div>
          ))}
          <div className="flex justify-between border-t pt-2"><span className="font-medium">Total Revenue</span><span className="font-semibold">{formatPaise(pnl?.totalRevenue ?? 0)}</span></div>
          <h3 className="pt-2 font-semibold">Expenses</h3>
          {expenses.length === 0 && <div className="text-muted-foreground">No expenses in this period.</div>}
          {expenses.map((e, idx) => (
            <div key={e.accountId ?? idx} className="flex justify-between"><span className="text-muted-foreground">{e.accountName ?? '-'}</span><span>{formatPaise(e.amount)}</span></div>
          ))}
          <div className="flex justify-between border-t pt-2"><span className="font-medium">Total Expenses</span><span className="font-semibold">{formatPaise(pnl?.totalExpenses ?? 0)}</span></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Net Profit</span><span>{formatPaise(pnl?.netProfit ?? 0)}</span></div>
        </div>
      )}
    </div>
  );
}
