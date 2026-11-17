'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { KarigarForm } from '@/features/manufacturing/karigar-form';
import { dedupeLocationsByName, formatServerError, karigarToFormValues } from '@/lib/manufacturing-forms';

export default function EditKarigarPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { data, isLoading, error, refetch } = trpc.manufacturing.karigar.getById.useQuery({ id }, { enabled: Boolean(id) });
  const branchesQuery = trpc.platform.branches.list.useQuery({ includeInactive: false });
  const utils = trpc.useUtils();
  const updateMutation = trpc.manufacturing.karigar.update.useMutation({
    onSuccess: async () => {
      await utils.manufacturing.karigar.getById.invalidate({ id });
      router.push(`/manufacturing/karigars/${id}`);
    },
  });

  const state = renderDetailState({ isLoading, error, data, entity: 'Karigar', backHref: '/manufacturing/karigars', onRetry: () => refetch() });
  if (state) return state;
  const k = data as Record<string, unknown>;
  const rows = (branchesQuery.data as Array<{ id: string; name: string; locationType?: string }> | undefined) ?? [];
  // keep the karigar's current location selectable even if it was deduped away
  const current = (k.location as { id?: string; name?: string } | null) ?? null;
  const locations = dedupeLocationsByName(rows).map((b) => ({ id: b.id, label: b.name }));
  if (current?.id && !locations.some((l) => l.id === current.id)) locations.push({ id: current.id, label: current.name ?? current.id });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${`${(k.firstName as string) ?? ''} ${(k.lastName as string) ?? ''}`.trim()}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Karigars', href: '/manufacturing/karigars' },
          { label: 'Edit' },
        ]}
      />
      <KarigarForm
        initial={karigarToFormValues(k)}
        locations={locations}
        submitLabel="Save changes"
        isSubmitting={updateMutation.isPending}
        serverError={updateMutation.isError ? formatServerError(updateMutation.error) : null}
        onSubmit={(input) => updateMutation.mutate({ id, data: input } as never)}
      />
    </div>
  );
}
