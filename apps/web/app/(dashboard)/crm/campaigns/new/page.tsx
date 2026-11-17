'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { buildCampaignInput, EMPTY_CAMPAIGN_FORM, type CampaignFormValues } from '@/lib/crm-form';
import { FormField, type FormFieldProps } from '@/features/crm/FormField';

const CHANNELS = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];
const TYPES = [
  { value: '', label: 'All customers' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'CORPORATE', label: 'Corporate' },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<CampaignFormValues>(EMPTY_CAMPAIGN_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = trpc.crm.campaignCreate.useMutation();

  const set = (k: keyof CampaignFormValues) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k: keyof CampaignFormValues, label: string, extra: Partial<FormFieldProps> = {}) => (
    <FormField label={label} value={form[k]} onChange={set(k)} error={errors[k]} {...extra} />
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildCampaignInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      void utils.crm.campaignList.invalidate();
      router.push(created?.id ? `/crm/campaigns/${created.id}` : '/crm/campaigns');
    } catch {
      // surfaced via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Campaign"
        description="Create a draft marketing campaign. Execute it from the campaign page."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Campaigns', href: '/crm/campaigns' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createMut.error.message || 'Could not create the campaign.'}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Campaign name *', { className: 'sm:col-span-2' })}
          {field('channel', 'Channel *', { options: CHANNELS })}
          {field('scheduledAt', 'Schedule at', { type: 'datetime-local', hint: 'Leave empty to save as a draft' })}
          {field('customerType', 'Audience: customer type', { options: TYPES })}
          {field('city', 'Audience: city')}
          {field('description', 'Description', { multiline: true, className: 'sm:col-span-2' })}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Create campaign'}
          </button>
          <Link href="/crm/campaigns" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
