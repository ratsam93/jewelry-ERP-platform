'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { TrialBalanceReport } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';

function formatAsOfDate(value: string | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  // Explicit locale and timeZone keep server and browser output identical.
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TrialBalancePage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading, isError } = trpc.financial.reports.trialBalance.useQuery({
    dateRange: { from: new Date(from), to: new Date(to) },
  });
  const report = data as TrialBalanceReport | undefined;
  const accounts = Array.isArray(report?.accounts) ? report.accounts : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Trial Balance" description="Accounts with debit/credit balances." breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Finance', href: '/finance' },
        { label: 'Reports', href: '/finance/reports' },
        { label: 'Trial Balance' },
      ]} />

      <div className="flex flex-wrap items-center gap-3">
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
        {report?.asOfDate && (
          <span className="text-sm text-muted-foreground">As of {formatAsOfDate(report.asOfDate)}</span>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Account</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-destructive">Failed to load trial balance.</div>
        ) : accounts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No accounts with activity in this period.</div>
        ) : (
          <>
            <div className="divide-y">
              {accounts.map((a) => (
                <div key={a.accountId} className="grid grid-cols-[2fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <span>
                    {a.accountCode ? <span className="mr-2 font-mono text-muted-foreground">{a.accountCode}</span> : null}
                    {a.accountName ?? '-'}
                  </span>
                  <span className="text-right">{formatPaise(a.debitTotal)}</span>
                  <span className="text-right">{formatPaise(a.creditTotal)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-t bg-muted/50 px-4 py-3 text-sm font-semibold">
              <span>Total</span>
              <span className="text-right">{formatPaise(report?.totalDebits)}</span>
              <span className="text-right">{formatPaise(report?.totalCredits)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
