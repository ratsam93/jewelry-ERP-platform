'use client';

import * as React from 'react';
import { MoneyInput, FormField } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import type { RetailDiscountType } from '@caratflow/shared-types';

export type DiscountTypeValue = 'PERCENTAGE' | 'FIXED' | 'BUY_X_GET_Y';

/** Discount as returned by the API (money in paise, percentages in basis points). */
export interface DiscountFormValues {
  id?: string;
  name: string;
  discountType: DiscountTypeValue;
  value: number;
  buyQuantity: number | null;
  getQuantity: number | null;
  minPurchasePaise: number | null;
  maxDiscountPaise: number | null;
  startDate: string | Date;
  endDate: string | Date;
  isActive: boolean;
  usageLimit: number | null;
}

interface DiscountFormProps {
  /** Existing discount to edit. Omit to create a new one. */
  discount?: DiscountFormValues | null;
  onSaved?: (discount: unknown) => void;
  onCancel?: () => void;
}

const DISCOUNT_TYPES: Array<{ value: DiscountTypeValue; label: string }> = [
  { value: 'PERCENTAGE', label: 'Percentage off' },
  { value: 'FIXED', label: 'Fixed amount off' },
  { value: 'BUY_X_GET_Y', label: 'Buy X get Y free' },
];

const inputClass =
  'h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Could not save the discount.';
}

