// ─── Finance form helpers (invoices, payments, bank, detail, reports) ───
// Pure functions so they can be unit-tested on the real API shapes.
// Money is integer paise; tRPC serialises BigInt as strings.

// ─── Money ─────────────────────────────────────────────────────

/**
 * Exact rupees -> paise. Accepts "45000", "45,000.50", "0.5"; rejects
 * negatives, more than 2 decimals, exponent notation and junk. No float math.
 */
export function rupeesToPaise(input: string | number): number | null {
  const raw = (typeof input === 'number' ? String(input) : input).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, frac = ''] = raw.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

// ─── States (GST state codes; API expects <= 5 chars) ──────────

export const INDIAN_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AN', name: 'Andaman and Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'DN', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JK', name: 'Jammu and Kashmir' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UK', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
];

/** "Maharashtra" / "maharashtra" / "MH" -> "MH"; unknown -> "". */
export function stateCodeFrom(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  if (!v) return '';
  const hit = INDIAN_STATES.find((s) => s.code.toLowerCase() === v || s.name.toLowerCase() === v);
  return hit?.code ?? '';
}

// ─── Parties / locations ───────────────────────────────────────

export interface Option {
  id: string;
  label: string;
  state?: string;
}

/** "Priya Sharma (+919820000001)" - phone (or email) disambiguates duplicate names. */
export function customerOptionLabel(c: Record<string, unknown>): string {
  const name = [c.firstName, c.lastName].filter((x) => typeof x === 'string' && x).join(' ').trim();
  const extra = (typeof c.phone === 'string' && c.phone) || (typeof c.email === 'string' && c.email) || '';
  const base = name || (typeof c.companyName === 'string' && c.companyName) || 'Unnamed customer';
  return extra ? `${base} (${extra})` : base;
}

export function customerOptions(rows: Array<Record<string, unknown>>): Option[] {
  return rows
    .filter((c) => typeof c.id === 'string')
    .map((c) => ({ id: c.id as string, label: customerOptionLabel(c), state: stateCodeFrom(c.state) }));
}

export function supplierOptions(rows: Array<Record<string, unknown>>): Option[] {
  return rows
    .filter((s) => typeof s.id === 'string')
    .map((s) => ({
      id: s.id as string,
      label: (typeof s.name === 'string' && s.name) || 'Unnamed supplier',
      state: stateCodeFrom(s.state),
    }));
}

// ─── Invoice ───────────────────────────────────────────────────

export type InvoiceTypeValue = 'SALES' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export const INVOICE_TYPES: ReadonlyArray<{ value: InvoiceTypeValue; label: string }> = [
  { value: 'SALES', label: 'Sales Invoice' },
  { value: 'PURCHASE', label: 'Purchase Invoice' },
  { value: 'CREDIT_NOTE', label: 'Credit note' },
  { value: 'DEBIT_NOTE', label: 'Debit note' },
];

/** Sales documents bill a customer; purchase documents bill a supplier. */
export function isCustomerInvoiceType(t: string): boolean {
  return t === 'SALES' || t === 'CREDIT_NOTE';
}

export interface InvoiceLineValues {
  description: string;
  quantity: string;
  /** rupees */
  unitPrice: string;
  /** rupees */
  discount: string;
  hsnCode: string;
  /** percent, e.g. "3" or "1.5" */
  gstPercent: string;
}

export interface InvoiceFormValues {
  invoiceType: InvoiceTypeValue;
  customerId: string;
  supplierId: string;
  locationId: string;
  sourceState: string;
  destState: string;
  dueDate: string;
  notes: string;
  lines: InvoiceLineValues[];
}

export function emptyInvoiceLine(): InvoiceLineValues {
  return { description: '', quantity: '1', unitPrice: '', discount: '', hsnCode: '7113', gstPercent: '3' };
}

/** GST percent text -> rate*100 integer (3 -> 300, 1.5 -> 150); null if invalid. */
export function gstPercentToRate(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const rate = Math.round(Number(t) * 100);
  return rate >= 0 && rate <= 10000 ? rate : null;
}

export function isInterState(sourceState: string, destState: string): boolean {
  return sourceState.trim().toUpperCase() !== destState.trim().toUpperCase();
}

