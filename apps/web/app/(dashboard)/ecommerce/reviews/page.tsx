'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { Star } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import { formatDate } from '@/components/format';
import { reviewFiltersFor, type ReviewTab } from '@/lib/ecommerce-forms';

const TABS: Array<{ key: ReviewTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'published', label: 'Published' },
];

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<ReviewTab>('all');
  const { data, isLoading, refetch } = trpc.ecommerce.listReviews.useQuery({
    filters: reviewFiltersFor(tab),
    pagination: { page, limit: 20, sortOrder: 'desc' },
  } as never);
  const publish = trpc.ecommerce.publishReview.useMutation({ onSuccess: () => refetch() });
  const unpublish = trpc.ecommerce.unpublishReview.useMutation({ onSuccess: () => refetch() });
  const d = data as { items?: Array<Record<string, unknown>>; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean } | undefined;
  const items = d?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Product Reviews" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'E-Commerce', href: '/ecommerce' },
        { label: 'Reviews' },
      ]} />
      <div role="tablist" aria-label="Review status" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.4fr_0.6fr_2fr_1fr_1fr_0.8fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Customer</span>
          <span>Rating</span>
          <span>Comment</span>
          <span>Date</span>
          <span>Status</span>
          <span>Action</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Star className="h-8 w-8" />} title={tab === 'all' ? 'No reviews' : `No ${tab} reviews`} />
        ) : (
          <div className="divide-y">
            {items.map((r) => (
              <div key={r.id as string} className="grid grid-cols-[1.4fr_0.6fr_2fr_1fr_1fr_0.8fr] gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{(r.customerName as string) ?? '-'}</span>
                <span>{'★'.repeat(Number(r.rating ?? 0))}</span>
                <span className="truncate text-muted-foreground">{(r.body as string) ?? (r.title as string) ?? ''}</span>
                <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>
                <StatusBadge label={r.isPublished ? 'Published' : 'Pending'} variant={r.isPublished ? 'success' : 'default'} />
                {r.isPublished ? (
                  <button type="button" onClick={() => unpublish.mutate({ reviewId: r.id as string })} className="text-xs text-primary">Unpublish</button>
                ) : (
                  <button type="button" onClick={() => publish.mutate({ reviewId: r.id as string })} className="text-xs text-primary">Approve & publish</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {d && (d.totalPages ?? 0) > 0 && (
        <PaginationControls page={d.page ?? 1} totalPages={d.totalPages ?? 0} hasPrevious={d.hasPrevious ?? false} hasNext={d.hasNext ?? false} onChange={setPage} />
      )}
    </div>
  );
}
