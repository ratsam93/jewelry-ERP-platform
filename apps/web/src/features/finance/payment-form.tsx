'use client';

import * as React from 'react';
import { buildPaymentInput, rupeesToPaise, type PaymentTypeValue } from '@/lib/finance-forms';

interface PartyOption {
  id: string;
  label?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface PaymentInvoiceOption {
  id: string;
  invoiceNumber: string;
  totalPaise: number;
  paidPaise: number;
  customerId?: string | null;
  supplierId?: string | null;
}

export interface PaymentFormSubmit {
  paymentType: string;
  method: string;
  amountPaise: number;
  currencyCode: string;
  customerId?: string;
  supplierId?: string;
  invoiceId?: string;
  reference?: string;
}

interface PaymentFormProps {
  paymentType: PaymentTypeValue;
  customers?: PartyOption[];
  suppliers?: PartyOption[];
  invoices?: PaymentInvoiceOption[];
  onSubmit: (data: PaymentFormSubmit) => void;
  isLoading?: boolean;
  serverError?: string | null;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'ONLINE', label: 'Online' },
] as const;

function partyLabel(p: PartyOption): string {
  if (p.label) return p.label;
  const n = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return n || p.name || p.id;
}

const inputCls = 'mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function rupees(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentForm({
  paymentType,
  customers,
  suppliers,
  invoices,
  onSubmit,
  isLoading,
  serverError,
}: PaymentFormProps) {
  const [method, setMethod] = React.useState('CASH');
  const [amount, setAmount] = React.useState('');
  const [customerId, setCustomerId] = React.useState('');
  const [supplierId, setSupplierId] = React.useState('');
  const [invoiceId, setInvoiceId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const isReceived = paymentType === 'RECEIVED';
  const partyId = isReceived ? customerId : supplierId;

  // Only invoices of the chosen party can be linked.
  const linkable = (invoices ?? []).filter((i) =>
    partyId ? (isReceived ? i.customerId === partyId : i.supplierId === partyId) : false,
  );
  const selectedInvoice = linkable.find((i) => i.id === invoiceId);
  const outstandingPaise = selectedInvoice ? selectedInvoice.totalPaise - selectedInvoice.paidPaise : 0;

  const clear = (k: string) =>
    setErrors((p) => {
      if (!(k in p)) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildPaymentInput(
      { paymentType, method, amount, customerId, supplierId, invoiceId, reference },
      selectedInvoice ? { outstandingPaise } : null,
    );
    setErrors(errs);
    if (!input) return;
    onSubmit(input as unknown as PaymentFormSubmit);
  };

  const amountPaise = rupeesToPaise(amount);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isReceived ? (
          <div>
            <label htmlFor="pay-party" className="block text-sm font-medium text-foreground">Customer *</label>
            <select
              id="pay-party"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setInvoiceId('');
                clear('customerId');
              }}
              aria-invalid={errors.customerId ? true : undefined}
              className={inputCls}
            >
              <option value="">Select customer</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>{partyLabel(c)}</option>
              ))}
            </select>
            {errors.customerId && <p role="alert" className="mt-1 text-xs text-red-600">{errors.customerId}</p>}
          </div>
        ) : (
          <div>
            <label htmlFor="pay-party" className="block text-sm font-medium text-foreground">Supplier *</label>
            <select
              id="pay-party"
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setInvoiceId('');
                clear('supplierId');
              }}
              aria-invalid={errors.supplierId ? true : undefined}
              className={inputCls}
            >
              <option value="">Select supplier</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>{partyLabel(s)}</option>
              ))}
            </select>
            {errors.supplierId && <p role="alert" className="mt-1 text-xs text-red-600">{errors.supplierId}</p>}
          </div>
        )}

        <div>
          <label htmlFor="pay-method" className="block text-sm font-medium text-foreground">Payment Method</label>
          <select
            id="pay-method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              clear('method');
            }}
            className={inputCls}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {errors.method && <p role="alert" className="mt-1 text-xs text-red-600">{errors.method}</p>}
        </div>

        <div>
          <label htmlFor="pay-invoice" className="block text-sm font-medium text-foreground">Link to document (optional)</label>
          <select
            id="pay-invoice"
            value={invoiceId}
            onChange={(e) => {
              setInvoiceId(e.target.value);
              clear('amount');
            }}
            className={inputCls}
          >
            <option value="">{partyId ? 'No linked document' : 'Select a party first'}</option>
            {linkable.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber} - outstanding {rupees(inv.totalPaise - inv.paidPaise)}
              </option>
            ))}
          </select>
          {selectedInvoice && (
            <p className="mt-1 text-xs text-muted-foreground">
              Outstanding: {rupees(outstandingPaise)}
              {amountPaise !== null && amountPaise > 0 && amountPaise <= outstandingPaise
                ? ` - remaining after this payment: ${rupees(outstandingPaise - amountPaise)}`
                : ''}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="pay-amount" className="block text-sm font-medium text-foreground">Amount</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2 text-sm text-muted-foreground">&#8377;</span>
            <input
              id="pay-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                clear('amount');
              }}
              placeholder="0.00"
              aria-invalid={errors.amount ? true : undefined}
              className="block w-full rounded-md border border-input bg-background py-2 pl-7 pr-3 text-sm"
            />
          </div>
          {errors.amount && <p role="alert" className="mt-1 text-xs text-red-600">{errors.amount}</p>}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="pay-ref" className="block text-sm font-medium text-foreground">Reference</label>
          <input
            id="pay-ref"
            type="text"
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              clear('reference');
            }}
            placeholder="Transaction reference, cheque number, etc."
            className={inputCls}
          />
          {errors.reference && <p role="alert" className="mt-1 text-xs text-red-600">{errors.reference}</p>}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : `Record ${isReceived ? 'Receipt' : 'Payment'}`}
        </button>
      </div>
    </form>
  );
}
