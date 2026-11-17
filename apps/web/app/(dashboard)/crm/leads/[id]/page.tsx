'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { formatDate, formatPaise } from '@/components/format';
import { leadView, orDash } from '@/lib/crm-form';
import { renderDetailState } from '@/components/detail-states';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.crm.leadGet.useQuery({ id }, { enabled: Boolean(id) });
  const { data: activities } = trpc.crm.leadActivities.useQuery({ leadId: id }, { enabled: Boolean(id) });
  const convert = trpc.crm.leadConvert.useMutation({ onSuccess: () => refetch() });

  const state = renderDetailState({
    isLoading,
    error,
    data,
    entity: 'Lead',
    backHref: '/crm/leads',
    onRetry: () => void refetch(),
  });
  if (state) return state;
  const l = data as Record<string, unknown>;
  const lv = leadView(l);
  const acts = (activities as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={lv.name || 'Lead'}
        description={(l.phone as string) ?? (l.email as string) ?? ''}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Leads', href: '/crm/leads' },
          { label: lv.name || 'Lead' },
        ]}
        actions={
          <div className="flex gap-2">
            {l.status !== 'WON' && (
              <button onClick={() => convert.mutate({ leadId: id })} disabled={convert.isPending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                Convert to Customer
              </button>
            )}
            <StatusBadge label={(l.status as string) ?? '-'} variant={getStatusVariant(l.status as string)} />
          </div>
        }
      />

      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{orDash(l.source)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{orDash(l.phone)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{orDash(l.email)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Estimated value</span><span>{formatPaise(lv.estimatedValuePaise)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Next follow-up</span><span>{formatDate(l.nextFollowUpDate)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span>{orDash(l.notes)}</span></div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activities</h2>
        <div className="rounded-lg border divide-y">
          {acts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No activities</div>
          ) : (
            acts.map((a) => (
              <div key={a.id as string} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{(a.activityType as string) ?? '-'}</span>
                <span className="text-muted-foreground">{(a.description as string) ?? ''}</span>
                <span className="text-muted-foreground">{formatDate(a.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
