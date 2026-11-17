// Pure helpers for the wholesale forms (purchase orders, consignments, agents,
// supplier edit). Money is integer paise, weights are integer mg; every
// conversion is done on the decimal string so no float rounding can creep in.

export type FieldErrors = Record<string, string>;
export interface BuildResult<T> {
  input: T | null;
  errors: FieldErrors;
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: string): boolean => GUID_RE.test(v);

/** "12.5" with scale 2 -> 1250. Returns null for blank / malformed / too many decimals. */
export function parseScaled(text: string, scale: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d+)(?:\.(\d*))?$/.exec(t);
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > scale) return null;
  const n = Number(m[1]) * 10 ** scale + Number(frac.padEnd(scale, '0') || '0');
  return Number.isSafeInteger(n) ? n : null;
}

export const rupeesToPaise = (text: string): number | null => parseScaled(text, 2);
export const gramsToMg = (text: string): number | null => parseScaled(text, 3);

export function parseIntStrict(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

export function formatPaiseText(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** quantity x unit price in integer paise. */
export const lineTotalPaise = (quantity: number, unitPricePaise: number): number =>
  quantity * unitPricePaise;

// ─── Server error text ───────────────────────────────────────────

/**
 * tRPC wraps Zod failures as a JSON array string in `message`
 * (e.g. '[{"path":["supplierId"],"message":"Invalid GUID"}]').
 * Turn that into readable lines; pass ordinary messages through.
 */
export function readableError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = (err as { message?: unknown } | null | undefined)?.message;
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message) return fallback;
  if (message.startsWith('[') || message.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(message);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const lines = list
        .map((i) => {
          const issue = i as { path?: unknown[]; message?: string };
          if (!issue || typeof issue.message !== 'string') return null;
          const where = Array.isArray(issue.path) && issue.path.length ? issue.path.join(' > ') : '';
          return where ? `${where}: ${issue.message}` : issue.message;
        })
        .filter((l): l is string => Boolean(l));
      if (lines.length) return lines.join('; ');
    } catch {
      /* fall through */
    }
  }
  return message;
}

// ─── Purchase order ──────────────────────────────────────────────

export interface POLineValues {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string; // rupees
  weightG: string;
  purityFineness: string;
}

export interface POFormValues {
  supplierId: string;
  locationId: string;
  expectedDate: string;
  notes: string;
  lines: POLineValues[];
}

export const emptyPOLine = (key: string): POLineValues => ({
  key, productId: '', description: '', quantity: '1', unitPrice: '', weightG: '', purityFineness: '916',
});

export interface POItemPayload {
  productId?: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  weightMg?: number;
  purityFineness?: number;
}

export interface POPayload {
  supplierId: string;
  locationId: string;
  items: POItemPayload[];
  currencyCode: 'INR';
  expectedDate?: string;
  notes?: string;
}

/** Per-line total for display; null when qty/price are not valid yet. */
export function poLineTotals(lines: POLineValues[]): { totals: Array<number | null>; subtotalPaise: number } {
  let subtotalPaise = 0;
  const totals = lines.map((l) => {
    const q = parseIntStrict(l.quantity);
    const p = rupeesToPaise(l.unitPrice);
    if (q === null || q < 1 || p === null) return null;
    const t = lineTotalPaise(q, p);
    subtotalPaise += t;
    return t;
  });
  return { totals, subtotalPaise };
}

/**
 * What still blocks "Create Purchase Order", in plain words (HK-WHL-03).
 * Empty list = the button is enabled.
 */
export function poMissingRequirements(form: POFormValues): string[] {
  const missing: string[] = [];
  if (!form.supplierId) missing.push('a supplier');
  if (!form.locationId) missing.push('a delivery location');
  if (form.lines.length === 0) missing.push('at least one line item');
  else if (form.lines.some((l) => !l.description.trim())) {
    missing.push(form.lines.length === 1 ? 'a line item description' : 'a description for every line item');
  }
  return missing;
}

