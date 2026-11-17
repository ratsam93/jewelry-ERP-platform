// POS sale helpers: money normalisation, totals, payload building and
// human-readable server errors. Pure functions (unit-tested), integer paise only.

import { computeLineTax } from '../features/retail/posTax';

/**
 * The API serialises BigInt money/weights as decimal strings. Convert any
 * string/number/bigint to a safe integer; null/garbage becomes 0.
 */
export function toInt(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Always 2 decimals, en-IN grouping, e.g. 11973660 -> ₹1,19,736.60 */
export function formatPaise(value: unknown): string {
  return `₹${(toInt(value) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface PosCartLine {
  productId?: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  metalWeightMg: number;
  metalRatePaise: number;
  makingChargesPaise: number;
  wastageChargesPaise: number;
  discountPaise: number;
  hsnCode: string;
  gstRate: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lineTotalPaise: number;
}

/** Recompute a line's GST (on the line total, half-up in paise) and total. */
export function withLineTax<T extends PosCartLine>(line: T, quantity = line.quantity): T {
  const tax = computeLineTax({ ...line, quantity });
  return {
    ...line,
    quantity,
    cgstPaise: tax.cgstPaise,
    sgstPaise: tax.sgstPaise,
    igstPaise: tax.igstPaise,
    lineTotalPaise: tax.lineTotalPaise,
  };
}

export interface PosTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

/** Mirrors RetailPricingService.calculateTotal: round to the nearest rupee. */
export function computePosTotals(lines: PosCartLine[], cartDiscountPaise = 0): PosTotals {
  const subtotalPaise = lines.reduce((s, l) => s + l.unitPricePaise * l.quantity - l.discountPaise, 0);
  const taxPaise = lines.reduce((s, l) => s + l.cgstPaise + l.sgstPaise + l.igstPaise, 0);
  const beforeRoundOff = subtotalPaise - cartDiscountPaise + taxPaise;
  const totalPaise = Math.round(beforeRoundOff / 100) * 100;
  return {
    subtotalPaise,
    discountPaise: cartDiscountPaise,
    taxPaise,
    roundOffPaise: totalPaise - beforeRoundOff,
    totalPaise,
  };
}

export interface PosSalePayload {
  customerId?: string;
  locationId: string;
  lineItems: Array<{
    productId?: string;
    description: string;
    quantity: number;
    unitPricePaise: number;
    discountPaise: number;
    metalRatePaise: number;
    metalWeightMg: number;
    makingChargesPaise: number;
    wastageChargesPaise: number;
    hsnCode: string;
    gstRate: number;
  }>;
  payments: Array<{ method: string; amountPaise: number; reference?: string }>;
  discountPaise: number;
  notes?: string;
  currencyCode: 'INR';
}

/** Build the retail.createSale input; every money/weight field is an integer number. */
export function buildSalePayload(args: {
  customerId?: string | null;
  locationId: string;
  lines: PosCartLine[];
  payments: Array<{ method: string; amountPaise: unknown; reference?: string }>;
  cartDiscountPaise?: number;
  notes?: string;
}): PosSalePayload {
  return {
    customerId: args.customerId || undefined,
    locationId: args.locationId,
    lineItems: args.lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      quantity: toInt(l.quantity),
      unitPricePaise: toInt(l.unitPricePaise),
      discountPaise: toInt(l.discountPaise),
      metalRatePaise: toInt(l.metalRatePaise),
      metalWeightMg: toInt(l.metalWeightMg),
      makingChargesPaise: toInt(l.makingChargesPaise),
      wastageChargesPaise: toInt(l.wastageChargesPaise),
      hsnCode: l.hsnCode,
      gstRate: toInt(l.gstRate),
    })),
    payments: args.payments.map((p) => ({
      method: p.method,
      amountPaise: toInt(p.amountPaise),
      reference: p.reference,
    })),
    discountPaise: toInt(args.cartDiscountPaise ?? 0),
    notes: args.notes,
    currencyCode: 'INR',
  };
}

const FIELD_LABELS: Record<string, string> = {
  unitPricePaise: 'unit price',
  discountPaise: 'discount',
  makingChargesPaise: 'making charges',
  wastageChargesPaise: 'wastage charges',
  metalRatePaise: 'metal rate',
  metalWeightMg: 'weight',
  amountPaise: 'amount',
  quantity: 'quantity',
  customerId: 'customer',
  locationId: 'store / location',
  description: 'description',
  gstRate: 'GST rate',
  lineItems: 'cart',
  payments: 'payments',
};

interface ZodIssueLike {
  path?: Array<string | number>;
  message?: string;
}

/**
 * Turn a tRPC error message into something a cashier can read. Server input
 * validation errors arrive as a JSON array of zod issues; flatten them.
 */
export function humanizeServerError(message: string | undefined | null, fallback = 'Something went wrong. Please try again.'): string {
  const raw = (message ?? '').trim();
  if (!raw) return fallback;
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const issues = (Array.isArray(parsed) ? parsed : [parsed]) as ZodIssueLike[];
      const lines = issues
        .map((issue) => {
          const path = issue.path ?? [];
          const field = path.length ? String(path[path.length - 1]) : '';
          const label = FIELD_LABELS[field] ?? field;
          let where = '';
          if (path[0] === 'lineItems' && typeof path[1] === 'number') where = `Item ${path[1] + 1}`;
          else if (path[0] === 'payments' && typeof path[1] === 'number') where = `Payment ${path[1] + 1}`;
          const subject = [where, label].filter(Boolean).join(' ');
          const msg = (issue.message ?? 'is invalid').replace(/^Invalid input: /, '');
          return subject ? `${subject}: ${msg}` : msg;
        })
        .filter(Boolean);
      const unique = Array.from(new Set(lines));
      if (unique.length === 0) return fallback;
      const shown = unique.slice(0, 3).join('; ');
      return `Could not complete the sale. ${shown}${unique.length > 3 ? ` (+${unique.length - 3} more)` : ''}`;
    } catch {
      return fallback;
    }
  }
  return raw;
}
