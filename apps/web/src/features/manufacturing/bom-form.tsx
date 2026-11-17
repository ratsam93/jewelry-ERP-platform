'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  METAL_TYPES,
  PURITY_OPTIONS,
  buildBomInput,
  computeBomEstimate,
  emptyBomForm,
  emptyMetalLine,
  emptyStoneLine,
  type BomFormValues,
  type BomPayload,
  type FormErrors,
} from '@/lib/manufacturing-forms';
import { formatPaise } from '@/components/format';

export interface BomFormProduct {
  id: string;
  name?: string;
  sku?: string;
}

interface BomFormProps {
  products: BomFormProduct[];
  onProductSearch?: (text: string) => void;
  onSubmit: (input: BomPayload) => void;
  isSubmitting?: boolean;
  serverError?: string | null;
  initial?: BomFormValues;
}

const field = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const cell = 'w-full rounded border bg-background px-2 py-1 text-sm';

function Err({ msg }: { msg?: string }) {
  return msg ? <p role="alert" className="mt-1 text-xs text-destructive">{msg}</p> : null;
}

export function BomForm({ products, onProductSearch, onSubmit, isSubmitting, serverError, initial }: BomFormProps) {
  const [form, setForm] = React.useState<BomFormValues>(initial ?? emptyBomForm());
  const [errors, setErrors] = React.useState<FormErrors>({});
  const estimate = computeBomEstimate(form);

  const set = <K extends keyof BomFormValues>(key: K, value: BomFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setMetal = (i: number, patch: Partial<BomFormValues['metals'][number]>) =>
    setForm((f) => ({
      ...f,
      metals: f.metals.map((m, idx) => {
        if (idx !== i) return m;
        const next = { ...m, ...patch };
        if (patch.metalType && !PURITY_OPTIONS[patch.metalType].includes(next.purity)) {
          next.purity = PURITY_OPTIONS[patch.metalType][0]!;
        }
        return next;
      }),
    }));
  const setStone = (i: number, patch: Partial<BomFormValues['stones'][number]>) =>
    setForm((f) => ({ ...f, stones: f.stones.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = buildBomInput(form);
    setErrors(result.errors);
    if (result.input) onSubmit(result.input);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-4xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="bom-name" className="text-sm font-medium">BOM name *</label>
          <input id="bom-name" className={field} value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Err msg={errors.name} />
        </div>
        <div className="space-y-1">
          <label htmlFor="bom-product" className="text-sm font-medium">Product *</label>
          {onProductSearch && (
            <input
              type="text"
              aria-label="Search products"
              placeholder="Search products..."
              className={field}
              onChange={(e) => onProductSearch(e.target.value)}
            />
          )}
          <select id="bom-product" className={field} value={form.productId} onChange={(e) => set('productId', e.target.value)}>
            <option value="">Select a product...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? p.sku ?? p.id}</option>
            ))}
          </select>
          <Err msg={errors.productId} />
        </div>
        <div className="space-y-1">
          <label htmlFor="bom-output" className="text-sm font-medium">Output quantity</label>
          <input id="bom-output" inputMode="numeric" className={field} value={form.outputQuantity} onChange={(e) => set('outputQuantity', e.target.value)} />
          <Err msg={errors.outputQuantity} />
        </div>
        <div className="space-y-1">
          <label htmlFor="bom-time" className="text-sm font-medium">Estimated time (minutes)</label>
          <input id="bom-time" inputMode="numeric" className={field} value={form.estimatedTimeMins} onChange={(e) => set('estimatedTimeMins', e.target.value)} />
          <Err msg={errors.estimatedTimeMins} />
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Metal</h2>
        {form.metals.map((m, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
            <div>
              <label className="text-xs text-muted-foreground">Metal type</label>
              <select aria-label={`Metal ${i + 1} type`} className={cell} value={m.metalType} onChange={(e) => setMetal(i, { metalType: e.target.value as typeof m.metalType })}>
                {METAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Purity</label>
              <select aria-label={`Metal ${i + 1} purity`} className={cell} value={m.purity} onChange={(e) => setMetal(i, { purity: e.target.value })}>
                {PURITY_OPTIONS[m.metalType].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Weight (g)</label>
              <input aria-label={`Metal ${i + 1} weight (g)`} inputMode="decimal" className={cell} value={m.weightG} onChange={(e) => setMetal(i, { weightG: e.target.value })} />
              <Err msg={errors[`metals.${i}.weightG`]} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rate per gram (Rs)</label>
              <input aria-label={`Metal ${i + 1} rate per gram`} inputMode="decimal" className={cell} value={m.ratePerGram} onChange={(e) => setMetal(i, { ratePerGram: e.target.value })} />
              <Err msg={errors[`metals.${i}.ratePerGram`]} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Wastage %</label>
              <input aria-label={`Metal ${i + 1} wastage %`} inputMode="decimal" className={cell} value={m.wastagePct} onChange={(e) => setMetal(i, { wastagePct: e.target.value })} />
              <Err msg={errors[`metals.${i}.wastagePct`]} />
            </div>
            <button type="button" aria-label={`Remove metal ${i + 1}`} className="self-end rounded p-2 text-muted-foreground hover:text-destructive" onClick={() => setForm((f) => ({ ...f, metals: f.metals.filter((_, idx) => idx !== i) }))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:text-primary" onClick={() => setForm((f) => ({ ...f, metals: [...f.metals, emptyMetalLine()] }))}>
          <Plus className="h-4 w-4" /> Add metal
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Stones</h2>
        {form.stones.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div>
              <label className="text-xs text-muted-foreground">Stone</label>
              <input aria-label={`Stone ${i + 1} name`} className={cell} value={s.name} onChange={(e) => setStone(i, { name: e.target.value })} />
              <Err msg={errors[`stones.${i}.name`]} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pieces</label>
              <input aria-label={`Stone ${i + 1} pieces`} inputMode="numeric" className={cell} value={s.pieces} onChange={(e) => setStone(i, { pieces: e.target.value })} />
              <Err msg={errors[`stones.${i}.pieces`]} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Weight (g)</label>
              <input aria-label={`Stone ${i + 1} weight (g)`} inputMode="decimal" className={cell} value={s.weightG} onChange={(e) => setStone(i, { weightG: e.target.value })} />
              <Err msg={errors[`stones.${i}.weightG`]} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cost per piece (Rs)</label>
              <input aria-label={`Stone ${i + 1} cost per piece`} inputMode="decimal" className={cell} value={s.costPerPiece} onChange={(e) => setStone(i, { costPerPiece: e.target.value })} />
              <Err msg={errors[`stones.${i}.costPerPiece`]} />
            </div>
            <button type="button" aria-label={`Remove stone ${i + 1}`} className="self-end rounded p-2 text-muted-foreground hover:text-destructive" onClick={() => setForm((f) => ({ ...f, stones: f.stones.filter((_, idx) => idx !== i) }))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:text-primary" onClick={() => setForm((f) => ({ ...f, stones: [...f.stones, emptyStoneLine()] }))}>
          <Plus className="h-4 w-4" /> Add stone
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="bom-making" className="text-sm font-medium">Making charge (Rs)</label>
          <input id="bom-making" inputMode="decimal" className={field} value={form.makingCharge} onChange={(e) => set('makingCharge', e.target.value)} />
          <Err msg={errors.makingCharge} />
        </div>
        <div className="space-y-1">
          <label htmlFor="bom-labour" className="text-sm font-medium">Labour (Rs)</label>
          <input id="bom-labour" inputMode="decimal" className={field} value={form.labour} onChange={(e) => set('labour', e.target.value)} />
          <Err msg={errors.labour} />
        </div>
      </section>

      <div className="space-y-1">
        <label htmlFor="bom-notes" className="text-sm font-medium">Notes</label>
        <textarea id="bom-notes" rows={2} className={field} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      <div className="rounded-md border bg-muted/30 p-4 text-sm" data-testid="bom-estimate">
        <div className="flex justify-between"><span>Metal (incl. wastage)</span><span>{formatPaise(estimate.metalPaise)}</span></div>
        <div className="flex justify-between"><span>Stones</span><span>{formatPaise(estimate.stonePaise)}</span></div>
        <div className="flex justify-between"><span>Making charge</span><span>{formatPaise(estimate.makingPaise)}</span></div>
        <div className="flex justify-between"><span>Labour</span><span>{formatPaise(estimate.labourPaise)}</span></div>
        <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Estimated cost</span><span>{formatPaise(estimate.totalPaise)}</span></div>
      </div>

      <Err msg={errors.items} />
      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}

      <button type="submit" disabled={isSubmitting} className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {isSubmitting ? 'Saving...' : 'Create BOM'}
      </button>
    </form>
  );
}