/** Whole, positive integer from a text field; null when blank or invalid. */
function parseIntField(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export function DiscountForm({ discount, onSaved, onCancel }: DiscountFormProps) {
  const isEdit = Boolean(discount?.id);

  const [name, setName] = React.useState(discount?.name ?? '');
  const [discountType, setDiscountType] = React.useState<DiscountTypeValue>(discount?.discountType ?? 'PERCENTAGE');
  // Percentage is entered as a percent and stored as basis points (10000 = 100%).
  const [percent, setPercent] = React.useState(
    discount && discount.discountType === 'PERCENTAGE' ? String(discount.value / 100) : '',
  );
  const [fixedPaise, setFixedPaise] = React.useState(
    discount && discount.discountType === 'FIXED' ? discount.value : 0,
  );
  const [buyQuantity, setBuyQuantity] = React.useState(
    discount?.buyQuantity != null ? String(discount.buyQuantity) : '',
  );
  const [getQuantity, setGetQuantity] = React.useState(
    discount?.getQuantity != null ? String(discount.getQuantity) : '',
  );
  const [minPurchasePaise, setMinPurchasePaise] = React.useState(discount?.minPurchasePaise ?? 0);
  const [maxDiscountPaise, setMaxDiscountPaise] = React.useState(discount?.maxDiscountPaise ?? 0);
  const [startDate, setStartDate] = React.useState(toDateInput(discount?.startDate));
  const [endDate, setEndDate] = React.useState(toDateInput(discount?.endDate));
  const [isActive, setIsActive] = React.useState(discount?.isActive ?? true);
  const [usageLimit, setUsageLimit] = React.useState(discount?.usageLimit != null ? String(discount.usageLimit) : '');
  const [submitted, setSubmitted] = React.useState(false);

  const utils = trpc.useUtils();
  const onSuccess = (result: unknown) => {
    void utils.retail.listDiscounts.invalidate();
    onSaved?.(result);
  };
  const createMutation = trpc.retail.createDiscount.useMutation({ onSuccess });
  const updateMutation = trpc.retail.updateDiscount.useMutation({ onSuccess });
  const saving = createMutation.isPending || updateMutation.isPending;
  const serverError = createMutation.error ?? updateMutation.error;

  const isBuyXGetY = discountType === 'BUY_X_GET_Y';
  const buyNum = parseIntField(buyQuantity);
  const getNum = parseIntField(getQuantity);
  const usageNum = parseIntField(usageLimit);

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Name is required.';
  if (discountType === 'PERCENTAGE') {
    const p = Number(percent);
    if (!percent.trim() || !Number.isFinite(p) || p <= 0 || p > 100) errors.value = 'Enter a percentage between 0 and 100.';
  }
  if (discountType === 'FIXED' && fixedPaise <= 0) errors.value = 'Enter an amount greater than zero.';
  if (isBuyXGetY) {
    if (buyNum === null || buyNum < 1) errors.buyQuantity = 'Buy quantity must be a whole number of 1 or more.';
    if (getNum === null || getNum < 1) errors.getQuantity = 'Get quantity must be a whole number of 1 or more.';
  }
  if (usageLimit.trim() && (usageNum === null || usageNum < 1)) {
    errors.usageLimit = 'Usage limit must be a whole number of 1 or more.';
  }
  if (!startDate) errors.startDate = 'Start date is required.';
  if (!endDate) errors.endDate = 'End date is required.';
  if (startDate && endDate && endDate < startDate) errors.endDate = 'End date must be on or after the start date.';
  const hasErrors = Object.keys(errors).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (hasErrors || saving) return;

    const value =
      discountType === 'PERCENTAGE'
        ? Math.round(Number(percent) * 100)
        : discountType === 'FIXED'
          ? fixedPaise
          : 1; // BUY_X_GET_Y: the rule uses buy/get quantities; the schema still needs a positive value.

    const payload = {
      name: name.trim(),
      discountType: discountType as RetailDiscountType,
      value,
      buyQuantity: isBuyXGetY ? buyNum ?? undefined : undefined,
      getQuantity: isBuyXGetY ? getNum ?? undefined : undefined,
      minPurchasePaise: minPurchasePaise > 0 ? minPurchasePaise : undefined,
      maxDiscountPaise: maxDiscountPaise > 0 ? maxDiscountPaise : undefined,
      startDate: new Date(`${startDate}T00:00:00`),
      endDate: new Date(`${endDate}T23:59:59`),
      isActive,
      usageLimit: usageNum ?? undefined,
    };

    if (isEdit && discount?.id) {
      updateMutation.mutate({ discountId: discount.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const showError = (key: string) => (submitted ? errors[key] : undefined);

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField label="Name" required error={showError('name')} htmlFor="discount-name">
        <input
          id="discount-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </FormField>

      <FormField label="Discount type" required htmlFor="discount-type">
        <select
          id="discount-type"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as DiscountTypeValue)}
          className={inputClass}
        >
          {DISCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </FormField>

      {discountType === 'PERCENTAGE' && (
        <FormField label="Percent off" required error={showError('value')} htmlFor="discount-percent">
          <input
            id="discount-percent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className={inputClass}
          />
        </FormField>
      )}

      {discountType === 'FIXED' && (
        <FormField label="Amount off" required error={showError('value')}>
          <MoneyInput value={fixedPaise} onChange={setFixedPaise} />
        </FormField>
      )}

      {isBuyXGetY && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Buy quantity (X)" required error={showError('buyQuantity')} htmlFor="discount-buy-qty">
            <input
              id="discount-buy-qty"
              type="number"
              min={1}
              step={1}
              value={buyQuantity}
              onChange={(e) => setBuyQuantity(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Get quantity (Y)" required error={showError('getQuantity')} htmlFor="discount-get-qty">
            <input
              id="discount-get-qty"
              type="number"
              min={1}
              step={1}
              value={getQuantity}
              onChange={(e) => setGetQuantity(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <p className="text-xs text-muted-foreground" style={{ gridColumn: '1 / -1' }}>
            Buy X, get the Y cheapest qualifying units free.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Minimum purchase (optional)">
          <MoneyInput value={minPurchasePaise} onChange={setMinPurchasePaise} />
        </FormField>
        <FormField label="Max discount (optional)" description="Leave at 0 for no cap.">
          <MoneyInput value={maxDiscountPaise} onChange={setMaxDiscountPaise} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Start date" required error={showError('startDate')} htmlFor="discount-start">
          <input id="discount-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </FormField>
        <FormField label="End date" required error={showError('endDate')} htmlFor="discount-end">
          <input id="discount-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </FormField>
      </div>

      <FormField label="Usage limit (optional)" error={showError('usageLimit')} htmlFor="discount-usage">
        <input
          id="discount-usage"
          type="number"
          min={1}
          step={1}
          value={usageLimit}
          onChange={(e) => setUsageLimit(e.target.value)}
          className={inputClass}
        />
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>

      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorText(serverError)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create discount'}
        </button>
      </div>
    </form>
  );
}
