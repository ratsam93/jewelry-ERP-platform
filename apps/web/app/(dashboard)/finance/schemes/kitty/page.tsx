'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { PiggyBank, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import { schemeRow } from '@/lib/finance-form';
import { formatPaise } from '@/components/format';

export default function KittySchemesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.india.schemes.kitty.list.useQuery({ page, limit: 20 } as never);
  const d = data as { items?: Array<Record<string, unknown>>; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean } | undefined;
  const items = d?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Kitty Schemes" description="Group savings schemes." breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Finance', href: '/finance' },
        { label: 'Schemes', href: '/finance/schemes' },
        { label: 'Kitty' },
      ]} actions={
        <Link href="/finance/schemes/kitty/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Scheme
        </Link>
      } />

      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Monthly</span>
          <span>Duration</span>
          <span>Members</span>
          <span>Status</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<PiggyBank className="h-8 w-8" />} title="No kitty schemes" description="Use New Scheme to create one." />
        ) : (
          <div className="divide-y">
            {items.map((raw) => {
              const s = schemeRow(raw);
              return (
                <Link key={s.id} href={`/finance/schemes/kitty/${s.id}`} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm hover:bg-accent">
                  <span className="font-medium">{s.name}</span>
                  <span>{formatPaise(s.monthlyAmountPaise)}</span>
                  <span>{s.durationMonths === null ? '-' : `${s.durationMonths} months`}</span>
                  <span>{String(s.members)}</span>
                  <StatusBadge label={s.status} variant="default" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {d && d.totalPages && d.totalPages > 0 && (
        <PaginationControls page={d.page ?? 1} totalPages={d.totalPages} hasPrevious={d.hasPrevious ?? false} hasNext={d.hasNext ?? false} onChange={setPage} />
      )}
    </div>
  );
}
