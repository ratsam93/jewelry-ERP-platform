'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import {
  buildAgentInput,
  COMMISSION_TYPE_LABELS,
  readableError,
  type AgentFormValues,
  type CommissionType,
  type FieldErrors,
} from '@/lib/wholesale-form';

const EMPTY: AgentFormValues = {
  name: '',
  phone: '',
  email: '',
  commissionType: 'PERCENTAGE',
  commissionRate: '',
  bankAccountNumber: '',
  ifscCode: '',
  panNumber: '',
  isActive: true,
};

const TEXT_FIELDS: Array<{ key: 'name' | 'phone' | 'email' | 'bankAccountNumber' | 'ifscCode' | 'panNumber'; label: string; type?: string }> = [
  { key: 'name', label: 'Agent name *' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'panNumber', label: 'PAN' },
  { key: 'bankAccountNumber', label: 'Bank account number' },
  { key: 'ifscCode', label: 'IFSC code' },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [form, setForm] = useState<AgentFormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const createMut = trpc.wholesale.createAgent.useMutation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildAgentInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      const created = (await createMut.mutateAsync(input as never)) as { id?: string } | undefined;
      router.push(created?.id ? `/wholesale/agents/${created.id}` : '/wholesale/agents');
    } catch {
      // shown through createMut.error
    }
  };

  const pct = form.commissionType === 'PERCENTAGE';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Agent"
        description="Register an agent or broker and their commission terms."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Wholesale', href: '/wholesale' },
          { label: 'Agents', href: '/wholesale/agents' },
          { label: 'New' },
        ]}
      />
      <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-4 rounded-lg border p-5">
        {createMut.error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {readableError(createMut.error, 'Could not create the agent.')}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
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
          <label className="space-y-1 text-sm">
            <span className="font-medium">Commission type *</span>
            <select
              aria-label="Commission type"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form.commissionType}
              onChange={(e) => setForm({ ...form, commissionType: e.target.value as CommissionType })}
            >
              {(Object.keys(COMMISSION_TYPE_LABELS) as CommissionType[]).map((t) => (
                <option key={t} value={t}>{COMMISSION_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{pct ? 'Commission % *' : 'Commission amount (Rs) *'}</span>
            <input
              inputMode="decimal"
              aria-label="Commission rate"
              aria-invalid={errors.commissionRate ? true : undefined}
              placeholder={pct ? 'e.g. 2.5' : 'e.g. 50'}
              className="h-9 w-full rounded-md border px-3 text-sm"
              value={form.commissionRate}
              onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
            />
            {errors.commissionRate && <span className="block text-xs text-red-600">{errors.commissionRate}</span>}
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Active
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Create agent'}
          </button>
          <Link href="/wholesale/agents" className="text-sm text-muted-foreground hover:underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