/** Mirrors PurchaseOrderInputSchema (shared-types/wholesale.ts). */
export function buildPurchaseOrderInput(form: POFormValues): BuildResult<POPayload> {
  const errors: FieldErrors = {};
  if (!isGuid(form.supplierId)) errors.supplierId = 'Select a supplier';
  if (!isGuid(form.locationId)) errors.locationId = 'Select a delivery location';
  if (form.lines.length === 0) errors.lines = 'Add at least one line item';

  const items: POItemPayload[] = [];
  form.lines.forEach((l, i) => {
    const desc = l.description.trim();
    const q = parseIntStrict(l.quantity);
    const price = rupeesToPaise(l.unitPrice);
    if (!desc) errors[`line${i}.description`] = 'Description is required';
    else if (desc.length > 500) errors[`line${i}.description`] = 'Must be at most 500 characters';
    if (q === null || q < 1) errors[`line${i}.quantity`] = 'Quantity must be a whole number of 1 or more';
    if (price === null) errors[`line${i}.unitPrice`] = 'Enter a unit price in rupees (max 2 decimals)';
    const item: POItemPayload = { description: desc, quantity: q ?? 0, unitPricePaise: price ?? 0 };
    if (l.productId) {
      if (isGuid(l.productId)) item.productId = l.productId;
      else errors[`line${i}.productId`] = 'Invalid product';
    }
    if (l.weightG.trim()) {
      const mg = gramsToMg(l.weightG);
      if (mg === null) errors[`line${i}.weightG`] = 'Weight in grams (max 3 decimals)';
      else item.weightMg = mg;
    }
    if (l.purityFineness.trim()) {
      const f = parseIntStrict(l.purityFineness);
      if (f === null || f > 999) errors[`line${i}.purityFineness`] = 'Purity must be 0-999';
      else item.purityFineness = f;
    }
    items.push(item);
  });

  if (Object.keys(errors).length) return { input: null, errors };
  const input: POPayload = {
    supplierId: form.supplierId,
    locationId: form.locationId,
    items,
    currencyCode: 'INR',
  };
  if (form.expectedDate) input.expectedDate = form.expectedDate;
  if (form.notes.trim()) input.notes = form.notes.trim();
  return { input, errors };
}

// ─── Consignments (in / out) ─────────────────────────────────────

export interface ConsignmentLineValues {
  key: string;
  productId: string;
  quantity: string;
  weightG: string;
  value: string; // rupees
}

export interface ConsignmentFormValues {
  partyId: string; // supplierId (in) or customerId (out)
  locationId: string;
  dueDate: string;
  notes: string;
  lines: ConsignmentLineValues[];
}

export const emptyConsignmentLine = (key: string): ConsignmentLineValues => ({
  key, productId: '', quantity: '1', weightG: '', value: '',
});

export interface ConsignmentPayload {
  supplierId?: string;
  customerId?: string;
  locationId: string;
  items: Array<{ productId: string; quantity: number; weightMg: number; valuePaise: number }>;
  dueDate?: string;
  notes?: string;
}

export function consignmentTotals(lines: ConsignmentLineValues[]): { weightMg: number; valuePaise: number } {
  let weightMg = 0;
  let valuePaise = 0;
  for (const l of lines) {
    weightMg += gramsToMg(l.weightG) ?? 0;
    valuePaise += rupeesToPaise(l.value) ?? 0;
  }
  return { weightMg, valuePaise };
}

