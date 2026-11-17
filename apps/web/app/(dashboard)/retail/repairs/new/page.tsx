'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { humanizeServerError } from '@/lib/pos-sale';
import { buildRepairInput, type FormErrors, type RepairFormValues } from '@/lib/retail-forms';
import {
  CustomerPicker,
  Field,
  LocationSelect,
  inputClass,
  type PickedCustomer,
} from '@/features/retail/RetailFormParts';

export default function NewRepairPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [form, setForm] = useState<Omit<RepairFormValues, 'customerId'>>({
    locationId: '',
    itemDescription: '',
    weightGrams: '',
    diagnosticNotes: '',
    estimate: '',
    promisedDate: '',
  });
  const [errors, setErrors] = useState<FormErrors<keyof RepairFormValues>>({});
  const createMut = trpc.retail.createRepairOrder.useMutation();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildRepairInput({ ...form, customerId: customer?.id ?? '' });
    setErrors(errs);
    if (!input) return;
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      router.push(created?.id ? `/retail/repairs/${created.id}` : '/retail/repairs');
    } catch {
      // shown via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Repair"
        description="Receive a piece for repair."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Retail', href: '/retail' },
          { label: 'Repairs', href: '/retail/repairs' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {humanizeServerError(createMut.error.message, 'Could not create the repair order.')}
          </p>
        )}
        <Field label="Customer *" error={errors.customerId}>
          <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); if (c) setErrors((prev) => { const { customerId: _drop, ...rest } = prev; return rest; }); }} invalid={Boolean(errors.customerId)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store / location *" error={errors.locationId}>
            <LocationSelect value={form.locationId} onChange={(v) => set('locationId', v)} invalid={Boolean(errors.locationId)} />
          </Field>
          <Field label="Promised date" error={errors.promisedDate}>
            <input type="date" aria-label="Promised date" className={inputClass} value={form.promisedDate} onChange={(e) => set('promisedDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Item description *" error={errors.itemDescription}>
          <input type="text" aria-label="Item description" maxLength={500} className={inputClass} value={form.itemDescription} onChange={(e) => set('itemDescription', e.target.value)} placeholder="e.g. Gold chain, broken clasp" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item weight (g)" error={errors.weightGrams}>
            <input type="text" inputMode="decimal" aria-label="Item weight in grams" className={inputClass} value={form.weightGrams} onChange={(e) => set('weightGrams', e.target.value)} placeholder="12.500" />
          </Field>
          <Field label="Estimate (₹)" error={errors.estimate}>
            <input type="text" inputMode="decimal" aria-label="Estimate in rupees" className={inputClass} value={form.estimate} onChange={(e) => set('estimate', e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Diagnostic notes">
          <textarea aria-label="Diagnostic notes" rows={3} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.diagnosticNotes} onChange={(e) => set('diagnosticNotes', e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={createMut.isPending} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {createMut.isPending ? 'Saving...' : 'Create repair'}
          </button>
          <Link href="/retail/repairs" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
