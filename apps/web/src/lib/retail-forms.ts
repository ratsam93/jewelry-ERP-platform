// Pure form helpers for the retail create flows (repair, custom order, return,
// gift card). Mirror the Zod inputs in packages/shared-types/src/retail.ts.

export type FormErrors<K extends string = string> = Partial<Record<K, string>>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: unknown): v is string => typeof v === 'string' && GUID.test(v);

export type ParsedAmount = { paise: number | null; error: string | null };

/**
 * Parse a rupee amount typed by a user (up to 2 decimals) into integer paise.
 * Blank -> { paise: null, error: null } (caller decides if required).
 * Negative, zero (when !allowZero), non-numeric and >2 decimal inputs are rejected.
 */
export function parseRupees(raw: string, opts: { allowZero?: boolean; label?: string } = {}): ParsedAmount {
  const label = opts.label ?? 'Amount';
  const s = raw.trim().replace(/,/g, '');
  if (!s) return { paise: null, error: null };
  if (/^-/.test(s)) return { paise: null, error: `${label} cannot be negative.` };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return {
      paise: null,
      error: /\.\d{3,}/.test(s) ? `${label} can have at most 2 decimal places.` : `${label} must be a number.`,
    };
  }
  const [rupees, frac = ''] = s.split('.');
  const paise = Number(rupees) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) return { paise: null, error: `${label} is too large.` };
  if (paise === 0 && !opts.allowZero) return { paise: null, error: `${label} must be greater than zero.` };
  return { paise, error: null };
}

/** Parse grams (up to 3 decimals) into integer milligrams. */
export function parseGramsToMg(raw: string, label = 'Weight'): { mg: number | null; error: string | null } {
  const s = raw.trim();
  if (!s) return { mg: null, error: null };
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    return { mg: null, error: `${label} must be a positive number (up to 3 decimals).` };
  }
  const [g, frac = ''] = s.split('.');
  const mg = Number(g) * 1000 + Number(frac.padEnd(3, '0'));
  return mg > 0 ? { mg, error: null } : { mg: null, error: `${label} must be greater than zero.` };
}

function parseDate(raw: string, label: string, minToday: boolean): { value?: Date; error?: string } {
  if (!raw) return {};
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { error: `${label} is not a valid date.` };
  if (minToday) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d.getTime() < today.getTime()) return { error: `${label} cannot be in the past.` };
  }
  return { value: d };
}

// ─── Repair order ─────────────────────────────────────────────────

export interface RepairFormValues {
  customerId: string;
  locationId: string;
  itemDescription: string;
  weightGrams: string;
  diagnosticNotes: string;
  estimate: string;
  promisedDate: string;
}

export function buildRepairInput(f: RepairFormValues): {
  input: Record<string, unknown> | null;
  errors: FormErrors<keyof RepairFormValues>;
} {
  const errors: FormErrors<keyof RepairFormValues> = {};
  const input: Record<string, unknown> = {};
  if (!isGuid(f.customerId)) errors.customerId = 'Select a customer.';
  else input.customerId = f.customerId;
  if (!isGuid(f.locationId)) errors.locationId = 'Select a store / location.';
  else input.locationId = f.locationId;
  const desc = f.itemDescription.trim();
  if (!desc) errors.itemDescription = 'Describe the item being repaired.';
  else if (desc.length > 500) errors.itemDescription = 'Must be at most 500 characters.';
  else input.itemDescription = desc;
  const w = parseGramsToMg(f.weightGrams, 'Weight');
  if (w.error) errors.weightGrams = w.error;
  else if (w.mg !== null) input.itemWeightMg = w.mg;
  const notes = f.diagnosticNotes.trim();
  if (notes) input.diagnosticNotes = notes;
  const est = parseRupees(f.estimate, { label: 'Estimate', allowZero: true });
  if (est.error) errors.estimate = est.error;
  else if (est.paise !== null) input.estimatePaise = est.paise;
  const d = parseDate(f.promisedDate, 'Promised date', true);
  if (d.error) errors.promisedDate = d.error;
  else if (d.value) input.promisedDate = d.value;
  return Object.keys(errors).length ? { input: null, errors } : { input, errors };
}

// ─── Custom order ─────────────────────────────────────────────────

export interface CustomOrderFormValues {
  customerId: string;
  locationId: string;
  description: string;
  designNotes: string;
  estimate: string;
  expectedDate: string;
  targetWeightGrams: string;
  metalPurity: string;
}

