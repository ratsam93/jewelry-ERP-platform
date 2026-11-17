'use client';

import { useState, type FormEvent } from 'react';
import {
  BNPL_PROVIDER_NAMES,
  EMI_CARD_TYPES,
  EMPTY_EMI_PLAN,
  EMPTY_PROVIDER,
  buildBnplProviderInput,
  buildEmiPlanInput,
  errorSummary,
  type BnplProviderFormValues,
  type EmiPlanFormValues,
  type FieldErrors,
} from '@/lib/finance-form';
import { FormError, SelectField, SubmitBar, TextField } from '@/features/payroll/form-fields';

const PROVIDER_LABELS: Record<string, string> = {
  providerName: 'Provider',
  displayName: 'Display name',
  minOrderPaise: 'Minimum order',
  maxOrderPaise: 'Maximum order',
  supportedTenures: 'Tenures',
  processingFeePct: 'Processing fee',
  apiKey: 'API key',
  apiSecret: 'API secret',
  webhookSecret: 'Webhook secret',
};

const PLAN_LABELS: Record<string, string> = {
  providerId: 'Provider',
  bankName: 'Bank name',
  tenure: 'Tenure',
  interestRatePct: 'Interest rate',
  processingFeePaise: 'Processing fee',
  minAmountPaise: 'Minimum amount',
  maxAmountPaise: 'Maximum amount',
  subventionPct: 'Subvention',
  cardType: 'Card type',
};

export function ProviderForm({
  onSubmit,
  pending,
  serverError,
}: {
  onSubmit: (input: Record<string, unknown>) => Promise<boolean>;
  pending: boolean;
  serverError?: string | null;
}) {
  const [v, setV] = useState<BnplProviderFormValues>(EMPTY_PROVIDER);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof BnplProviderFormValues) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildBnplProviderInput(v);
    setErrors(errs);
    if (!input) return;
    if (await onSubmit(input)) setV(EMPTY_PROVIDER);
  };

  return (
    <form onSubmit={handle} noValidate className="space-y-4 rounded-lg border p-5">
      <h3 className="text-sm font-semibold">New BNPL provider</h3>
      <FormError message={serverError} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Provider *"
          value={v.providerName}
          onChange={set('providerName')}
          error={errors.providerName}
          options={BNPL_PROVIDER_NAMES.map((n) => ({ value: n, label: n.replace(/_/g, ' ') }))}
        />
        <TextField label="Display name *" value={v.displayName} onChange={set('displayName')} error={errors.displayName} />
        <TextField label="Supported tenures (months) *" value={v.supportedTenures} onChange={set('supportedTenures')} error={errors.supportedTenures} placeholder="3, 6, 12" />
        <TextField label="Minimum order (₹) *" value={v.minOrder} onChange={set('minOrder')} error={errors.minOrderPaise} inputMode="decimal" />
        <TextField label="Maximum order (₹) *" value={v.maxOrder} onChange={set('maxOrder')} error={errors.maxOrderPaise} inputMode="decimal" />
        <TextField label="Processing fee (%)" value={v.processingFeePct} onChange={set('processingFeePct')} error={errors.processingFeePct} inputMode="numeric" hint="Whole percent, default 0" />
        <TextField label="API key" value={v.apiKey} onChange={set('apiKey')} error={errors.apiKey} type="password" />
        <TextField label="API secret" value={v.apiSecret} onChange={set('apiSecret')} error={errors.apiSecret} type="password" />
        <TextField label="Webhook secret" value={v.webhookSecret} onChange={set('webhookSecret')} error={errors.webhookSecret} type="password" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.isActive} onChange={(e) => setV((p) => ({ ...p, isActive: e.target.checked }))} />
        Active
      </label>
      <SubmitBar pending={pending} idleLabel="Create provider" summary={errorSummary(errors, PROVIDER_LABELS)} />
    </form>
  );
}

export function EmiPlanForm({
  providers,
  onSubmit,
  pending,
  serverError,
}: {
  providers: Array<{ id: string; name: string }>;
  onSubmit: (input: Record<string, unknown>) => Promise<boolean>;
  pending: boolean;
  serverError?: string | null;
}) {
  const [v, setV] = useState<EmiPlanFormValues>(EMPTY_EMI_PLAN);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof EmiPlanFormValues) => (val: string) => setV((p) => ({ ...p, [k]: val }));

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildEmiPlanInput(v);
    setErrors(errs);
    if (!input) return;
    if (await onSubmit(input)) setV(EMPTY_EMI_PLAN);
  };

  return (
    <form onSubmit={handle} noValidate className="space-y-4 rounded-lg border p-5">
      <h3 className="text-sm font-semibold">New EMI plan</h3>
      <FormError message={serverError} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Provider"
          value={v.providerId}
          onChange={set('providerId')}
          placeholder="None (bank EMI)"
          error={errors.providerId}
          options={providers.map((p) => ({ value: p.id, label: p.name }))}
        />
        <TextField label="Bank name" value={v.bankName} onChange={set('bankName')} error={errors.bankName} hint="Required when no provider is chosen" />
        <TextField label="Tenure (months) *" value={v.tenure} onChange={set('tenure')} error={errors.tenure} inputMode="numeric" />
        <TextField label="Interest (% a year) *" value={v.interestRate} onChange={set('interestRate')} error={errors.interestRatePct} inputMode="decimal" hint="e.g. 12 or 11.5; 0 for no interest" />
        <TextField label="Processing fee (₹)" value={v.processingFee} onChange={set('processingFee')} error={errors.processingFeePaise} inputMode="decimal" />
        <TextField label="Subvention (%)" value={v.subventionPct} onChange={set('subventionPct')} error={errors.subventionPct} inputMode="numeric" />
        <TextField label="Minimum amount (₹) *" value={v.minAmount} onChange={set('minAmount')} error={errors.minAmountPaise} inputMode="decimal" />
        <TextField label="Maximum amount (₹) *" value={v.maxAmount} onChange={set('maxAmount')} error={errors.maxAmountPaise} inputMode="decimal" />
        <SelectField
          label="Card type"
          value={v.cardType}
          onChange={set('cardType')}
          placeholder="Any"
          error={errors.cardType}
          options={EMI_CARD_TYPES.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.isNoCostEmi} onChange={(e) => setV((p) => ({ ...p, isNoCostEmi: e.target.checked }))} />
          No-cost EMI
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.isActive} onChange={(e) => setV((p) => ({ ...p, isActive: e.target.checked }))} />
          Active
        </label>
      </div>
      <SubmitBar pending={pending} idleLabel="Create plan" summary={errorSummary(errors, PLAN_LABELS)} />
    </form>
  );
}
