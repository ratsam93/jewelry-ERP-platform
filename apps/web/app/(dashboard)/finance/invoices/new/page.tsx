'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { InvoiceForm, type InvoiceFormSubmit } from '@/features/finance/invoice-form';
import { dedupeBranches, branchOptionLabels, type PosBranch } from '@/lib/pos-location';
import {
  INVOICE_TYPES,
  customerOptions,
  readableError,
  supplierOptions,
  type InvoiceTypeValue,
} from '@/lib/finance-forms';

export default function NewInvoicePage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [invoiceType, setInvoiceType] = React.useState<InvoiceTypeValue>('SALES');
  const [serverError, setServerError] = React.useState<string | null>(null);

  const customersQuery = trpc.crm.customerList.useQuery({ page: 1, limit: 100 } as never);
  const suppliersQuery = trpc.wholesale.listSuppliers.useQuery({ pagination: { page: 1, limit: 100, sortOrder: 'asc' } } as never);
  const branchesQuery = trpc.platform.branches.list.useQuery({ includeInactive: false } as never);

  const customers = customerOptions(
    ((customersQuery.data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? []),
  );
  const suppliers = supplierOptions(
    ((suppliersQuery.data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? []),
  );

  const branches = dedupeBranches(
    ((branchesQuery.data as Array<Record<string, unknown>> | undefined) ?? []).map((b) => ({
      id: String(b.id),
      name: String(b.name ?? b.id),
      locationType: String(b.locationType ?? ''),
      state: typeof b.state === 'string' ? b.state : null,
    })),
  );
  const labels = branchOptionLabels(branches as PosBranch[]);
  const locations = branches.map((b) => ({ id: b.id, name: labels.get(b.id) ?? b.name, state: b.state }));

  const createMutation = trpc.financial.invoices.create.useMutation({
    onSuccess: (created: unknown) => {
      void utils.financial.invoices.list.invalidate();
      const id = (created as { id?: string } | undefined)?.id;
      router.push(id ? `/finance/invoices/${id}` : '/finance/invoices');
    },
    onError: (err: unknown) => setServerError(readableError(err, 'Could not create the invoice.')),
  } as never);

  const handleSubmit = (data: InvoiceFormSubmit) => {
    setServerError(null);
    createMutation.mutate(data as never);
  };

  const loadError = customersQuery.isError || branchesQuery.isError;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Invoice"
        description="Create a sales or purchase invoice with automatic GST computation."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Invoices', href: '/finance/invoices' },
          { label: 'New Invoice' },
        ]}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Document type">
        {INVOICE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={invoiceType === t.value}
            onClick={() => {
              setInvoiceType(t.value);
              setServerError(null);
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              invoiceType === t.value
                ? 'bg-primary text-primary-foreground'
                : 'border bg-background hover:bg-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load customers or locations. Reload the page to try again.
        </p>
      )}

      <div className="rounded-lg border bg-card p-6">
        <InvoiceForm
          key={invoiceType}
          invoiceType={invoiceType}
          customers={customers}
          suppliers={suppliers}
          locations={locations}
          onSubmit={handleSubmit}
          isLoading={createMutation.isPending}
          serverError={serverError}
        />
      </div>
      <Link href="/finance/invoices" className="text-sm text-muted-foreground hover:underline">
        Cancel
      </Link>
    </div>
  );
}