export interface LineTax {
  grossPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/** Same arithmetic as the API (financial.service createInvoice / computeGst). */
export function computeLineTax(
  unitPricePaise: number,
  quantity: number,
  discountPaise: number,
  gstRate: number,
  interState: boolean,
): LineTax {
  const grossPaise = unitPricePaise * quantity;
  const taxablePaise = grossPaise - discountPaise;
  const ratePercent = gstRate / 100;
  if (interState) {
    const igstPaise = Math.round((taxablePaise * ratePercent) / 100);
    return { grossPaise, taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise, totalPaise: taxablePaise + igstPaise };
  }
  const half = ratePercent / 2;
  const cgstPaise = Math.round((taxablePaise * half) / 100);
  const sgstPaise = Math.round((taxablePaise * half) / 100);
  return { grossPaise, taxablePaise, cgstPaise, sgstPaise, igstPaise: 0, totalPaise: taxablePaise + cgstPaise + sgstPaise };
}

export interface InvoiceTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

/** Totals for display; lines that do not parse yet count as zero. */
export function computeInvoiceTotals(
  lines: InvoiceLineValues[],
  sourceState: string,
  destState: string,
): InvoiceTotals {
  const inter = isInterState(sourceState, destState);
  const t: InvoiceTotals = {
    subtotalPaise: 0, discountPaise: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 0,
  };
  for (const l of lines) {
    const price = rupeesToPaise(l.unitPrice) ?? 0;
    const qty = /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity) : 0;
    const disc = l.discount.trim() ? rupeesToPaise(l.discount) ?? 0 : 0;
    const rate = gstPercentToRate(l.gstPercent) ?? 0;
    const r = computeLineTax(price, qty, disc, rate, inter);
    t.subtotalPaise += r.grossPaise;
    t.discountPaise += disc;
    t.taxablePaise += r.taxablePaise;
    t.cgstPaise += r.cgstPaise;
    t.sgstPaise += r.sgstPaise;
    t.igstPaise += r.igstPaise;
    t.totalPaise += r.totalPaise;
  }
  return t;
}

export interface InvoiceFormErrors {
  [key: string]: string;
}

const STATE_RE = /^[A-Za-z]{2,5}$/;

export function buildInvoiceInput(form: InvoiceFormValues): {
  input: Record<string, unknown> | null;
  errors: InvoiceFormErrors;
} {
  const errors: InvoiceFormErrors = {};
  const customerSide = isCustomerInvoiceType(form.invoiceType);

  if (customerSide && !form.customerId) errors.customerId = 'Select a customer';
  if (!customerSide && !form.supplierId) errors.supplierId = 'Select a supplier';
  if (!form.locationId) errors.locationId = 'Select a location';
  if (!STATE_RE.test(form.sourceState.trim())) errors.sourceState = 'Select the state of supply (location)';
  if (!STATE_RE.test(form.destState.trim())) errors.destState = 'Select the place of supply (party state)';
  if (form.dueDate && Number.isNaN(new Date(form.dueDate).getTime())) errors.dueDate = 'Enter a valid due date';

  const lineItems: Array<Record<string, unknown>> = [];
  form.lines.forEach((l, i) => {
    const k = (f: string) => `lines.${i}.${f}`;
    const description = l.description.trim();
    if (!description) errors[k('description')] = 'Description is required';
    else if (description.length > 500) errors[k('description')] = 'Must be at most 500 characters';

    const qtyText = l.quantity.trim();
    const quantity = /^\d+$/.test(qtyText) ? Number(qtyText) : NaN;
    if (!Number.isInteger(quantity) || quantity < 1) errors[k('quantity')] = 'Whole number, at least 1';

    const unitPricePaise = rupeesToPaise(l.unitPrice);
    if (unitPricePaise === null) errors[k('unitPrice')] = l.unitPrice.trim().startsWith('-') ? 'Unit price must be zero or more' : l.unitPrice.trim() ? 'Enter a valid amount (max 2 decimals)' : 'Unit price is required';
    else if (unitPricePaise <= 0) errors[k('unitPrice')] = 'Unit price must be greater than 0';

    let discountPaise = 0;
    if (l.discount.trim()) {
      const d = rupeesToPaise(l.discount);
      if (d === null) errors[k('discount')] = 'Enter a valid amount';
      else discountPaise = d;
    }
    if (unitPricePaise !== null && Number.isInteger(quantity) && discountPaise > unitPricePaise * quantity) {
      errors[k('discount')] = 'Discount cannot exceed the line amount';
    }

    const gstRate = gstPercentToRate(l.gstPercent);
    if (gstRate === null) errors[k('gstPercent')] = 'GST % must be between 0 and 100';

    const hsn = l.hsnCode.trim();
    if (hsn.length > 10) errors[k('hsnCode')] = 'At most 10 characters';

    if (!errors[k('description')] && !errors[k('quantity')] && !errors[k('unitPrice')] && !errors[k('discount')] && !errors[k('gstPercent')] && !errors[k('hsnCode')]) {
      lineItems.push({
        description,
        quantity,
        unitPricePaise,
        discountPaise,
        hsnCode: hsn || '7113',
        gstRate,
      });
    }
  });

  if (form.lines.length === 0) errors.lines = 'Add at least one line item';

  if (Object.keys(errors).length > 0) return { input: null, errors };

  const input: Record<string, unknown> = {
    invoiceType: form.invoiceType,
    locationId: form.locationId,
    sourceState: form.sourceState.trim().toUpperCase(),
    destState: form.destState.trim().toUpperCase(),
    currencyCode: 'INR',
    lineItems,
  };
  if (customerSide) input.customerId = form.customerId;
  else input.supplierId = form.supplierId;
  if (form.dueDate) input.dueDate = form.dueDate;
  if (form.notes.trim()) input.notes = form.notes.trim();
  return { input, errors };
}

