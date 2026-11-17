'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  buildPurchaseOrderInput,
  emptyPOLine,
  formatPaiseText,
  poLineTotals,
  poMissingRequirements,
  type FieldErrors,
  type POFormValues,
  type POLineValues,
  type POPayload,
} from '@/lib/wholesale-form';

export interface PickOption {
  id: string;
  label: string;
}

export interface PurchaseOrderFormProps {
  suppliers?: PickOption[];
  locations?: PickOption[];
  products?: PickOption[];
  submitting?: boolean;
  /** Readable server error to show above the actions. */
  error?: string | null;
  onSubmit: (data: POPayload) => void;
  onCancel: () => void;
}

let lineSeq = 1;
const nextKey = () => `l${lineSeq++}`;

export function PurchaseOrderForm({
  suppliers = [],
  locations = [],
  products = [],
  submitting = false,
  error = null,
  onSubmit,
  onCancel,
}: PurchaseOrderFormProps) {
  const [form, setForm] = useState<POFormValues>(() => ({
    supplierId: '',
    locationId: '',
    expectedDate: '',
    notes: '',
    lines: [emptyPOLine(nextKey())],
  }));
  const [errors, setErrors] = useState<FieldErrors>({});

  const setLine = (key: string, patch: Partial<POLineValues>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const { totals, subtotalPaise } = poLineTotals(form.lines);
  const inputCls = 'mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm';
  const err = (k: string) =>
    errors[k] ? <span className="block text-xs text-red-600">{errors[k]}</span> : null;

  const missing = poMissingRequirements(form);

  const submit = () => {
    const { input, errors: errs } = buildPurchaseOrderInput(form);
    setErrors(errs);
    if (input) onSubmit(input);
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Purchase Order</h3>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="po-supplier">Supplier *</label>
          <select
            id="po-supplier"
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            className={inputCls}
          >
            <option value="">Select supplier...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          {err('supplierId')}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="po-location">Delivery Location *</label>
          <select
            id="po-location"
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            className={inputCls}
          >
            <option value="">Select location...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {err('locationId')}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="po-date">Expected Delivery Date</label>
          <input
            id="po-date"
            type="date"
            value={form.expectedDate}
            onChange={(e) => setForm({ ...form, expectedDate: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="po-notes">Notes</label>
          <input
            id="po-notes"
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional notes..."
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Line Items</span>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyPOLine(nextKey())] }))}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add Item
          </button>
        </div>
        {err('lines')}

        {form.lines.map((l, idx) => (
          <div key={l.key} className="grid grid-cols-2 items-start gap-2 rounded-md border p-3 lg:grid-cols-[1.4fr_2fr_0.6fr_1fr_1fr_0.8fr_1fr_auto]">
            <label className="text-xs text-muted-foreground">
              Product
              <select
                value={l.productId}
                aria-label={`Product ${idx + 1}`}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setLine(l.key, {
                    productId: e.target.value,
                    description: p && !l.description.trim() ? p.label : l.description,
                  });
                }}
                className={inputCls}
              >
                <option value="">Custom item</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Description
              <input
                type="text"
                aria-label={`Description ${idx + 1}`}
                value={l.description}
                onChange={(e) => setLine(l.key, { description: e.target.value })}
                placeholder="Item description"
                className={inputCls}
              />
              {err(`line${idx}.description`)}
            </label>
            <label className="text-xs text-muted-foreground">
              Qty
              <input
                inputMode="numeric"
                aria-label={`Quantity ${idx + 1}`}
                value={l.quantity}
                onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                className={inputCls}
              />
              {err(`line${idx}.quantity`)}
            </label>
            <label className="text-xs text-muted-foreground">
              Unit Price (Rs)
              <input
                inputMode="decimal"
                aria-label={`Unit price ${idx + 1}`}
                value={l.unitPrice}
                onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                placeholder="0.00"
                className={inputCls}
              />
              {err(`line${idx}.unitPrice`)}
            </label>
            <label className="text-xs text-muted-foreground">
              Weight (g)
              <input
                inputMode="decimal"
                aria-label={`Weight ${idx + 1}`}
                value={l.weightG}
                onChange={(e) => setLine(l.key, { weightG: e.target.value })}
                className={inputCls}
              />
              {err(`line${idx}.weightG`)}
            </label>
            <label className="text-xs text-muted-foreground">
              Purity
              <select
                aria-label={`Purity ${idx + 1}`}
                value={l.purityFineness}
                onChange={(e) => setLine(l.key, { purityFineness: e.target.value })}
                className={inputCls}
              >
                <option value="">n/a</option>
                <option value="999">24K (999)</option>
                <option value="916">22K (916)</option>
                <option value="750">18K (750)</option>
                <option value="585">14K (585)</option>
              </select>
            </label>
            <div className="text-xs text-muted-foreground">
              Line total
              <p className="mt-1 flex h-9 items-center text-sm font-semibold text-foreground">
                {totals[idx] === null ? '-' : formatPaiseText(totals[idx] as number)}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove item ${idx + 1}`}
              onClick={() => setForm((f) => (f.lines.length > 1 ? { ...f, lines: f.lines.filter((x) => x.key !== l.key) } : f))}
              disabled={form.lines.length === 1}
              className="mt-5 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end border-t pt-4">
        <div className="space-y-1 text-right text-sm">
          <p className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatPaiseText(subtotalPaise)}</span></p>
          <p className="text-muted-foreground">Tax: <span className="font-medium text-foreground">{formatPaiseText(0)}</span> <span className="text-xs">(none applied by the server)</span></p>
          <p className="text-lg font-bold">Total: {formatPaiseText(subtotalPaise)}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {missing.length > 0 && (
        <p id="po-missing-hint" role="status" className="text-right text-xs text-muted-foreground">
          To create this purchase order, add {missing.join(', ')}.
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || missing.length > 0}
          aria-describedby={missing.length > 0 ? 'po-missing-hint' : undefined}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create Purchase Order'}
        </button>
      </div>
    </div>
  );
}
