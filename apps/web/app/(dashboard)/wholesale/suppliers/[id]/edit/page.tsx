'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { buildSupplierInput, type SupplierFormValues } from '@/lib/supplier-form';
import { diffSupplierUpdate, readableError } from '@/lib/wholesale-form';

const KEYS: Array<{ key: keyof SupplierFormValues; label: string; type?: string }> = [
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

function toForm(s: Record<string, unknown>): SupplierFormValues {
  const out = {} as SupplierFormValues;
  for (const { key } of KEYS) out[key] = (s[key] as string | null | undefined) ?? '';
  return out;
}

export default function EditSupplierPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const { data, isLoading, error } = trpc.wholesale.getSupplier.useQuery({ id }, { enabled: Boolean(id) });
  const updateMut = trpc.wholesale.updateSupplier.useMutation();
  const [form, setForm] = useState<SupplierFormValues | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noChange, setNoChange] = useState(false);

  useEffect(() => {
    if (data && !form) {
      const s = data as unknown as Record<string, unknown>;
      setForm(toForm(s));
      setIsActive(s.isActive !== false);
    }
  }, [data, form]);

  const state = renderDetailState({ isLoading, error, data, entity: 'Supplier', backHref: '/wholesale/suppliers' });
  if (state) return state;
  if (!form) return null;
  const original = data as unknown as Record<string, unknown>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildSupplierInput(form);
    setErrors(errs);
    setNoChange(false);
    if (!input) return;
    const patch = diffSupplierUpdate(original, input);
    if (isActive !== (original.isActive !== false)) patch.isActive = isActive;
    if (Object.keys(patch).length === 0) {
      setNoChange(true);
      return;
    }
    try {
      await updateMut.mutateAsync({ id, data: patch } as never);
      router.push(`/wholesale/suppliers/${id}`);
    } catch {
      // shown via updateMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${String(original.name ?? 'Supplier')}`}
        description="Update supplier details."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Wholesale', href: '/wholesale' },
          { label: 'Suppliers', href: '/wholesale/suppliers' },
          { label: String(original.name ?? 'Supplier'), href: `/wholesale/suppliers/${id}` },
          { label: 'Edit' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {updateMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {readableError(updateMut.error, 'Could not update the supplier.')}
          </p>
        )}
        {noChange && <p className="text-sm text-muted-foreground">No changes to save.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {KEYS.map((f) => (
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={updateMut.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateMut.isPending ? 'Saving...' : 'Save changes'}
          </button>
          <Link href={`/wholesale/suppliers/${id}`} className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
