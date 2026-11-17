'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  INDIAN_STATES,
  buildInvoiceInput,
  computeInvoiceTotals,
  computeLineTax,
  emptyInvoiceLine,
  gstPercentToRate,
  isCustomerInvoiceType,
  isInterState,
  rupeesToPaise,
  stateCodeFrom,
  type InvoiceFormErrors,
  type InvoiceLineValues,
  type InvoiceTypeValue,
} from '@/lib/finance-forms';

interface PartyOption {
  id: string;
  /** Pre-built label (name + phone); falls back to firstName/lastName or name. */
  label?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  state?: string | null;
}

export interface InvoiceFormSubmit {
  invoiceType: string;
  customerId?: string;
  supplierId?: string;
  locationId: string;
  sourceState: string;
  destState: string;
  dueDate?: string;
  notes?: string;
  currencyCode: string;
  lineItems: Array<Record<string, unknown>>;
}

interface InvoiceFormProps {
  invoiceType: InvoiceTypeValue;
  customers?: PartyOption[];
  suppliers?: PartyOption[];
  products?: Array<{ id: string; sku: string; name: string; sellingPricePaise: bigint | null }>;
  locations: Array<{ id: string; name: string; state?: string | null }>;
  onSubmit: (data: InvoiceFormSubmit) => void;
  isLoading?: boolean;
  /** Readable server error shown above the submit button. */
  serverError?: string | null;
}

function partyLabel(p: PartyOption): string {
  if (p.label) return p.label;
  const n = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return n || p.name || p.id;
}

const inputCls = 'mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

const NEGATIVE_PRICE_MSG = 'Unit price must be zero or more';
const isNegativePrice = (v: string): boolean => v.trim().startsWith('-');

function Err({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-600">
      {msg}
    </p>
  );
}

