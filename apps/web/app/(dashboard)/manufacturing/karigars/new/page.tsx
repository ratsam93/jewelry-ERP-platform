'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { KarigarForm } from '@/features/manufacturing/karigar-form';
import { dedupeLocationsByName, formatServerError } from '@/lib/manufacturing-forms';

export default function NewKarigarPage() {
  const router = useRouter();
  const branchesQuery = trpc.platform.branches.list.useQuery({ includeInactive: false });
  const locations = dedupeLocationsByName((branchesQuery.data as Array<{ id: string; name: string; locationType?: string }> | undefined) ?? [])
    .map((b) => ({ id: b.id, label: b.name }));

  const createMutation = trpc.manufacturing.karigar.create.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      router.push(id ? `/manufacturing/karigars/${id}` : '/manufacturing/karigars');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Karigar"
        description="Register an artisan or workshop staff member."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'Karigars', href: '/manufacturing/karigars' },
          { label: 'New' },
        ]}
      />
      <KarigarForm
        locations={locations}
        isSubmitting={createMutation.isPending}
        serverError={createMutation.isError ? formatServerError(createMutation.error) : null}
        onSubmit={(input) => createMutation.mutate(input as never)}
      />
    </div>
  );
}
