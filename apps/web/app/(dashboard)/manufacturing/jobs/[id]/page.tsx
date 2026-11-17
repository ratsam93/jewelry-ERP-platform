'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise, formatDate } from '@/components/format';
import { JobStatusActions } from '@/features/manufacturing/job-status-actions';
import { formatServerError, jobDates } from '@/lib/manufacturing-forms';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.manufacturing.job.getById.useQuery({ id }, { enabled: Boolean(id) });
  const { data: cost, refetch: refetchCost } = trpc.manufacturing.job.getCost.useQuery({ id }, { enabled: Boolean(id) });
  const updateStatus = trpc.manufacturing.job.updateStatus.useMutation({
    onSuccess: () => {
      void refetch();
      void refetchCost();
    },
  });

  const state = renderDetailState({ isLoading, error, data, entity: 'Job', backHref: '/manufacturing/jobs', onRetry: () => refetch() });
  if (state) return state;

  const j = data as Record<string, unknown>;
  const status = j.status as string;
  const c = (cost as Record<string, unknown> | undefined) ?? {};
  const dates = jobDates(j);
  const karigar = (j.assignedKarigar ?? j.karigar) as { firstName?: string; lastName?: string } | null | undefined;
  const karigarName = karigar ? `${karigar.firstName ?? ''} ${karigar.lastName ?? ''}`.trim() : '';
  const costs = (Array.isArray(j.costs) ? j.costs : []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={(j.jobNumber as string) ?? 'Job'}
        description={`Status: ${status}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Jobs', href: '/manufacturing/jobs' },
          { label: (j.jobNumber as string) ?? '' },
        ]}
        actions={<StatusBadge label={status} variant={getStatusVariant(status)} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Product</p><p className="text-sm font-medium mt-1">{((j.product as { name?: string })?.name) ?? '-'}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Quantity</p><p className="text-sm font-medium mt-1">{String(j.quantity ?? 0)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Estimated Start</p><p className="text-sm font-medium mt-1">{formatDate(dates.estimatedStart)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Estimated End</p><p className="text-sm font-medium mt-1">{formatDate(dates.estimatedEnd)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Karigar</p><p className="text-sm font-medium mt-1">{karigarName || '-'}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Location</p><p className="text-sm font-medium mt-1">{((j.location as { name?: string })?.name) ?? '-'}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{`Estimated cost for ${String(j.quantity ?? 1)} unit${Number(j.quantity ?? 1) === 1 ? '' : 's'}`}</p><p className="text-sm font-medium mt-1">{c.estimatedCostPaise ? formatPaise(c.estimatedCostPaise) : '-'}</p><p className="mt-1 text-xs text-muted-foreground">BOM cost per unit x quantity</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Actual cost recorded</p><p className="text-sm font-medium mt-1">{formatPaise(c.totalCostPaise ?? 0)}</p><p className="mt-1 text-xs text-muted-foreground">{costs.length === 0 ? 'No cost entries yet' : `${costs.length} cost entr${costs.length === 1 ? 'y' : 'ies'}`}</p></div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Change status</h2>
        <JobStatusActions
          status={status}
          isPending={updateStatus.isPending}
          error={updateStatus.isError ? formatServerError(updateStatus.error) : null}
          onTransition={(next, notes) => updateStatus.mutate({ id, data: { status: next, notes } } as never)}
        />
      </div>
    </div>
  );
}
