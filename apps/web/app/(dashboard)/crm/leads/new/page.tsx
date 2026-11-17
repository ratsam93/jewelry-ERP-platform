'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { buildLeadInput, EMPTY_LEAD_FORM, LEAD_SOURCES, type LeadFormValues } from '@/lib/crm-form';
import { FormField, type FormFieldProps } from '@/features/crm/FormField';

const SOURCES = LEAD_SOURCES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
}));

export default function NewLeadPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<LeadFormValues>(EMPTY_LEAD_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = trpc.crm.leadCreate.useMutation();

  const set = (k: keyof LeadFormValues) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k: keyof LeadFormValues, label: string, extra: Partial<FormFieldProps> = {}) => (
    <FormField label={label} value={form[k]} onChange={set(k)} error={errors[k]} {...extra} />
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildLeadInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      void utils.crm.leadList.invalidate();
      router.push(created?.id ? `/crm/leads/${created.id}` : '/crm/leads');
    } catch {
      // surfaced via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Lead"
        description="Capture a sales lead."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Leads', href: '/crm/leads' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createMut.error.message || 'Could not create the lead.'}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('firstName', 'First name *')}
          {field('lastName', 'Last name *')}
          {field('phone', 'Phone', { type: 'tel', placeholder: '+919820000001' })}
          {field('email', 'Email', { type: 'email' })}
          {field('source', 'Source *', { options: SOURCES })}
          {field('estimatedValue', 'Estimated value (INR)', { placeholder: '25000' })}
          {field('nextFollowUpDate', 'Next follow-up', { type: 'date' })}
          {field('notes', 'Notes', { multiline: true, className: 'sm:col-span-2' })}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Create lead'}
          </button>
          <Link href="/crm/leads" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
