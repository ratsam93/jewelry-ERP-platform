'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/components/format';
import { campaignView, orDash } from '@/lib/crm-form';
import { renderDetailState } from '@/components/detail-states';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.crm.campaignGet.useQuery({ id }, { enabled: Boolean(id) });
  const exec = trpc.crm.campaignExecute.useMutation({ onSuccess: () => refetch() });
  const pause = trpc.crm.campaignPause.useMutation({ onSuccess: () => refetch() });
  const cancel = trpc.crm.campaignCancel.useMutation({ onSuccess: () => refetch() });

  const state = renderDetailState({
    isLoading,
    error,
    data,
    entity: 'Campaign',
    backHref: '/crm/campaigns',
    onRetry: () => void refetch(),
  });
  if (state) return state;
  const c: Record<string, unknown> = (data as unknown) as Record<string, unknown>;
  const status = c.status as string;
  const cv = campaignView(c);

  return (
    <div className="space-y-6">
      <PageHeader
        title={(c.name as string) ?? 'Campaign'}
        description={`Status: ${status}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Campaigns', href: '/crm/campaigns' },
          { label: (c.name as string) ?? '' },
        ]}
        actions={
          <div className="flex gap-2">
            {(status === 'DRAFT' || status === 'SCHEDULED') && (
              <button onClick={() => exec.mutate({ id })} disabled={exec.isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Execute</button>
            )}
            {status === 'ACTIVE' && (
              <button onClick={() => pause.mutate({ id })} disabled={pause.isPending} className="h-9 rounded-md border px-4 text-sm disabled:opacity-50">Pause</button>
            )}
            {status !== 'CANCELLED' && status !== 'COMPLETED' && (
              <button onClick={() => cancel.mutate({ id })} disabled={cancel.isPending} className="h-9 rounded-md border px-4 text-sm disabled:opacity-50">Cancel</button>
            )}
            <StatusBadge label={status} variant={getStatusVariant(status)} />
          </div>
        }
      />

      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Channel</span><span>{orDash(c.channel)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><span>{formatDate(c.scheduledAt)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Audience</span><span>{orDash(cv.audience)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Sent / Delivered / Failed</span><span>{`${orDash(cv.sent)} / ${orDash(cv.delivered)} / ${orDash(cv.failed)}`}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Template</span><span>{orDash(cv.templateName)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Subject</span><span>{orDash(cv.subject)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span>{orDash(c.description)}</span></div>
      </div>
    </div>
  );
}
