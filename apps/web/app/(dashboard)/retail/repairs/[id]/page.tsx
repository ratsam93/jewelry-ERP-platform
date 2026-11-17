'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise, formatDate } from '@/components/format';

export default function RepairDetailPage() {
  const params = useParams<{ id: string }>();
  const repairId = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.retail.getRepairOrder.useQuery({ repairId }, { enabled: Boolean(repairId) });
  const updateStatus = trpc.retail.updateRepairStatus.useMutation({ onSuccess: () => refetch() });

  const state = renderDetailState({ isLoading, error, data, entity: 'Repair order', backHref: '/retail/repairs', onRetry: () => refetch() });
  if (state) return state;
  const r = data as Record<string, unknown>;
  const status = r.status as string;
  const customer = r.customer as { firstName?: string; lastName?: string; phone?: string } | undefined;

  const advance = (next: string) => {
    updateStatus.mutate({ repairId, update: { status: next } as never });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={(r.repairNumber as string) ?? 'Repair'}
        description={`Status: ${status}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Retail', href: '/retail' },
          { label: 'Repairs', href: '/retail/repairs' },
          { label: (r.repairNumber as string) ?? '' },
        ]}
        actions={
          <div className="flex gap-2">
            {status === 'RECEIVED' && <button onClick={() => advance('IN_PROGRESS')} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Start</button>}
            {status === 'IN_PROGRESS' && <button onClick={() => advance('COMPLETED')} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Mark Ready</button>}
            {status === 'COMPLETED' && <button onClick={() => advance('DELIVERED')} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Deliver</button>}
            <StatusBadge label={status} variant={getStatusVariant(status)} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{customer ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() : '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{customer?.phone ?? '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Item</span><span>{(r.itemDescription as string) ?? '-'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Issue</span><span>{(r.diagnosticNotes as string) ?? (r.issueDescription as string) ?? '-'}</span></div>
        </div>
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Estimated Cost</span><span>{formatPaise(r.estimatePaise ?? r.estimatedCostPaise)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Actual Cost</span><span>{formatPaise(r.actualCostPaise)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Received</span><span>{formatDate(r.createdAt ?? r.receivedDate)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Promised By</span><span>{formatDate(r.promisedDate ?? r.promisedDeliveryDate)}</span></div>
        </div>
      </div>
    </div>
  );
}
