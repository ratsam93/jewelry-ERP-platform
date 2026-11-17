'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  EMPTY_SCHEME,
  buildGoldSavingsInput,
  buildKittySchemeInput,
  errorSummary,
  type FieldErrors,
  type SchemeFormValues,
} from '@/lib/finance-form';
import { FormError, SelectField, SubmitBar, TextField } from '@/features/payroll/form-fields';

const LABELS: Record<string, string> = {
  schemeName: 'Scheme name',
  schemeType: 'Type',
  monthlyAmountPaise: 'Monthly installment',
  durationMonths: 'Duration',
  maxMembers: 'Maximum members',
  bonusPercent: 'Bonus',
  bonusMonths: 'Bonus months',
  maturityBonusPercent: 'Maturity bonus',
  startDate: 'Start date',
  terms: 'Terms',
};

interface Props {
  kind: 'kitty' | 'gold';
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
  pending: boolean;
  serverError?: string | null;
  cancelHref: string;
}

export function SchemeForm({ kind, onSubmit, pending, serverError, cancelHref }: Props) {
  const [v, setV] = useState<SchemeFormValues>(EMPTY_SCHEME);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof SchemeFormValues) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = kind === 'kitty' ? buildKittySchemeInput(v) : buildGoldSavingsInput(v);
    setErrors(errs);
    if (!input) return;
    await onSubmit(input);
  };

  return (
    <form onSubmit={handle} noValidate className="max-w-3xl space-y-4 rounded-lg border p-5">
      <FormError message={serverError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Scheme name *" value={v.schemeName} onChange={set('schemeName')} error={errors.schemeName} />
        {kind === 'kitty' && (
          <SelectField
            label="Type *"
            value={v.schemeType}
            onChange={set('schemeType')}
            error={errors.schemeType}
            options={[
              { value: 'KITTY', label: 'Kitty' },
              { value: 'CHIT', label: 'Chit' },
            ]}
          />
        )}
        <TextField label="Monthly installment (₹) *" value={v.monthlyAmount} onChange={set('monthlyAmount')} error={errors.monthlyAmountPaise} inputMode="decimal" placeholder="e.g. 5000" />
        <TextField label="Duration (months) *" value={v.durationMonths} onChange={set('durationMonths')} error={errors.durationMonths} inputMode="numeric" placeholder="e.g. 11" />
        {kind === 'kitty' ? (
          <>
            <TextField label="Maximum members *" value={v.maxMembers} onChange={set('maxMembers')} error={errors.maxMembers} inputMode="numeric" />
            <TextField label="Bonus (%)" value={v.bonusPercent} onChange={set('bonusPercent')} error={errors.bonusPercent} inputMode="numeric" hint="Whole percent, optional" />
          </>
        ) : (
          <>
            <TextField label="Bonus months" value={v.bonusMonths} onChange={set('bonusMonths')} error={errors.bonusMonths} inputMode="numeric" hint="Months the jeweller pays for the customer (default 0)" />
            <TextField label="Maturity bonus (%)" value={v.maturityBonusPercent} onChange={set('maturityBonusPercent')} error={errors.maturityBonusPercent} inputMode="decimal" hint="Up to 2 decimals (default 0)" />
          </>
        )}
        <TextField label="Start date *" type="date" value={v.startDate} onChange={set('startDate')} error={errors.startDate} />
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Terms</span>
        <textarea
          aria-label="Terms"
          className="h-24 w-full rounded-md border px-3 py-2 text-sm"
          value={v.terms}
          onChange={(e) => set('terms')(e.target.value)}
        />
        {errors.terms && <span className="block text-xs text-red-600">{errors.terms}</span>}
      </label>
      <SubmitBar pending={pending} idleLabel="Create scheme" summary={errorSummary(errors, LABELS)}>
        <Link href={cancelHref} className="text-sm text-muted-foreground hover:underline">Cancel</Link>
      </SubmitBar>
    </form>
  );
}