export function buildCustomOrderInput(f: CustomOrderFormValues): {
  input: Record<string, unknown> | null;
  errors: FormErrors<keyof CustomOrderFormValues>;
} {
  const errors: FormErrors<keyof CustomOrderFormValues> = {};
  const input: Record<string, unknown> = {};
  if (!isGuid(f.customerId)) errors.customerId = 'Select a customer.';
  else input.customerId = f.customerId;
  if (!isGuid(f.locationId)) errors.locationId = 'Select a store / location.';
  else input.locationId = f.locationId;
  const desc = f.description.trim();
  if (!desc) errors.description = 'Describe the piece to be made.';
  else input.description = desc;
  const notes = f.designNotes.trim();
  if (notes) input.designNotes = notes;
  const est = parseRupees(f.estimate, { label: 'Estimate', allowZero: true });
  if (est.error) errors.estimate = est.error;
  else if (est.paise !== null) input.estimatePaise = est.paise;
  const d = parseDate(f.expectedDate, 'Expected date', true);
  if (d.error) errors.expectedDate = d.error;
  else if (d.value) input.expectedDate = d.value;
  const w = parseGramsToMg(f.targetWeightGrams, 'Target weight');
  if (w.error) errors.targetWeightGrams = w.error;
  else if (w.mg !== null) input.targetWeightMg = w.mg;
  const purity = f.metalPurity.trim();
  if (purity) {
    if (!/^\d{1,4}$/.test(purity) || Number(purity) <= 0) {
      errors.metalPurity = 'Purity must be a positive whole number (e.g. 916).';
    } else input.metalPurity = Number(purity);
  }
  return Object.keys(errors).length ? { input: null, errors } : { input, errors };
}

// ─── Sale return ──────────────────────────────────────────────────

export interface ReturnSourceLine {
  id: string;
  productId?: string | null;
  quantity: number;
  /** Per-unit price including tax (lineTotalPaise / quantity, rounded). */
  unitRefundPaise: number;
}

export interface ReturnLineSelection {
  quantity: number;
  reason: string;
}

/** Per-unit refund for a sold line (matches the API's original-per-unit rule). */
export function unitRefundPaise(lineTotalPaise: unknown, quantity: number): number {
  const total = Number(lineTotalPaise);
  if (!Number.isFinite(total) || quantity <= 0) return 0;
  return Math.round(total / quantity);
}

/**
 * Per-unit breakdown of a sold line for the return form: the ex-tax unit price
 * (after line discount), the GST per unit and the refund per unit (what the
 * customer paid per piece including GST = lineTotal / quantity).
 */
export function returnUnitBreakdown(line: {
  quantity: number;
  unitPricePaise?: unknown;
  discountPaise?: unknown;
  lineTotalPaise: unknown;
}): { exTaxUnitPaise: number; gstPerUnitPaise: number; refundPerUnitPaise: number } {
  const refundPerUnitPaise = unitRefundPaise(line.lineTotalPaise, line.quantity);
  const qty = line.quantity > 0 ? line.quantity : 1;
  const unit = Number(line.unitPricePaise);
  const discount = Number(line.discountPaise ?? 0);
  const exTaxUnitPaise = Number.isFinite(unit)
    ? Math.round((unit * qty - (Number.isFinite(discount) ? discount : 0)) / qty)
    : refundPerUnitPaise;
  return { exTaxUnitPaise, gstPerUnitPaise: Math.max(0, refundPerUnitPaise - exTaxUnitPaise), refundPerUnitPaise };
}

export function buildReturnInput(args: {
  originalSaleId: string;
  locationId: string;
  customerId?: string | null;
  reason: string;
  refundMethod: string;
  lines: ReturnSourceLine[];
  selection: Record<string, ReturnLineSelection | undefined>;
}): { input: Record<string, unknown> | null; errors: string[]; refundPaise: number } {
  const errors: string[] = [];
  const items: Array<Record<string, unknown>> = [];
  let refundPaise = 0;
  for (const line of args.lines) {
    const sel = args.selection[line.id];
    if (!sel || sel.quantity <= 0) continue;
    if (!Number.isInteger(sel.quantity) || sel.quantity > line.quantity) {
      errors.push(`Return quantity must be between 1 and ${line.quantity}.`);
      continue;
    }
    items.push({
      originalLineItemId: line.id,
      productId: isGuid(line.productId) ? line.productId : undefined,
      quantity: sel.quantity,
      returnPricePaise: line.unitRefundPaise,
      reason: sel.reason.trim() || undefined,
    });
    refundPaise += line.unitRefundPaise * sel.quantity;
  }
  if (items.length === 0 && errors.length === 0) errors.push('Select at least one item to return.');
  if (!args.reason.trim()) errors.push('Enter a reason for the return.');
  if (!isGuid(args.originalSaleId) || !isGuid(args.locationId)) errors.push('Sale or location is missing.');
  if (errors.length) return { input: null, errors, refundPaise };
  return {
    input: {
      originalSaleId: args.originalSaleId,
      locationId: args.locationId,
      customerId: isGuid(args.customerId) ? args.customerId : undefined,
      reason: args.reason.trim(),
      refundMethod: args.refundMethod || undefined,
      items,
    },
    errors,
    refundPaise,
  };
}