/** Readable text for a tRPC/zod/network error. */
export function readableError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof msg !== 'string' || !msg.trim()) return fallback;
  const text = msg.trim();
  // zod issues arrive as a JSON array string
  if (text.startsWith('[')) {
    try {
      const issues = JSON.parse(text) as Array<{ path?: unknown[]; message?: string }>;
      const parts = issues
        .map((i) => `${(i.path ?? []).join('.') || 'input'}: ${i.message ?? 'invalid'}`)
        .slice(0, 5);
      if (parts.length) return parts.join('; ');
    } catch {
      /* fall through */
    }
  }
  return text;
}

// ─── Payment ───────────────────────────────────────────────────

export type PaymentTypeValue = 'RECEIVED' | 'MADE';

export interface PaymentFormValues {
  paymentType: PaymentTypeValue;
  method: string;
  amount: string;
  customerId: string;
  supplierId: string;
  invoiceId: string;
  reference: string;
}

const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];

export function buildPaymentInput(
  form: PaymentFormValues,
  invoice?: { outstandingPaise: number } | null,
): { input: Record<string, unknown> | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const received = form.paymentType === 'RECEIVED';

  if (received && !form.customerId) errors.customerId = 'Select a customer';
  if (!received && !form.supplierId) errors.supplierId = 'Select a supplier';
  if (!PAYMENT_METHODS.includes(form.method)) errors.method = 'Select a payment method';

  const amountText = form.amount.trim();
  const amountPaise = rupeesToPaise(amountText);
  if (!amountText) errors.amount = 'Amount is required';
  else if (amountPaise === null) {
    errors.amount = amountText.startsWith('-')
      ? 'Amount must be positive'
      : 'Enter a valid amount (max 2 decimals)';
  } else if (amountPaise <= 0) errors.amount = 'Amount must be greater than 0';
  else if (invoice && amountPaise > invoice.outstandingPaise) {
    errors.amount = 'Amount exceeds the outstanding balance of the selected invoice';
  }
  if (form.reference.trim().length > 255) errors.reference = 'Must be at most 255 characters';

  if (Object.keys(errors).length > 0) return { input: null, errors };

  const input: Record<string, unknown> = {
    paymentType: form.paymentType,
    method: form.method,
    amountPaise,
    currencyCode: 'INR',
  };
  if (received) input.customerId = form.customerId;
  else input.supplierId = form.supplierId;
  if (form.invoiceId) input.invoiceId = form.invoiceId;
  if (form.reference.trim()) input.reference = form.reference.trim();
  return { input, errors };
}

// ─── Bank account ──────────────────────────────────────────────

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export interface BankFormValues {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  accountType: string;
  /** '' = create a new ledger account automatically */
  ledgerAccountId: string;
  openingBalance: string;
  isDefault: boolean;
}

export const BANK_ACCOUNT_TYPES = ['Current', 'Savings', 'Cash credit', 'Overdraft'] as const;

