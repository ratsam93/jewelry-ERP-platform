'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { Package } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import { formatPaise, formatDateTime } from '@/components/format';
import { formatServerError } from '@/lib/ecommerce-forms';

export default function CatalogPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, refetch } = trpc.ecommerce.listCatalogItems.useQuery({
    pagination: { page, limit: 20, sortOrder: 'desc' },
  });
  const channelsQuery = trpc.ecommerce.listChannels.useQuery({});
  const syncMut = trpc.ecommerce.syncAllProducts.useMutation();
  const [syncChannel, setSyncChannel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const d = data as { items?: Array<Record<string, unknown>>; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean } | undefined;
  const items = d?.items ?? [];
  const channels = ((channelsQuery.data as Array<Record<string, unknown>> | undefined) ?? []).filter((c) => c.isActive !== false);
  const channelNames = new Map(channels.map((c) => [String(c.id), String(c.name)]));
  const targetChannel = syncChannel || (channels[0]?.id as string | undefined) || '';

  const sync = async () => {
    if (!targetChannel) return;
    setError(null);
    setMessage(null);
    try {
      const r = (await syncMut.mutateAsync({ channelId: targetChannel } as never)) as { synced?: number; totalItems?: number; failed?: number };
      setMessage(`Synced ${r.synced ?? 0} of ${r.totalItems ?? 0} products${r.failed ? ` (${r.failed} failed)` : ''}.`);
      void refetch();
    } catch (e) {
      setError(formatServerError(e));
    }
  };

  const syncControls = (
    <div className="flex flex-wrap items-center gap-2">
      {channels.length > 1 && (
        <select aria-label="Channel to sync" value={targetChannel} onChange={(e) => setSyncChannel(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          {channels.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
        </select>
      )}
      <button
        type="button"
        onClick={() => void sync()}
        disabled={syncMut.isPending || !targetChannel}
        className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {syncMut.isPending ? 'Syncing...' : 'Sync products to channel'}
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Catalog" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'E-Commerce', href: '/ecommerce' },
        { label: 'Catalog' },
      ]} actions={syncControls} />
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded border bg-muted/50 px-3 py-2 text-sm">{message}</p>}
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Product</span>
          <span>Channel</span>
          <span>Price</span>
          <span>Last Sync</span>
          <span>Status</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <div>
            <EmptyState icon={<Package className="h-8 w-8" />} title="No catalog items" />
            <p className="mx-auto max-w-lg px-4 pb-8 text-center text-sm text-muted-foreground">
              This list shows products published to a sales channel, not your inventory. Products
              only appear here after they are synced. Use &quot;Sync products to channel&quot; to publish your active products
              {channels.length === 0 ? ' (create an active channel first under Channels).' : '.'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((c) => (
              <Link key={c.id as string} href={`/ecommerce/catalog/${c.id}`} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm hover:bg-accent">
                <span className="font-medium">{(((c.product as { name?: string })?.name)) ?? (c.title as string) ?? '-'}</span>
                <span>{(((c.channel as { name?: string })?.name)) ?? channelNames.get(String(c.channelId)) ?? '-'}</span>
                <span className="font-semibold">{formatPaise(c.pricePaise)}</span>
                <span className="text-muted-foreground">{c.lastSyncAt ? formatDateTime(c.lastSyncAt) : 'Never'}</span>
                <StatusBadge label={(c.syncStatus as string) ?? '-'} variant="default" />
              </Link>
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
