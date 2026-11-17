'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';

export default function GoldSavingsDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.india.schemes.goldSavings.getById.useQuery({ id }, { enabled: Boolean(id) });
  const state = renderDetailState({
    isLoading, error, data, entity: 'Gold savings scheme', backHref: '/finance/schemes/gold-savings', onRetry: () => refetch(),
  });
  if (state) return state;
  const s = data as Record<string, unknown>;
  return (
    <div className="space-y-6">
      <PageHeader title={(s.name as string) ?? 'Gold Savings Scheme'} breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Finance', href: '/finance' },
        { label: 'Schemes', href: '/finance/schemes' },
        { label: 'Gold Savings', href: '/finance/schemes/gold-savings' },
        { label: (s.name as string) ?? '' },
      ]} />
      <pre className="rounded-lg border p-4 text-xs overflow-auto">{JSON.stringify(s, null, 2)}</pre>
    </div>
  );
}
