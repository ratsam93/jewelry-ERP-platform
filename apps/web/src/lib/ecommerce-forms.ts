// Form/filter helpers for the e-commerce admin pages. They mirror the Zod
// schemas in packages/shared-types/src/ecommerce.ts (SalesChannelInputSchema,
// OnlineOrderListFilterSchema, OrderStatusUpdateSchema).

export { formatServerError } from './manufacturing-forms';

export const CHANNEL_TYPES = ['WEBSITE', 'SHOPIFY', 'AMAZON', 'FLIPKART', 'INSTAGRAM', 'CUSTOM'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export interface ChannelFormValues {
  name: string;
  channelType: string;
  storeUrl: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
  isActive: boolean;
}

export const EMPTY_CHANNEL_FORM: ChannelFormValues = {
  name: '',
  channelType: 'WEBSITE',
  storeUrl: '',
  apiKey: '',
  apiSecret: '',
  webhookSecret: '',
  isActive: true,
};

const MAX_TEXT = 255;
const MAX_SECRET = 500;

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Builds the payload for `ecommerce.createChannel`, or the `data` of
 * `ecommerce.updateChannel`. Blank optional fields are dropped, so on edit a
 * blank credential means "keep the stored value".
 */
export function buildChannelInput(form: ChannelFormValues): {
  input: Record<string, unknown> | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const storeUrl = form.storeUrl.trim();

  if (!name) errors.name = 'Channel name is required';
  else if (name.length > MAX_TEXT) errors.name = `Must be at most ${MAX_TEXT} characters`;

  if (!(CHANNEL_TYPES as readonly string[]).includes(form.channelType)) {
    errors.channelType = 'Choose a channel type';
  }
  if (storeUrl) {
    if (!isHttpUrl(storeUrl)) errors.storeUrl = 'Enter a full URL, e.g. https://shop.example.com';
    else if (storeUrl.length > 500) errors.storeUrl = 'Must be at most 500 characters';
  }

  const input: Record<string, unknown> = {
    name,
    channelType: form.channelType,
    isActive: form.isActive,
  };
  if (storeUrl) input.storeUrl = storeUrl;
  for (const key of ['apiKey', 'apiSecret', 'webhookSecret'] as const) {
    const v = form[key].trim();
    if (v.length > MAX_SECRET) errors[key] = `Must be at most ${MAX_SECRET} characters`;
    if (v) input[key] = v;
  }
  return Object.keys(errors).length ? { input: null, errors } : { input, errors };
}

// ─── Orders ─────────────────────────────────────────────────────

export const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED',
] as const;

export interface OrderFilterValues {
  search: string;
  status: string;
  dateFrom: string; // yyyy-mm-dd
  dateTo: string; // yyyy-mm-dd
}

export const EMPTY_ORDER_FILTERS: OrderFilterValues = { search: '', status: '', dateFrom: '', dateTo: '' };

/** `filters` for ecommerce.listOrders. The API extends a date-only `dateTo` to the end of that day. */
export function buildOrderFilters(f: OrderFilterValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const search = f.search.trim();
  if (search) out.search = search;
  if ((ORDER_STATUSES as readonly string[]).includes(f.status)) out.status = f.status;
  if (f.dateFrom) out.dateFrom = f.dateFrom;
  if (f.dateTo) out.dateTo = f.dateTo;
  return out;
}

export function orderDateRangeError(f: OrderFilterValues): string | null {
  if (f.dateFrom && f.dateTo && f.dateFrom > f.dateTo) return 'The from date must be on or before the to date';
  return null;
}

/**
 * UI shortcuts for the next step in the fulfilment flow. The API
 * (EcommerceService.updateOrderStatus) accepts any status and only requires a
 * reason for CANCELLED, so this is a convenience ladder, not a server rule.
 */
const NEXT_STEP: Record<string, string> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PROCESSING',
  PROCESSING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};
const CANCELLABLE = new Set(['PENDING', 'CONFIRMED', 'PROCESSING']);
const REFUNDABLE = new Set(['DELIVERED', 'RETURNED']);

export interface OrderAction {
  kind: 'status' | 'cancel' | 'refund';
  status: string;
  label: string;
  confirm: string;
}

