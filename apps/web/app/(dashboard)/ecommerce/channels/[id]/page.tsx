'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatDateTime } from '@/components/format';
import { ChannelFormDialog } from '@/features/ecommerce/ChannelFormDialog';
import { formatServerError } from '@/lib/ecommerce-forms';

interface SyncResult {
  totalItems?: number;
  synced?: number;
  failed?: number;
  skipped?: number;
  errors?: Array<{ productId: string; error: string }>;
}

export default function ChannelDetailPage() {
  const params = useParams<{ id: string }>();
  const channelId = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.ecommerce.getChannel.useQuery({ channelId }, { enabled: Boolean(channelId) });
  const syncMut = trpc.ecommerce.syncAllProducts.useMutation();
  const pullMut = trpc.ecommerce.pullOrdersFromShopify.useMutation();
  const [editing, setEditing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [pullMessage, setPullMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const state = renderDetailState({
    isLoading, error, data, entity: 'Channel', backHref: '/ecommerce/channels', onRetry: () => refetch(),
  });
  if (state) return state;
  const c: Record<string, unknown> = (data as unknown) as Record<string, unknown>;
  const isShopify = c.channelType === 'SHOPIFY';

  const syncProducts = async () => {
    setActionError(null);
    setSyncResult(null);
    try {
      const r = (await syncMut.mutateAsync({ channelId } as never)) as SyncResult;
      setSyncResult(r);
      void refetch();
    } catch (e) {
      setActionError(formatServerError(e));
    }
  };

  const pullOrders = async () => {
    setActionError(null);
    setPullMessage(null);
    try {
      const r = (await pullMut.mutateAsync({ channelId } as never)) as Record<string, unknown> | undefined;
      setPullMessage(`Order pull finished${r && typeof r.imported === 'number' ? `: ${r.imported} imported` : ''}.`);
      void refetch();
    } catch (e) {
      setActionError(formatServerError(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={(c.name as string) ?? 'Channel'} breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'E-Commerce', href: '/ecommerce' },
        { label: 'Channels', href: '/ecommerce/channels' },
        { label: (c.name as string) ?? '' },
      ]} actions={
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Edit</button>
          <StatusBadge label={c.isActive ? 'Active' : 'Inactive'} variant={c.isActive ? 'success' : 'default'} />
        </div>
      } />
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{(c.channelType as string) ?? '-'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Store URL</span><span>{(c.storeUrl as string) || 'Not set'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Last Sync</span><span>{c.lastSyncAt ? formatDateTime(c.lastSyncAt) : 'Never synced'}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDateTime(c.createdAt)}</span></div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sync</h2>
        {actionError && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void syncProducts()}
            disabled={syncMut.isPending || c.isActive === false}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {syncMut.isPending ? 'Syncing products...' : 'Sync products'}
          </button>
          {isShopify && (
            <button
              type="button"
              onClick={() => void pullOrders()}
              disabled={pullMut.isPending}
              className="h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50"
            >
              {pullMut.isPending ? 'Pulling orders...' : 'Pull orders from Shopify'}
            </button>
          )}
        </div>
        {c.isActive === false && <p className="text-xs text-muted-foreground">Activate the channel to sync products.</p>}
        <p className="text-xs text-muted-foreground">
          Publishes every active product to this channel&apos;s catalog. Connection test not available for this channel type.
        </p>
        {syncResult && (
          <p role="status" className="text-sm">
            Synced {syncResult.synced ?? 0} of {syncResult.totalItems ?? 0} products
            {syncResult.failed ? `, ${syncResult.failed} failed` : ''}
            {syncResult.skipped ? `, ${syncResult.skipped} skipped` : ''}.
          </p>
        )}
        {pullMessage && <p role="status" className="text-sm">{pullMessage}</p>}
      </div>

      {editing && (
        <ChannelFormDialog
          channel={c}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); void refetch(); }}
        />
      )}
    </div>
  );
}