export function buildBankInput(form: BankFormValues): {
  input: Record<string, unknown> | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const bankName = form.bankName.trim();
  if (!bankName) errors.bankName = 'Bank name is required';
  else if (bankName.length > 255) errors.bankName = 'Must be at most 255 characters';

  const accountNumber = form.accountNumber.trim();
  if (!accountNumber) errors.accountNumber = 'Account number is required';
  else if (!/^[0-9A-Za-z-]{6,30}$/.test(accountNumber)) errors.accountNumber = 'Use 6 to 30 letters, digits or hyphens';

  const ifsc = form.ifscCode.trim().toUpperCase();
  if (!ifsc) errors.ifscCode = 'IFSC code is required';
  else if (!IFSC_RE.test(ifsc)) errors.ifscCode = 'IFSC must be 11 characters: 4 letters, 0, then 6 letters/digits (e.g. HDFC0001234)';

  let openingBalancePaise = 0;
  if (form.openingBalance.trim()) {
    const p = rupeesToPaise(form.openingBalance);
    if (p === null) errors.openingBalance = 'Enter a valid amount (0 or more, max 2 decimals)';
    else openingBalancePaise = p;
  }
  if (form.branchName.trim().length > 255) errors.branchName = 'Must be at most 255 characters';

  if (Object.keys(errors).length > 0) return { input: null, errors };

  const input: Record<string, unknown> = {
    bankName,
    accountNumber,
    ifscCode: ifsc,
    currencyCode: 'INR',
    currentBalancePaise: openingBalancePaise,
    isDefault: form.isDefault,
  };
  if (form.branchName.trim()) input.branchName = form.branchName.trim();
  if (form.ledgerAccountId) input.accountId = form.ledgerAccountId;
  return { input, errors };
}

/** Ledger account code/name for the auto-created account behind a bank account. */
export function bankLedgerAccountDraft(form: Pick<BankFormValues, 'bankName' | 'accountNumber' | 'accountType'>): {
  code: string;
  name: string;
  type: 'ASSET';
} {
  const last4 = form.accountNumber.replace(/[^0-9A-Za-z]/g, '').slice(-4).toUpperCase();
  return {
    code: `BANK-${last4}`.slice(0, 20),
    name: `${form.bankName.trim()} ${form.accountType ? form.accountType + ' ' : ''}A/c ${last4}`.slice(0, 255),
    type: 'ASSET',
  };
}

// ─── Invoice detail: tax / payments view ───────────────────────

export interface InvoiceDetailLike {
  subtotalPaise?: unknown;
  discountPaise?: unknown;
  taxPaise?: unknown;
  totalPaise?: unknown;
  paidPaise?: unknown;
  lineItems?: Array<{
    taxableAmountPaise?: unknown;
    gstRate?: unknown;
    cgstPaise?: unknown;
    sgstPaise?: unknown;
    igstPaise?: unknown;
  }>;
  taxTransactions?: Array<{ taxType?: string; taxAmountPaise?: unknown; taxRate?: unknown }>;
  payments?: Array<{ amountPaise?: unknown; status?: string }>;
  customer?: { state?: unknown } | null;
  supplier?: { state?: unknown } | null;
  location?: { state?: unknown } | null;
}

export interface InvoiceTaxView {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  /** half rate for CGST/SGST, full rate for IGST (percent * 100) */
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  isInterState: boolean;
  /** 'lines' | 'transactions' | 'invoice' (derived from invoice-level tax) */
  source: 'lines' | 'transactions' | 'invoice';
  /** per GST-rate rows (only filled from line data), ascending by rate */
  rateRows?: InvoiceTaxRateRow[];
}

