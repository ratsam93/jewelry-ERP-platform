'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { buildCustomerInput, EMPTY_CUSTOMER_FORM, type CustomerFormValues } from '@/lib/crm-form';
import { FormField, type FormFieldProps } from '@/features/crm/FormField';

const TYPES = [
  { value: 'RETAIL', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'CORPORATE', label: 'Corporate' },
];

export default function NewCustomerPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<CustomerFormValues>(EMPTY_CUSTOMER_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = trpc.crm.customerCreate.useMutation();

  const set = (k: keyof CustomerFormValues) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k: keyof CustomerFormValues, label: string, extra: Partial<FormFieldProps> = {}) => (
    <FormField label={label} value={form[k]} onChange={set(k)} error={errors[k]} {...extra} />
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildCustomerInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      void utils.crm.customerList.invalidate();
      router.push(created?.id ? `/crm/customers/${created.id}` : '/crm/customers');
    } catch {
      // surfaced via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Customer"
        description="Add a customer to the CRM."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Customers', href: '/crm/customers' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createMut.error.message || 'Could not create the customer.'}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('firstName', 'First name *')}
          {field('lastName', 'Last name *')}
          {field('phone', 'Phone', { type: 'tel', placeholder: '+919820000001', hint: '10-digit mobile or +country code number' })}
          {field('alternatePhone', 'Alternate phone', { type: 'tel' })}
          {field('email', 'Email', { type: 'email' })}
          {field('customerType', 'Customer type', { options: TYPES })}
          {field('address', 'Address', { className: 'sm:col-span-2' })}
          {field('city', 'City')}
          {field('state', 'State')}
          {field('postalCode', 'Postal code')}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Create customer'}
          </button>
          <Link href="/crm/customers" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
