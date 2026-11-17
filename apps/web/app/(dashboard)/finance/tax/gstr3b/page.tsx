'use client';

import { useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { Gstr3bTables } from '@/features/finance/gstr-tables';
import type { Gstr3bData } from '@caratflow/shared-types';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Gstr3bPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const { data, isLoading, isError, error } = trpc.financial.tax.gstr3b.useQuery(
    { period: { year, month } },
    { enabled: year >= 2020 && month >= 1 && month <= 12 },
  );
  return (
    <div className="space-y-6">
      <PageHeader title="GSTR-3B" description="Summary return." breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Finance', href: '/finance' },
        { label: 'Tax', href: '/finance/tax' },
        { label: 'GSTR-3B' },
      ]} />
      <input type="month" aria-label="Return period" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 rounded-md border px-2 text-sm" />
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : isError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load the return: {error?.message}</div>
      ) : (
        <Gstr3bTables data={data as unknown as Partial<Gstr3bData> | undefined} />
      )}
    </div>
  );
}