export interface InvoiceTaxRateRow {
  /** full GST rate, percent * 100 (300 = 3%) */
  gstRate: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * Tax breakdown for the detail page. Prefers line amounts, then stored tax
 * transactions, then the invoice-level tax (legacy / imported invoices have no
 * lines or tax rows but a correct taxPaise), split by place of supply.
 */
export function deriveInvoiceTaxView(inv: InvoiceDetailLike): InvoiceTaxView {
  const lines = inv.lineItems ?? [];
  const sumLines = (k: 'cgstPaise' | 'sgstPaise' | 'igstPaise') => lines.reduce((s, l) => s + toNum(l[k]), 0);
  const taxableLines = lines.reduce((s, l) => s + toNum(l.taxableAmountPaise), 0);
  const invoiceTaxable = toNum(inv.subtotalPaise) - toNum(inv.discountPaise);

  let cgst = sumLines('cgstPaise');
  let sgst = sumLines('sgstPaise');
  let igst = sumLines('igstPaise');
  if (cgst + sgst + igst > 0) {
    const inter = igst > 0;
    const byRate = new Map<number, InvoiceTaxRateRow>();
    for (const l of lines) {
      const r = toNum(l.gstRate);
      const row = byRate.get(r) ?? { gstRate: r, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      row.taxablePaise += toNum(l.taxableAmountPaise);
      row.cgstPaise += toNum(l.cgstPaise);
      row.sgstPaise += toNum(l.sgstPaise);
      row.igstPaise += toNum(l.igstPaise);
      byRate.set(r, row);
    }
    const rateRows = [...byRate.values()].filter((r) => r.cgstPaise + r.sgstPaise + r.igstPaise > 0).sort((a, b) => a.gstRate - b.gstRate);
    // Single rate: the nominal half rate. Mixed rates: the effective rate from the amounts, never one line's rate.
    const taxable = taxableLines || invoiceTaxable;
    const eff = (paise: number) => (taxable > 0 ? Math.round((paise / taxable) * 10000) : 0);
    const single = rateRows.length === 1 ? rateRows[0]!.gstRate : 0;
    return {
      taxablePaise: taxable,
      cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
      totalTaxPaise: cgst + sgst + igst,
      cgstRate: inter ? 0 : single ? single / 2 : eff(cgst),
      sgstRate: inter ? 0 : single ? single / 2 : eff(sgst),
      igstRate: inter ? (single || eff(igst)) : 0,
      isInterState: inter,
      source: 'lines',
      rateRows,
    };
  }

  const tx = inv.taxTransactions ?? [];
  const sumTx = (type: string) => tx.filter((t) => t.taxType === type).reduce((s, t) => s + toNum(t.taxAmountPaise), 0);
  const rateTx = (type: string) => toNum(tx.find((t) => t.taxType === type)?.taxRate);
  cgst = sumTx('CGST'); sgst = sumTx('SGST'); igst = sumTx('IGST');
  if (cgst + sgst + igst > 0) {
    return {
      taxablePaise: invoiceTaxable,
      cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst,
      totalTaxPaise: cgst + sgst + igst,
      cgstRate: rateTx('CGST'), sgstRate: rateTx('SGST'), igstRate: rateTx('IGST'),
      isInterState: igst > 0,
      source: 'transactions',
    };
  }

  const tax = toNum(inv.taxPaise);
  const partyState = stateCodeFrom((inv.customer ?? inv.supplier)?.state);
  const locState = stateCodeFrom(inv.location?.state);
  const inter = partyState !== '' && locState !== '' && partyState !== locState;
  const overallRate = invoiceTaxable > 0 ? Math.round((tax / invoiceTaxable) * 10000) : 0; // percent*100
  if (tax <= 0) {
    return {
      taxablePaise: invoiceTaxable, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalTaxPaise: 0,
      cgstRate: 0, sgstRate: 0, igstRate: 0, isInterState: inter, source: 'invoice',
    };
  }
  if (inter) {
    return {
      taxablePaise: invoiceTaxable, cgstPaise: 0, sgstPaise: 0, igstPaise: tax, totalTaxPaise: tax,
      cgstRate: 0, sgstRate: 0, igstRate: overallRate, isInterState: true, source: 'invoice',
    };
  }
  // Same rule as the API GSTR split: SGST = floor(tax/2), CGST = remainder (gets the odd paisa).
  const sgstHalf = Math.floor(tax / 2);
  return {
    taxablePaise: invoiceTaxable, cgstPaise: tax - sgstHalf, sgstPaise: sgstHalf, igstPaise: 0, totalTaxPaise: tax,
    cgstRate: overallRate / 2, sgstRate: overallRate / 2, igstRate: 0, isInterState: false, source: 'invoice',
  };
}

/** Oldest line first: createdAt ascending; ties keep the order received. */
export function sortInvoiceLines<T extends { createdAt?: string | null }>(lines: T[]): T[] {
  return lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const x = a.l.createdAt ? Date.parse(a.l.createdAt) : 0;
      const y = b.l.createdAt ? Date.parse(b.l.createdAt) : 0;
      return x - y || a.i - b.i;
    })
    .map((o) => o.l);
}

export interface PaidView {
  paidPaise: number;
  /** sum of payment rows (completed) */
  recordedPaise: number;
  /** paid amount on the invoice that has no payment row behind it */
  unallocatedPaise: number;
}

export function derivePaidView(inv: InvoiceDetailLike): PaidView {
  const paidPaise = toNum(inv.paidPaise);
  const recordedPaise = (inv.payments ?? [])
    .filter((p) => !p.status || p.status === 'COMPLETED')
    .reduce((s, p) => s + toNum(p.amountPaise), 0);
  return { paidPaise, recordedPaise, unallocatedPaise: Math.max(0, paidPaise - recordedPaise) };
}

// ─── Trial balance range label ─────────────────────────────────

function fmtDay(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

/** "From 01 Nov 2026 to 17 Nov 2026" for the selected yyyy-mm-dd range. */
export function rangeLabel(from: string, to: string): string {
  return `From ${fmtDay(from)} to ${fmtDay(to)}`;
}

/** Inclusive end-of-day Date for a yyyy-mm-dd "to" date (avoids the midnight lte bug). */
export function endOfDayUtc(day: string): Date {
  return new Date(`${day}T23:59:59.999Z`);
}

export function startOfDayUtc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
