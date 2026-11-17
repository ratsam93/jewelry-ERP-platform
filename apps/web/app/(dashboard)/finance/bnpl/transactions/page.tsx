'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, getStatusVariant, EmptyState } from '@caratflow/ui';
import { CreditCard } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import { formatPaise } from '@/components/format';
import { formatTimestampDate } from '@/lib/date-only';
import { transactionRow } from '@/lib/finance-form';

export default function BnplTransactionsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.bnpl.listTransactions.useQuery({
    pagination: { page, limit: 20, sortOrder: 'desc' },
  } as never);
  const d = data as { items?: Array<Record<string, unknown>>; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean } | undefined;
  const items = (d?.items ?? []).map(transactionRow);

  return (
    <div className="space-y-6">
      <PageHeader
        title="BNPL Transactions"
        description="Transactions are created when a customer chooses BNPL/EMI at checkout; there is no manual entry."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'BNPL', href: '/finance/bnpl' },
          { label: 'Transactions' },
        ]}
      />
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Reference</span>
          <span>Customer</span>
          <span>Provider</span>
          <span>Order amount</span>
          <span>EMI</span>
          <span>Status</span>
          <span>Date</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-8 w-8" />}
            title="No transactions"
            description="BNPL transactions appear here once customers pay with BNPL or EMI at checkout."
          />
        ) : (
          <div className="divide-y">
            {items.map((t) => (
              <div key={t.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                <span className="font-mono text-xs">{t.reference}</span>
                <span className="font-mono text-xs">{t.customer}</span>
                <span>{t.provider}</span>
                <span className="font-semibold">{formatPaise(t.amountPaise)}</span>
                <span>{formatPaise(t.emiPaise)} x {t.tenure}</span>
                <StatusBadge label={t.status} variant={getStatusVariant(t.status)} dot={false} />
                <span className="text-muted-foreground">{formatTimestampDate(t.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {d && d.totalPages && d.totalPages > 0 && (
        <PaginationControls page={d.page ?? 1} totalPages={d.totalPages} hasPrevious={d.hasPrevious ?? false} hasNext={d.hasNext ?? false} onChange={setPage} />
      )}
    </div>
  );
}
