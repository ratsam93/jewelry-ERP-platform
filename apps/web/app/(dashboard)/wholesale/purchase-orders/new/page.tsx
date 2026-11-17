'use client';

import { PageHeader } from '@caratflow/ui';
import { useRouter } from 'next/navigation';
import { PurchaseOrderForm } from '@/features/wholesale/PurchaseOrderForm';
import { useWholesaleLookups } from '@/features/wholesale/useWholesaleLookups';
import { trpc } from '@/lib/trpc';
import { readableError } from '@/lib/wholesale-form';

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { supplierOptions, locationOptions, productOptions } = useWholesaleLookups();
  const createMutation = trpc.wholesale.createPurchaseOrder.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      router.push(id ? `/wholesale/purchase-orders/${id}` : '/wholesale/purchase-orders');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Purchase Order"
        description="Create a new purchase order for a supplier."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Wholesale', href: '/wholesale' },
          { label: 'Purchase Orders', href: '/wholesale/purchase-orders' },
          { label: 'New' },
        ]}
      />
      <PurchaseOrderForm
        suppliers={supplierOptions}
        locations={locationOptions}
        products={productOptions}
        submitting={createMutation.isPending}
        error={createMutation.error ? readableError(createMutation.error, 'Could not create the purchase order.') : null}
        onSubmit={(data) => createMutation.mutate(data as never)}
        onCancel={() => router.push('/wholesale/purchase-orders')}
      />
    </div>
  );
}
