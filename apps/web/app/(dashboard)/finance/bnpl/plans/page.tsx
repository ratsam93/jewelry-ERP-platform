'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { FileText, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { planRow, providerRow, readableError } from '@/lib/finance-form';
import { EmiPlanForm } from '@/features/bnpl/bnpl-forms';

export default function BnplPlansPage() {
  const { data, isLoading, refetch } = trpc.bnpl.listEmiPlans.useQuery({} as never);
  const raw = data as Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> } | undefined;
  const { data: provData } = trpc.bnpl.listProviders.useQuery();
  const providers = ((provData as Array<Record<string, unknown>> | undefined) ?? []).map(providerRow);
  const providerNames = new Map(providers.map((p) => [p.id, p.name]));
  const rows = (Array.isArray(raw) ? raw : (raw?.items ?? [])).map((p) => planRow(p, providerNames));

  const [open, setOpen] = useState(false);
  const createMut = trpc.bnpl.createEmiPlan.useMutation();

  const handleCreate = async (input: Record<string, unknown>): Promise<boolean> => {
    try {
      await createMut.mutateAsync(input as never);
      await refetch();
      setOpen(false);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="EMI Plans"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'BNPL', href: '/finance/bnpl' },
          { label: 'Plans' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> {open ? 'Close form' : 'New Plan'}
          </button>
        }
      />
      {open && (
        <EmiPlanForm
          providers={providers.map((p) => ({ id: p.id, name: p.name }))}
          onSubmit={handleCreate}
          pending={createMut.isPending}
          serverError={createMut.error ? readableError(createMut.error, 'Could not create the plan.') : null}
        />
      )}
      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1.4fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Provider</span>
          <span>Tenure</span>
          <span>Interest</span>
          <span>Amount range</span>
          <span>Status</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No plans" description="Use New Plan to add one." />
        ) : (
          <div className="divide-y">
            {rows.map((p) => (
              <div key={p.id} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1.4fr_1fr] gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{p.name}</span>
                <span>{p.provider}</span>
                <span>{p.tenure}</span>
                <span>{p.interest}</span>
                <span>{formatPaise(p.minAmountPaise)} - {formatPaise(p.maxAmountPaise)}</span>
                <StatusBadge label={p.isActive ? 'Active' : 'Inactive'} variant={p.isActive ? 'success' : 'default'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
