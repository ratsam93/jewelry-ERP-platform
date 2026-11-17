'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { readableError } from '@/lib/finance-form';
import { SchemeForm } from '@/features/schemes/scheme-form';

export default function NewGoldSavingsSchemePage() {
  const router = useRouter();
  const createMut = trpc.india.schemes.goldSavings.create.useMutation();

  const handleCreate = async (input: Record<string, unknown>) => {
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      router.push(created?.id ? `/finance/schemes/gold-savings/${created.id}` : '/finance/schemes/gold-savings');
    } catch {
      // shown via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Gold Savings Scheme"
        description="Amounts are entered in rupees."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Schemes', href: '/finance/schemes' },
          { label: 'Gold Savings', href: '/finance/schemes/gold-savings' },
          { label: 'New' },
        ]}
      />
      <SchemeForm
        kind="gold"
        onSubmit={handleCreate}
        pending={createMut.isPending}
        serverError={createMut.error ? readableError(createMut.error, 'Could not create the scheme.') : null}
        cancelHref="/finance/schemes/gold-savings"
      />
    </div>
  );
}
