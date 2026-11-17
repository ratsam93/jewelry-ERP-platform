'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { buildSupplierInput, type SupplierFormValues } from '@/lib/supplier-form';
import { readableError } from '@/lib/wholesale-form';

const EMPTY: SupplierFormValues = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  country: 'IN',
  postalCode: '',
  gstinNumber: '',
  panNumber: '',
  supplierType: '',
};

const FIELDS: Array<{ key: keyof SupplierFormValues; label: string; type?: string }> = [
  { key: 'name', label: 'Supplier name *' },
  { key: 'contactPerson', label: 'Contact person' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country (2-letter code)' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'gstinNumber', label: 'GSTIN' },
  { key: 'panNumber', label: 'PAN' },
  { key: 'supplierType', label: 'Supplier type' },
];

export default function NewSupplierPage() {
  const router = useRouter();
  const [form, setForm] = useState<SupplierFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = trpc.wholesale.createSupplier.useMutation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildSupplierInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      router.push(created?.id ? `/wholesale/suppliers/${created.id}` : '/wholesale/suppliers');
    } catch {
      // surfaced through createMut.error below
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Supplier"
        description="Add a supplier to the directory."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Wholesale', href: '/wholesale' },
          { label: 'Suppliers', href: '/wholesale/suppliers' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {readableError(createMut.error, 'Could not create the supplier.')}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="space-y-1 text-sm">
              <span className="font-medium">{f.label}</span>
              <input
                type={f.type ?? 'text'}
                aria-label={f.label}
                aria-invalid={errors[f.key] ? true : undefined}
                className="h-9 w-full rounded-md border px-3 text-sm"
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
              {errors[f.key] && <span className="block text-xs text-red-600">{errors[f.key]}</span>}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Create supplier'}
          </button>
          <Link href="/wholesale/suppliers" className="text-sm text-muted-foreground hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
