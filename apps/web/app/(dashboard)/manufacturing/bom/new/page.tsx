'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { BomForm } from '@/features/manufacturing/bom-form';
import { formatServerError } from '@/lib/manufacturing-forms';

export default function NewBomPage() {
  const router = useRouter();
  const [productSearch, setProductSearch] = useState('');

  const productsQuery = trpc.storefront.catalog.list.useQuery({
    page: 1,
    limit: 50,
    sortOrder: 'desc',
    search: productSearch || undefined,
  });
  const products = ((productsQuery.data as { items?: Array<{ id: string; name?: string; sku?: string }> } | undefined)?.items) ?? [];

  const createMutation = trpc.manufacturing.bom.create.useMutation({
    onSuccess: (result: unknown) => {
      const id = (result as { id?: string } | null)?.id;
      router.push(id ? `/manufacturing/bom/${id}` : '/manufacturing/bom');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="New BOM"
        description="Define the metal, stones and charges needed to make a product."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Manufacturing', href: '/manufacturing' },
          { label: 'BOM', href: '/manufacturing/bom' },
          { label: 'New' },
        ]}
      />
      <BomForm
        products={products}
        onProductSearch={setProductSearch}
        isSubmitting={createMutation.isPending}
        serverError={createMutation.isError ? formatServerError(createMutation.error) : null}
        onSubmit={(input) => createMutation.mutate(input as never)}
      />
    </div>
  );
}
