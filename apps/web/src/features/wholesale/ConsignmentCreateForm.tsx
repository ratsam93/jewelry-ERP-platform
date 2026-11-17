'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import {
  buildConsignmentInput,
  consignmentTotals,
  emptyConsignmentLine,
  formatPaiseText,
  type ConsignmentFormValues,
  type ConsignmentLineValues,
  type ConsignmentPayload,
  type FieldErrors,
} from '@/lib/wholesale-form';
import type { PickOption } from './PurchaseOrderForm';

interface Props {
  direction: 'in' | 'out';
  parties: PickOption[];
  locations: PickOption[];
  products: PickOption[];
  submitting?: boolean;
  error?: string | null;
  cancelHref: string;
  onSubmit: (payload: ConsignmentPayload) => void;
}

let seq = 1;
const nextKey = () => `c${seq++}`;

export function ConsignmentCreateForm({ direction, parties, locations, products, submitting, error, cancelHref, onSubmit }: Props) {
  const partyLabel = direction === 'in' ? 'Supplier' : 'Customer';
  const [form, setForm] = useState<ConsignmentFormValues>(() => ({
    partyId: '', locationId: '', dueDate: '', notes: '', lines: [emptyConsignmentLine(nextKey())],
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const setLine = (key: string, patch: Partial<ConsignmentLineValues>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const totals = consignmentTotals(form.lines);
  const cls = 'mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm';
  const err = (k: string) => (errors[k] ? <span className="block text-xs text-red-600">{errors[k]}</span> : null);

  const handle = (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildConsignmentInput(direction, form);
    setErrors(errs);
    if (input) onSubmit(input);
  };

  return (
    <form onSubmit={handle} noValidate className="max-w-4xl space-y-4 rounded-lg border p-5">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{partyLabel} *</span>
          <select aria-label={partyLabel} className={cls} value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
            <option value="">Select {partyLabel.toLowerCase()}...</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {err('partyId')}
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Location *</span>
          <select aria-label="Location" className={cls} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
            <option value="">Select location...</option>
            {locations.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {err('locationId')}
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Due date</span>
          <input type="date" aria-label="Due date" className={cls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Notes</span>
          <input type="text" aria-label="Notes" className={cls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Lines</span>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyConsignmentLine(nextKey())] }))}>
            <Plus className="h-3 w-3" /> Add line
          </button>
        </div>
        {err('lines')}
        {form.lines.map((l, i) => (
          <div key={l.key} className="grid grid-cols-2 items-start gap-2 rounded-md border p-3 lg:grid-cols-[2fr_0.7fr_1fr_1fr_auto]">
            <label className="text-xs text-muted-foreground">Product
              <select aria-label={`Product ${i + 1}`} className={cls} value={l.productId} onChange={(e) => setLine(l.key, { productId: e.target.value })}>
                <option value="">Select product...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {err(`line${i}.productId`)}
            </label>
            <label className="text-xs text-muted-foreground">Qty
              <input inputMode="numeric" aria-label={`Quantity ${i + 1}`} className={cls} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
              {err(`line${i}.quantity`)}
            </label>
            <label className="text-xs text-muted-foreground">Weight (g)
              <input inputMode="decimal" aria-label={`Weight ${i + 1}`} className={cls} value={l.weightG} onChange={(e) => setLine(l.key, { weightG: e.target.value })} />
              {err(`line${i}.weightG`)}
            </label>
            <label className="text-xs text-muted-foreground">Value (Rs)
              <input inputMode="decimal" aria-label={`Value ${i + 1}`} className={cls} value={l.value} onChange={(e) => setLine(l.key, { value: e.target.value })} />
              {err(`line${i}.value`)}
            </label>
            <button type="button" aria-label={`Remove line ${i + 1}`} disabled={form.lines.length === 1}
              onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((x) => x.key !== l.key) }))}
              className="mt-5 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-40">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <p className="text-right text-sm text-muted-foreground">
        Total weight {(totals.weightMg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} g, total value{' '}
        <span className="font-semibold text-foreground">{formatPaiseText(totals.valuePaise)}</span>
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {submitting ? 'Saving...' : direction === 'in' ? 'Record consignment' : 'Create consignment'}
        </button>
        <Link href={cancelHref} className="text-sm text-muted-foreground hover:underline">Cancel</Link>
      </div>
    </form>
  );
}
