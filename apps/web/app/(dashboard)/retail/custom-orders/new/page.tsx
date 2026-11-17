'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { humanizeServerError } from '@/lib/pos-sale';
import { buildCustomOrderInput, type CustomOrderFormValues, type FormErrors } from '@/lib/retail-forms';
import {
  CustomerPicker,
  Field,
  LocationSelect,
  inputClass,
  type PickedCustomer,
} from '@/features/retail/RetailFormParts';

export default function NewCustomOrderPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [form, setForm] = useState<Omit<CustomOrderFormValues, 'customerId'>>({
    locationId: '',
    description: '',
    designNotes: '',
    estimate: '',
    expectedDate: '',
    targetWeightGrams: '',
    metalPurity: '',
  });
  const [errors, setErrors] = useState<FormErrors<keyof CustomOrderFormValues>>({});
  const createMut = trpc.retail.createCustomOrder.useMutation();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildCustomOrderInput({ ...form, customerId: customer?.id ?? '' });
    setErrors(errs);
    if (!input) return;
    try {
      await createMut.mutateAsync(input as never);
      router.push('/retail/custom-orders');
    } catch {
      // shown via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Custom Order"
        description="Record a bespoke order for a customer."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Retail', href: '/retail' },
          { label: 'Custom Orders', href: '/retail/custom-orders' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {humanizeServerError(createMut.error.message, 'Could not create the custom order.')}
          </p>
        )}
        <Field label="Customer *" error={errors.customerId}>
          <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); if (c) setErrors((prev) => { const { customerId: _drop, ...rest } = prev; return rest; }); }} invalid={Boolean(errors.customerId)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store / location *" error={errors.locationId}>
            <LocationSelect value={form.locationId} onChange={(v) => set('locationId', v)} invalid={Boolean(errors.locationId)} />
          </Field>
          <Field label="Expected delivery date" error={errors.expectedDate}>
            <input type="date" aria-label="Expected delivery date" className={inputClass} value={form.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Description *" error={errors.description}>
          <textarea aria-label="Description" rows={3} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Bridal necklace set in 22K with kundan work" />
        </Field>
        <Field label="Design notes">
          <textarea aria-label="Design notes" rows={2} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.designNotes} onChange={(e) => set('designNotes', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estimate (₹)" error={errors.estimate}>
            <input type="text" inputMode="decimal" aria-label="Estimate in rupees" className={inputClass} value={form.estimate} onChange={(e) => set('estimate', e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Target weight (g)" error={errors.targetWeightGrams}>
            <input type="text" inputMode="decimal" aria-label="Target weight in grams" className={inputClass} value={form.targetWeightGrams} onChange={(e) => set('targetWeightGrams', e.target.value)} placeholder="45.000" />
          </Field>
          <Field label="Metal purity" error={errors.metalPurity} hint="e.g. 916 for 22K">
            <input type="text" inputMode="numeric" aria-label="Metal purity" className={inputClass} value={form.metalPurity} onChange={(e) => set('metalPurity', e.target.value)} placeholder="916" />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={createMut.isPending} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {createMut.isPending ? 'Saving...' : 'Create order'}
          </button>
          <Link href="/retail/custom-orders" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