function formatAmount(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceForm({
  invoiceType,
  customers,
  suppliers,
  products: _products,
  locations,
  onSubmit,
  isLoading,
  serverError,
}: InvoiceFormProps) {
  const [customerId, setCustomerId] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [locationId, setLocationId] = React.useState('');
  const [sourceState, setSourceState] = React.useState('');
  const [destState, setDestState] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<InvoiceLineValues[]>([emptyInvoiceLine()]);
  const [errors, setErrors] = React.useState<InvoiceFormErrors>({});
  const [submitted, setSubmitted] = React.useState(false);

  const customerSide = isCustomerInvoiceType(invoiceType);
  const typeLabel = customerSide ? 'Sales' : 'Purchase';

  // Switching document type clears the party that no longer applies.
  React.useEffect(() => {
    setErrors({});
    setSubmitted(false);
  }, [invoiceType]);

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const onLocationChange = (id: string) => {
    setLocationId(id);
    clearError('locationId');
    const code = stateCodeFrom(locations.find((l) => l.id === id)?.state);
    if (code) {
      setSourceState(code);
      clearError('sourceState');
    }
  };

  const onPartyChange = (id: string, list: PartyOption[] | undefined, kind: 'customerId' | 'supplierId') => {
    if (kind === 'customerId') setCustomerId(id);
    else setSupplierId(id);
    clearError(kind);
    const code = stateCodeFrom(list?.find((p) => p.id === id)?.state);
    if (code) {
      setDestState(code);
      clearError('destState');
    }
  };

  const updateLine = (index: number, field: keyof InvoiceLineValues, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
    clearError(`lines.${index}.${field === 'gstPercent' ? 'gstPercent' : field}`);
  };

  const addLine = () => setLines((prev) => [...prev, emptyInvoiceLine()]);
  const removeLine = (index: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const inter = sourceState && destState ? isInterState(sourceState, destState) : false;
  const totals = computeInvoiceTotals(lines, sourceState || 'XX', destState || 'XX');

  const lineTax = (l: InvoiceLineValues) =>
    computeLineTax(
      rupeesToPaise(l.unitPrice) ?? 0,
      /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity) : 0,
      l.discount.trim() ? rupeesToPaise(l.discount) ?? 0 : 0,
      gstPercentToRate(l.gstPercent) ?? 0,
      inter,
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const { input, errors: errs } = buildInvoiceInput({
      invoiceType,
      customerId,
      supplierId,
      locationId,
      sourceState,
      destState,
      dueDate,
      notes,
      lines,
    });
    setErrors(errs);
    if (!input) return;
    onSubmit(input as unknown as InvoiceFormSubmit);
  };

  const errorCount = Object.keys(errors).length;
  const hasNegativePrice = lines.some((l) => isNegativePrice(l.unitPrice));
  const partyList = customerSide ? customers : suppliers;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="inv-party" className="block text-sm font-medium text-foreground">
            {customerSide ? 'Customer' : 'Supplier'} *
          </label>
          <select
            id="inv-party"
            value={customerSide ? customerId : supplierId}
            onChange={(e) => onPartyChange(e.target.value, partyList, customerSide ? 'customerId' : 'supplierId')}
            aria-invalid={errors[customerSide ? 'customerId' : 'supplierId'] ? true : undefined}
            className={inputCls}
          >
            <option value="">{customerSide ? 'Select customer' : 'Select supplier'}</option>
            {partyList?.map((p) => (
              <option key={p.id} value={p.id}>
                {partyLabel(p)}
              </option>
            ))}
          </select>
          <Err id="inv-party-err" msg={errors[customerSide ? 'customerId' : 'supplierId']} />
        </div>

        <div>
          <label htmlFor="inv-location" className="block text-sm font-medium text-foreground">Location *</label>
          <select
            id="inv-location"
            value={locationId}
            onChange={(e) => onLocationChange(e.target.value)}
            aria-invalid={errors.locationId ? true : undefined}
            className={inputCls}
          >
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <Err id="inv-location-err" msg={errors.locationId} />
        </div>

        <div>
          <label htmlFor="inv-due" className="block text-sm font-medium text-foreground">Due date</label>
          <input
            id="inv-due"
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              clearError('dueDate');
            }}
            className={inputCls}
          />
          <Err id="inv-due-err" msg={errors.dueDate} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="inv-src" className="block text-sm font-medium text-foreground">Supply from (state) *</label>
          <select
            id="inv-src"
            value={sourceState}
            onChange={(e) => {
              setSourceState(e.target.value);
              clearError('sourceState');
            }}
            aria-invalid={errors.sourceState ? true : undefined}
            className={inputCls}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
            ))}
          </select>
          <Err id="inv-src-err" msg={errors.sourceState} />
        </div>
        <div>
          <label htmlFor="inv-dest" className="block text-sm font-medium text-foreground">Place of supply (state) *</label>
          <select
            id="inv-dest"
            value={destState}
            onChange={(e) => {
              setDestState(e.target.value);
              clearError('destState');
            }}
            aria-invalid={errors.destState ? true : undefined}
            className={inputCls}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
            ))}
          </select>
          <Err id="inv-dest-err" msg={errors.destState} />
        </div>
        {sourceState && destState && (
          <p className="text-xs text-muted-foreground md:col-span-2">
            {inter ? 'Inter-state supply: IGST applies.' : 'Intra-state supply: CGST + SGST apply.'}
          </p>
        )}
      </div>

      {/* Line Items */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit Price</th>
              <th className="px-3 py-2 text-right font-medium">Discount</th>
              <th className="px-3 py-2 text-left font-medium">HSN</th>
              <th className="px-3 py-2 text-right font-medium">GST %</th>
              <th className="px-3 py-2 text-right font-medium">Tax</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const tax = lineTax(line);
              const e = (f: string) => errors[`lines.${index}.${f}`];
              return (
                <tr key={index} className="border-b align-top">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      aria-label={`Line ${index + 1} description`}
                      value={line.description}
                      onChange={(ev) => updateLine(index, 'description', ev.target.value)}
                      placeholder="Item description"
                      aria-invalid={e('description') ? true : undefined}
                      className="w-full min-w-[200px] rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                    <Err id={`line-${index}-description-err`} msg={e('description')} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Line ${index + 1} quantity`}
                      value={line.quantity}
                      onChange={(ev) => updateLine(index, 'quantity', ev.target.value)}
                      aria-invalid={e('quantity') ? true : undefined}
                      className="w-16 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                    />
                    <Err id={`line-${index}-quantity-err`} msg={e('quantity')} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} unit price`}
                      value={line.unitPrice}
                      onChange={(ev) => updateLine(index, 'unitPrice', ev.target.value)}
                      placeholder="0.00"
                      aria-invalid={e('unitPrice') || isNegativePrice(line.unitPrice) ? true : undefined}
                      className="w-28 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                    />
                    <Err id={`line-${index}-unitPrice-err`} msg={isNegativePrice(line.unitPrice) ? NEGATIVE_PRICE_MSG : e('unitPrice')} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} discount`}
                      value={line.discount}
                      onChange={(ev) => updateLine(index, 'discount', ev.target.value)}
                      placeholder="0.00"
                      aria-invalid={e('discount') ? true : undefined}
                      className="w-24 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                    />
                    <Err id={`line-${index}-discount-err`} msg={e('discount')} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      aria-label={`Line ${index + 1} HSN`}
                      value={line.hsnCode}
                      onChange={(ev) => updateLine(index, 'hsnCode', ev.target.value)}
                      aria-invalid={e('hsnCode') ? true : undefined}
                      className="w-20 rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                    <Err id={`line-${index}-hsnCode-err`} msg={e('hsnCode')} />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Line ${index + 1} GST percent`}
                      value={line.gstPercent}
                      onChange={(ev) => updateLine(index, 'gstPercent', ev.target.value)}
                      aria-invalid={e('gstPercent') ? true : undefined}
                      className="w-16 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                    />
                    <Err id={`line-${index}-gstPercent-err`} msg={e('gstPercent')} />
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatAmount(tax.cgstPaise + tax.sgstPaise + tax.igstPaise)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatAmount(tax.totalPaise)}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 1}
                      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Err id="inv-lines-err" msg={errors.lines} />

      <button
        type="button"
        onClick={addLine}
        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <Plus className="h-4 w-4" /> Add Line Item
      </button>

      {/* Tax Summary */}
      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>{formatAmount(totals.subtotalPaise)}</span>
          </div>
          {totals.discountPaise > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount:</span>
              <span className="text-destructive">-{formatAmount(totals.discountPaise)}</span>
            </div>
          )}
          {!inter ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CGST:</span>
                <span>{formatAmount(totals.cgstPaise)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SGST:</span>
                <span>{formatAmount(totals.sgstPaise)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">IGST:</span>
              <span>{formatAmount(totals.igstPaise)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Total:</span>
            <span>{formatAmount(totals.totalPaise)}</span>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="inv-notes" className="block text-sm font-medium text-foreground">Notes</label>
        <textarea
          id="inv-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </div>

      {serverError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </p>
      )}
      {submitted && errorCount > 0 && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Please fix the {errorCount} highlighted field{errorCount === 1 ? '' : 's'} above before saving.
        </p>
      )}

      {hasNegativePrice && (
        <p id="inv-save-hint" role="status" className="text-right text-sm text-red-600">
          Cannot save: {NEGATIVE_PRICE_MSG.toLowerCase()} on every line.
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading || hasNegativePrice}
          aria-describedby={hasNegativePrice ? 'inv-save-hint' : undefined}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Creating...' : `Create ${typeLabel} Invoice`}
        </button>
      </div>
    </form>
  );
}
