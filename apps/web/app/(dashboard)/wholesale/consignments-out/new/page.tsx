'use client';

import { PageHeader } from '@caratflow/ui';
import { useRouter } from 'next/navigation';
import { ConsignmentCreateForm } from '@/features/wholesale/ConsignmentCreateForm';
import { useWholesaleLookups } from '@/features/wholesale/useWholesaleLookups';
import { trpc } from '@/lib/trpc';
import { readableError } from '@/lib/wholesale-form';

export default function NewConsignmentOutPage() {
  const router = useRouter();
  const lookups = useWholesaleLookups({ suppliers: false, customers: true });
  const createMut = trpc.wholesale.createConsignmentOut.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      router.push(id ? `/wholesale/consignments-out/${id}` : '/wholesale/consignments-out');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Consignment"
        description="Issue items to a customer on memo/consignment."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Wholesale', href: '/wholesale' },
          { label: 'Consignments Out', href: '/wholesale/consignments-out' },
          { label: 'New' },
        ]}
      />
      <ConsignmentCreateForm
        direction="out"
        parties={lookups.customerOptions}
        locations={lookups.locationOptions}
        products={lookups.productOptions}
        submitting={createMut.isPending}
        error={createMut.error ? readableError(createMut.error, 'Could not save the consignment.') : null}
        cancelHref="/wholesale/consignments-out"
        onSubmit={(payload) => createMut.mutate(payload as never)}
      />
    </div>
  );
}
