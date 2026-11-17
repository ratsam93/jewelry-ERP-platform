'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise, formatMg } from '@/components/format';
import { bomDetailView } from '@/lib/manufacturing-forms';

export default function BomDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.manufacturing.bom.getById.useQuery({ id }, { enabled: Boolean(id) });
  const activate = trpc.manufacturing.bom.activate.useMutation({ onSuccess: () => refetch() });
  const archive = trpc.manufacturing.bom.archive.useMutation({ onSuccess: () => refetch() });

  const state = renderDetailState({ isLoading, error, data, entity: 'BOM', backHref: '/manufacturing/bom', onRetry: () => refetch() });
  if (state) return state;
  const b = data as Record<string, unknown>;
  const view = bomDetailView(b);
  const status = b.status as string;

  return (
    <div className="space-y-6">
      <PageHeader
        title={(b.name as string) ?? 'BOM'}
        description={`Version ${b.version} — ${status}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'BOM', href: '/manufacturing/bom' },
          { label: (b.name as string) ?? '' },
        ]}
        actions={
          <div className="flex gap-2">
            {status === 'DRAFT' && <button onClick={() => activate.mutate({ id })} disabled={activate.isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Activate</button>}
            {status === 'ACTIVE' && <button onClick={() => archive.mutate({ id })} disabled={archive.isPending} className="h-9 rounded-md border px-4 text-sm disabled:opacity-50">Archive</button>}
            <StatusBadge label={status} variant={getStatusVariant(status)} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Product</p><p className="mt-1 text-sm font-medium">{view.productName}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Output quantity</p><p className="mt-1 text-sm font-medium">{view.outputQuantity}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Estimated cost</p><p className="mt-1 text-sm font-medium">{formatPaise(view.estimatedCostPaise)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Estimated time</p><p className="mt-1 text-sm font-medium">{view.estimatedTimeMins ? `${view.estimatedTimeMins} min` : '-'}</p></div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Components</h2>
        <div className="rounded-lg border">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
            <span>Component</span>
            <span>Type</span>
            <span>Qty / Weight</span>
            <span>Wastage</span>
            <span>Est. cost</span>
          </div>
          {view.rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No components</div>
          ) : (
            <div className="divide-y">
              {view.rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <span>{r.name}</span>
                  <span className="text-muted-foreground">{r.type}</span>
                  <span>{r.weightMg ? formatMg(r.weightMg) : `${r.quantity} ${r.unit}`.trim()}</span>
                  <span>{r.wastagePct ?? '-'}</span>
                  <span className="font-semibold">{formatPaise(r.costPaise)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
