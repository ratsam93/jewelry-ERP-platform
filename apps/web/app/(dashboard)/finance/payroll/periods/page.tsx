'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, getStatusVariant, EmptyState } from '@caratflow/ui';
import { LayoutGrid, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatDateOnly } from '@/lib/date-only';
import { buildPeriodInput, readableError } from '@/lib/finance-form';
import { FormError } from '@/features/payroll/form-fields';

export default function PayrollPeriodsPage() {
  const [label, setLabel] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const { data, isLoading, refetch } = trpc.payroll.payrollPeriods.list.useQuery();
  const items = ((data as Array<Record<string, unknown>> | undefined) ?? []);

  const createMut = trpc.payroll.payrollPeriods.create.useMutation({ onSuccess: () => refetch() });
  const processMut = trpc.payroll.payrollPeriods.process.useMutation({ onSuccess: () => refetch() });
  const deleteMut = trpc.payroll.payrollPeriods.deleteDraft.useMutation({ onSuccess: () => refetch() });

  const deleteDraft = (id: string, periodLabel: string) => {
    if (!window.confirm(`Delete the draft period ${periodLabel}? This cannot be undone.`)) return;
    deleteMut.mutate({ id } as never);
  };

  const handleCreate = async () => {
    const { input, errors } = buildPeriodInput(label);
    setLabelError(errors.periodLabel ?? null);
    if (!input) return;
    try {
      await createMut.mutateAsync(input as never);
      setLabel('');
    } catch {
      // surfaced through createMut.error below
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Periods"
        description="Create and process monthly payroll."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Periods' },
        ]}
      />

      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium" htmlFor="period-month">Payroll month</label>
          <input
            id="period-month"
            type="month"
            className="rounded border px-3 py-1.5 text-sm"
            value={label}
            aria-invalid={labelError ? true : undefined}
            onChange={(e) => { setLabel(e.target.value); setLabelError(null); }}
          />
          <button
            onClick={handleCreate}
            disabled={createMut.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {createMut.isPending ? 'Creating...' : 'Create Period'}
          </button>
        </div>
        {labelError && <p role="alert" className="text-xs text-red-600">{labelError}</p>}
        {createMut.error && <FormError message={readableError(createMut.error, 'Could not create the period.')} />}
        {processMut.error && <FormError message={readableError(processMut.error, 'Could not process the period.')} />}
        {deleteMut.error && <FormError message={readableError(deleteMut.error, 'Could not delete the period.')} />}
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Label</span>
          <span>Start</span>
          <span>End</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<LayoutGrid className="h-8 w-8" />} title="No payroll periods yet" />
        ) : (
          <div className="divide-y">
            {items.map((p) => (
              <div key={p.id as string} className="grid grid-cols-[1fr_1fr_1fr_1fr_1.2fr] gap-4 px-4 py-3 text-sm items-center">
                <Link href={`/finance/payroll/periods/${p.id}`} className="font-mono font-medium hover:underline">
                  {p.periodLabel as string}
                </Link>
                <span>{formatDateOnly(p.startDate)}</span>
                <span>{formatDateOnly(p.endDate)}</span>
                <StatusBadge label={(p.status as string) ?? '-'} variant={getStatusVariant(p.status as string)} dot={false} />
                <div className="flex gap-2">
                  {(p.status as string) === 'DRAFT' && (
                    <button
                      onClick={() => processMut.mutate({ id: p.id as string } as never)}
                      className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                    >
                      Process
                    </button>
                  )}
                  {(p.status as string) === 'DRAFT' && (
                    <button
                      onClick={() => deleteDraft(p.id as string, p.periodLabel as string)}
                      disabled={deleteMut.isPending}
                      className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete draft
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
