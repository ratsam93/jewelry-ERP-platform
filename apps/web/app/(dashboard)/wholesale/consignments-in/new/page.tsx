'use client';

import { PageHeader } from '@caratflow/ui';
import { useRouter } from 'next/navigation';
import { ConsignmentCreateForm } from '@/features/wholesale/ConsignmentCreateForm';
import { useWholesaleLookups } from '@/features/wholesale/useWholesaleLookups';
import { trpc } from '@/lib/trpc';
import { readableError } from '@/lib/wholesale-form';

export default function NewConsignmentInPage() {
  const router = useRouter();
  const lookups = useWholesaleLookups({ suppliers: true, customers: false });
  const createMut = trpc.wholesale.createConsignmentIn.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      router.push(id ? `/wholesale/consignments-in/${id}` : '/wholesale/consignments-in');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record Consignment"
        description="Record items received from a supplier on consignment."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Wholesale', href: '/wholesale' },
          { label: 'Consignments In', href: '/wholesale/consignments-in' },
          { label: 'New' },
        ]}
      />
      <ConsignmentCreateForm
        direction="in"
        parties={lookups.supplierOptions}
        locations={lookups.locationOptions}
        products={lookups.productOptions}
        submitting={createMut.isPending}
        error={createMut.error ? readableError(createMut.error, 'Could not save the consignment.') : null}
        cancelHref="/wholesale/consignments-in"
        onSubmit={(payload) => createMut.mutate(payload as never)}
      />
    </div>
  );
}
