'use client';

import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';

export default function CollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.cms.collections.getById.useQuery({ id }, { enabled: Boolean(id) });

  const state = renderDetailState({
    isLoading,
    error,
    data,
    entity: 'Collection',
    backHref: '/cms/collections',
    onRetry: () => void refetch(),
  });
  if (state) return state;
  const c: Record<string, unknown> = (data as unknown) as Record<string, unknown>;
  return (
    <div className="space-y-6">
      <PageHeader title={(c.name as string) ?? 'Collection'} breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'CMS', href: '/cms' },
        { label: 'Collections', href: '/cms/collections' },
        { label: (c.name as string) ?? '' },
      ]} actions={<StatusBadge label={c.isActive ? 'Active' : 'Inactive'} variant={c.isActive ? 'success' : 'default'} />} />
      <pre className="rounded-lg border p-4 text-xs overflow-auto">{JSON.stringify(c, null, 2)}</pre>
    </div>
  );
}