/** Mirrors ConsignmentInInputSchema / ConsignmentOutInputSchema. */
export function buildConsignmentInput(
  direction: 'in' | 'out',
  form: ConsignmentFormValues,
): BuildResult<ConsignmentPayload> {
  const errors: FieldErrors = {};
  if (!isGuid(form.partyId)) errors.partyId = direction === 'in' ? 'Select a supplier' : 'Select a customer';
  if (!isGuid(form.locationId)) errors.locationId = 'Select a location';
  if (form.lines.length === 0) errors.lines = 'Add at least one line';

  const items: ConsignmentPayload['items'] = [];
  form.lines.forEach((l, i) => {
    const q = parseIntStrict(l.quantity);
    const mg = gramsToMg(l.weightG);
    const value = rupeesToPaise(l.value);
    if (!isGuid(l.productId)) errors[`line${i}.productId`] = 'Select a product';
    if (q === null || q < 1) errors[`line${i}.quantity`] = 'Quantity must be a whole number of 1 or more';
    if (mg === null) errors[`line${i}.weightG`] = 'Weight in grams (max 3 decimals)';
    if (value === null) errors[`line${i}.value`] = 'Value in rupees (max 2 decimals)';
    items.push({ productId: l.productId, quantity: q ?? 0, weightMg: mg ?? 0, valuePaise: value ?? 0 });
  });

  if (Object.keys(errors).length) return { input: null, errors };
  const input: ConsignmentPayload = { locationId: form.locationId, items };
  if (direction === 'in') input.supplierId = form.partyId;
  else input.customerId = form.partyId;
  if (form.dueDate) input.dueDate = form.dueDate;
  if (form.notes.trim()) input.notes = form.notes.trim();
  return { input, errors };
}

// ─── Agent / broker ──────────────────────────────────────────────

export type CommissionType = 'PERCENTAGE' | 'FIXED_PER_PIECE' | 'FIXED_PER_WEIGHT';

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  PERCENTAGE: 'Percentage of value',
  FIXED_PER_PIECE: 'Fixed per piece (Rs)',
  FIXED_PER_WEIGHT: 'Fixed per gram (Rs)',
};

export interface AgentFormValues {
  name: string;
  phone: string;
  email: string;
  commissionType: CommissionType;
  commissionRate: string; // % for PERCENTAGE, rupees otherwise
  bankAccountNumber: string;
  ifscCode: string;
  panNumber: string;
  isActive: boolean;
}

export interface AgentPayload {
  name: string;
  phone?: string;
  email?: string;
  commissionType: CommissionType;
  commissionRate: number;
  isActive: boolean;
  bankAccountNumber?: string;
  ifscCode?: string;
  panNumber?: string;
}

/**
 * commissionRate is an int. Server (wholesale.agent.service.ts:143) treats
 * PERCENTAGE as percent*100 (250 = 2.5%) and fixed types as paise.
 */
