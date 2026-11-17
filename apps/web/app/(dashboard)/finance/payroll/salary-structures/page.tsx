'use client';

import { useState, type FormEvent } from 'react';
import { PageHeader, EmptyState } from '@caratflow/ui';
import { FileText, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import { formatDateOnly } from '@/lib/date-only';
import {
  EMPTY_SALARY_STRUCTURE,
  buildSalaryStructureInput,
  errorSummary,
  readableError,
  type FieldErrors,
  type SalaryStructureFormValues,
} from '@/lib/finance-form';
import { FormError, SubmitBar, TextField } from '@/features/payroll/form-fields';

const LABELS: Record<string, string> = {
  name: 'Name',
  designation: 'Designation',
  basicPercent: 'Basic %',
  hraPercent: 'HRA %',
  daPercent: 'DA %',
  conveyancePaise: 'Conveyance',
  medicalPaise: 'Medical',
  otherAllowancePaise: 'Other allowance',
  effectiveFrom: 'Effective from',
  effectiveTo: 'Effective to',
};

export default function SalaryStructuresPage() {
  const { data, isLoading, refetch } = trpc.payroll.salaryStructures.list.useQuery();
  const items = ((data as Array<Record<string, unknown>> | undefined) ?? []);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SalaryStructureFormValues>(EMPTY_SALARY_STRUCTURE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const createMut = trpc.payroll.salaryStructures.create.useMutation();
  const set = (k: keyof SalaryStructureFormValues) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildSalaryStructureInput(form);
    setErrors(errs);
    if (!input) return;
    try {
      await createMut.mutateAsync(input as never);
      setForm(EMPTY_SALARY_STRUCTURE);
      setOpen(false);
      await refetch();
    } catch {
      // shown via createMut.error
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Structures"
        description="Templates for salary component breakdowns."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payroll', href: '/finance/payroll' },
          { label: 'Salary Structures' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> {open ? 'Close form' : 'New Structure'}
          </button>
        }
      />

      {open && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-lg border p-5">
          <h3 className="text-sm font-semibold">New salary structure</h3>
          <FormError message={createMut.error ? readableError(createMut.error, 'Could not create the structure.') : null} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label="Name *" value={form.name} onChange={set('name')} error={errors.name} />
            <TextField label="Designation" value={form.designation} onChange={set('designation')} error={errors.designation} />
            <span className="hidden lg:block" />
            <TextField label="Basic % of CTC *" value={form.basicPercent} onChange={set('basicPercent')} error={errors.basicPercent} inputMode="decimal" placeholder="e.g. 50" />
            <TextField label="HRA % *" value={form.hraPercent} onChange={set('hraPercent')} error={errors.hraPercent} inputMode="decimal" placeholder="e.g. 20" />
            <TextField label="DA % *" value={form.daPercent} onChange={set('daPercent')} error={errors.daPercent} inputMode="decimal" placeholder="e.g. 10" />
            <TextField label="Conveyance (₹)" value={form.conveyance} onChange={set('conveyance')} error={errors.conveyancePaise} inputMode="decimal" />
            <TextField label="Medical (₹)" value={form.medical} onChange={set('medical')} error={errors.medicalPaise} inputMode="decimal" />
            <TextField label="Other allowance (₹)" value={form.otherAllowance} onChange={set('otherAllowance')} error={errors.otherAllowancePaise} inputMode="decimal" />
            <TextField label="Effective from *" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} error={errors.effectiveFrom} />
            <TextField label="Effective to" type="date" value={form.effectiveTo} onChange={set('effectiveTo')} error={errors.effectiveTo} />
          </div>
          <SubmitBar pending={createMut.isPending} idleLabel="Create structure" summary={errorSummary(errors, LABELS)} />
        </form>
      )}

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Basic %</span>
          <span>HRA %</span>
          <span>DA %</span>
          <span>Allowances</span>
          <span>Effective From</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No salary structures defined" description="Use New Structure to add one." />
        ) : (
          <div className="divide-y">
            {items.map((s) => {
              const allowance = Number(s.conveyancePaise ?? 0) + Number(s.medicalPaise ?? 0) + Number(s.otherAllowancePaise ?? 0);
              return (
                <div key={s.id as string} className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <span className="font-medium">{s.name as string}</span>
                  <span>{s.basicPercent as number}%</span>
                  <span>{s.hraPercent as number}%</span>
                  <span>{s.daPercent as number}%</span>
                  <span>{formatPaise(allowance)}</span>
                  <span>{formatDateOnly(s.effectiveFrom)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