export function orderActionsFor(status: string): OrderAction[] {
  const actions: OrderAction[] = [];
  const next = NEXT_STEP[status];
  if (next) {
    actions.push({
      kind: 'status', status: next, label: `Mark ${next.toLowerCase()}`,
      confirm: `Change this order from ${status} to ${next}?`,
    });
  }
  if (status === 'DELIVERED') {
    actions.push({
      kind: 'status', status: 'RETURNED', label: 'Mark returned',
      confirm: 'Mark this delivered order as RETURNED?',
    });
  }
  if (REFUNDABLE.has(status)) {
    actions.push({ kind: 'refund', status: 'REFUNDED', label: 'Refund order', confirm: 'Mark this order as REFUNDED?' });
  }
  if (CANCELLABLE.has(status)) {
    actions.push({ kind: 'cancel', status: 'CANCELLED', label: 'Cancel order', confirm: 'Cancel this order?' });
  }
  return actions;
}

/** Price breakdown lines shown under the items; zero/absent amounts are skipped (total is shown separately). */
export function orderAmountLines(o: Record<string, unknown>): Array<{ label: string; paise: number; negative?: boolean }> {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const lines: Array<{ label: string; paise: number; negative?: boolean }> = [];
  if (n(o.subtotalPaise) > 0) lines.push({ label: 'Subtotal', paise: n(o.subtotalPaise) });
  if (n(o.discountPaise) > 0) lines.push({ label: 'Discount', paise: n(o.discountPaise), negative: true });
  if (n(o.shippingPaise) > 0) lines.push({ label: 'Shipping', paise: n(o.shippingPaise) });
  if (n(o.taxPaise) > 0) lines.push({ label: 'Tax', paise: n(o.taxPaise) });
  return lines;
}

// ─── Reviews ────────────────────────────────────────────────────

export type ReviewTab = 'all' | 'pending' | 'published';

/** Reviews only have an isPublished flag (the API has no "rejected" state). */
export function reviewFiltersFor(tab: ReviewTab): Record<string, unknown> {
  if (tab === 'published') return { isPublished: true };
  if (tab === 'pending') return { isPublished: false };
  return {};
}

// ─── Dashboard ──────────────────────────────────────────────────

export interface DashboardKpis {
  activeChannels: number;
  mtdOrders: number;
  mtdRevenuePaise: number;
  pendingShipments: number;
}

/** Maps ecommerce.getDashboard (EcommerceDashboardResponse) onto the KPI cards. */
export function dashboardKpis(d: Record<string, unknown> | undefined): DashboardKpis {
  const x = d ?? {};
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const breakdown = Array.isArray(x.channelBreakdown) ? x.channelBreakdown.length : 0;
  return {
    activeChannels: x.activeChannels !== undefined ? num(x.activeChannels) : breakdown,
    mtdOrders: num(x.mtdOrders),
    mtdRevenuePaise: x.mtdRevenuePaise !== undefined ? num(x.mtdRevenuePaise) : num(x.onlineRevenuePaise),
    pendingShipments: num(x.pendingShipments),
  };
}

// ─── Payments ────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on delivery',
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  razorpay: 'Razorpay',
  stripe: 'Stripe',
  paypal: 'PayPal',
  payu: 'PayU',
  cashfree: 'Cashfree',
};

/** Human label for an online payment method code ("cod" -> "Cash on delivery"). */
export function paymentMethodLabel(method: unknown): string {
  const m = String(method ?? '').trim();
  if (!m) return '-';
  return METHOD_LABELS[m.toLowerCase()] ?? m.replace(/_/g, ' ');
}

const PAYMENT_STATUS: Record<string, string> = {
  INITIATED: 'Pending',
  AUTHORIZED: 'Authorized',
  CAPTURED: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

/** Status label for a payment; an initiated COD payment is "Pending (collect on delivery)". */
export function paymentStatusLabel(method: unknown, status: unknown): string {
  const st = String(status ?? '');
  if (!st) return '-';
  if (st === 'INITIATED' && String(method ?? '').toLowerCase() === 'cod') return 'Pending (COD)';
  return PAYMENT_STATUS[st] ?? st;
}

export interface OrderPaymentRow {
  id: string;
  method: string;
  status: string;
  amountPaise: number;
}

/** Rows for the order-detail Payment card, from the order's payments array. */
export function orderPaymentRows(o: Record<string, unknown>): OrderPaymentRow[] {
  const list = Array.isArray(o.payments) ? (o.payments as Array<Record<string, unknown>>) : [];
  return list.map((p, i) => ({
    id: String(p.id ?? i),
    method: paymentMethodLabel(p.method),
    status: paymentStatusLabel(p.method, p.status),
    amountPaise: Number(p.amountPaise ?? 0) || 0,
  }));
}