/** Display text for a stored commissionRate. */
export function formatCommissionRate(type: unknown, rate: unknown): string {
  const n = Number(rate);
  if (rate === null || rate === undefined || Number.isNaN(n)) return '-';
  if (type === 'PERCENTAGE') return `${(n / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
  const unit = type === 'FIXED_PER_WEIGHT' ? ' per g' : ' per piece';
  return `${formatPaiseText(n)}${unit}`;
}

const AGENT_MAX = { name: 255, phone: 20, bankAccountNumber: 30, ifscCode: 11, panNumber: 10 } as const;

/** Mirrors AgentBrokerInputSchema. */
export function buildAgentInput(form: AgentFormValues): BuildResult<AgentPayload> {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Name is required';
  for (const k of Object.keys(AGENT_MAX) as Array<keyof typeof AGENT_MAX>) {
    if (form[k].trim().length > AGENT_MAX[k]) errors[k] = `Must be at most ${AGENT_MAX[k]} characters`;
  }
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
  const rate = parseScaled(form.commissionRate, 2);
  if (rate === null) {
    errors.commissionRate =
      form.commissionType === 'PERCENTAGE' ? 'Enter a percentage like 2.5' : 'Enter an amount in rupees';
  } else if (form.commissionType === 'PERCENTAGE' && rate > 10000) {
    errors.commissionRate = 'Percentage cannot exceed 100';
  }
  if (Object.keys(errors).length) return { input: null, errors };
  const input: AgentPayload = {
    name,
    commissionType: form.commissionType,
    commissionRate: rate as number,
    isActive: form.isActive,
  };
  if (form.phone.trim()) input.phone = form.phone.trim();
  if (email) input.email = email;
  if (form.bankAccountNumber.trim()) input.bankAccountNumber = form.bankAccountNumber.trim();
  if (form.ifscCode.trim()) input.ifscCode = form.ifscCode.trim().toUpperCase();
  if (form.panNumber.trim()) input.panNumber = form.panNumber.trim().toUpperCase();
  return { input, errors };
}

// ─── Display normalisers (API response shapes) ───────────────────

type Rec = Record<string, unknown>;
const nameOf = (v: unknown): string | undefined =>
  v && typeof v === 'object' && typeof (v as Rec).name === 'string' ? ((v as Rec).name as string) : undefined;

/** PurchaseOrderResponse carries supplierName/locationName/expectedDate flat (shared-types). */
export function poHeaderView(po: Rec): { supplier: string; location: string; expectedDate: unknown } {
  return {
    supplier: (po.supplierName as string | undefined) ?? nameOf(po.supplier) ?? '-',
    location: (po.locationName as string | undefined) ?? nameOf(po.location) ?? '-',
    expectedDate: po.expectedDate ?? po.expectedDeliveryDate ?? null,
  };
}

export function consignmentPartyName(c: Rec, kind: 'supplier' | 'customer'): string {
  if (kind === 'supplier') return (c.supplierName as string | undefined) ?? nameOf(c.supplier) ?? '-';
  const flat = c.customerName as string | undefined;
  if (flat && flat.trim()) return flat.trim();
  const cu = c.customer as { firstName?: string; lastName?: string } | undefined;
  const joined = cu ? `${cu.firstName ?? ''} ${cu.lastName ?? ''}`.trim() : '';
  return joined || '-';
}

// ─── Supplier field formats (mirror SupplierInputSchema, HK-WHL-01) ───

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const GENERIC_POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Inline errors for the optional supplier identity / contact fields. Blank = fine.
 * GSTIN and PAN are checked after trim + upper-casing (they are stored upper-case).
 */
export function validateSupplierFormats(v: {
  gstinNumber?: string;
  panNumber?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const gstin = (v.gstinNumber ?? '').trim().toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) errors.gstinNumber = 'Enter a valid 15 character GSTIN (e.g. 27ABCDE1234F1Z5)';
  const pan = (v.panNumber ?? '').trim().toUpperCase();
  if (pan && !PAN_RE.test(pan)) errors.panNumber = 'Enter a valid 10 character PAN (e.g. ABCDE1234F)';
  const postal = (v.postalCode ?? '').trim();
  if (postal) {
    const country = (v.country ?? '').trim().toUpperCase();
    if (country === '' || country === 'IN') {
      if (!PINCODE_RE.test(postal)) errors.postalCode = 'Pincode must be 6 digits (e.g. 400001)';
    } else if (!GENERIC_POSTAL_RE.test(postal)) {
      errors.postalCode = 'Enter a valid postal code';
    }
  }
  const phone = (v.phone ?? '').trim();
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (!/^\+?[0-9][0-9 ().-]*$/.test(phone) || digits < 7 || digits > 15) {
      errors.phone = 'Enter a valid phone number (7 to 15 digits, e.g. +91 98765 43210)';
    }
  }
  const email = (v.email ?? '').trim();
  if (email && !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  return errors;
}

// ─── Supplier edit (updateSupplier: { id, data: partialUpdate(SupplierInputSchema) }) ───

/** Fields that changed vs. the loaded record; blank clears are omitted (schema has no nulls). */
export function diffSupplierUpdate(
  original: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (k === 'isActive') continue;
    const before = original[k] ?? undefined;
    if (v !== before) data[k] = v;
  }
  return data;
}

/**
 * PO line amount shown on the detail page: always quantity x unit price (ex-tax).
 * `mismatch` is true when the stored totalPaise disagrees (legacy/demo rows whose
 * line total was seeded from the PO subtotal instead of qty x unit).
 */
export function poLineView(item: Rec): { amountPaise: number; storedPaise: number | null; mismatch: boolean } {
  const qty = Number(item.quantity ?? 0);
  const unit = Number(item.unitPricePaise ?? 0);
  const amountPaise = lineTotalPaise(qty, unit);
  const stored = item.totalPaise === null || item.totalPaise === undefined ? null : Number(item.totalPaise);
  return { amountPaise, storedPaise: stored, mismatch: stored !== null && stored !== amountPaise };
}
