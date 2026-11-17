/**
 * Pure helpers for the CRM create forms (customer, lead, campaign) and for
 * reading the real shapes returned by crm.customer360 / leadList / leadGet /
 * campaignList / campaignGet. Inputs mirror CustomerCreateInputSchema (api crm
 * module), LeadInputSchema and CampaignInputSchema (shared-types/crm.ts).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * Normalise a phone to E.164. A bare 10-digit Indian mobile (6-9...) becomes
 * +91..., spaces/dashes/brackets are stripped. Returns null when invalid.
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim().replace(/[\s\-()]/g, '');
  if (!s) return null;
  if (/^[6-9]\d{9}$/.test(s)) return `+91${s}`;
  if (/^0[6-9]\d{9}$/.test(s)) return `+91${s.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(s)) return `+${s}`;
  return E164_RE.test(s) ? s : null;
}

type Built = { input: Record<string, unknown> | null; errors: Record<string, string> };

function finish(input: Record<string, unknown>, errors: Record<string, string>): Built {
  return Object.keys(errors).length ? { input: null, errors } : { input, errors };
}

// ─── Customer ─────────────────────────────────────────────────

export interface CustomerFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  alternatePhone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  customerType: string;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  alternatePhone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  customerType: 'RETAIL',
};

export function buildCustomerInput(form: CustomerFormValues): Built {
  const errors: Record<string, string> = {};
  const input: Record<string, unknown> = { customerType: form.customerType || 'RETAIL', country: 'IN' };
  const text = (k: keyof CustomerFormValues, max: number, label: string) => {
    const v = form[k].trim();
    if (v.length > max) errors[k] = `${label} must be at most ${max} characters`;
    return v;
  };
  const first = text('firstName', 100, 'First name');
  const last = text('lastName', 100, 'Last name');
  if (!first) errors.firstName = 'First name is required';
  if (!last) errors.lastName = 'Last name is required';
  input.firstName = first;
  input.lastName = last;

  for (const [key, label] of [['phone', 'Phone'], ['alternatePhone', 'Alternate phone']] as const) {
    if (form[key].trim()) {
      const p = normalizePhone(form[key]);
      if (!p) errors[key] = `${label} must be a valid number, e.g. +919820000001 or a 10-digit mobile`;
      else input[key] = p;
    }
  }
  const email = text('email', 255, 'Email');
  if (email) {
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    else input.email = email;
  }
  for (const [k, max, label] of [
    ['address', 500, 'Address'],
    ['city', 100, 'City'],
    ['state', 100, 'State'],
    ['postalCode', 20, 'Postal code'],
  ] as const) {
    const v = text(k, max, label);
    if (v) input[k] = v;
  }
  if (!['RETAIL', 'WHOLESALE', 'CORPORATE'].includes(String(input.customerType))) {
    errors.customerType = 'Select a customer type';
  }
  return finish(input, errors);
}

// ─── Lead ─────────────────────────────────────────────────────

export const LEAD_SOURCES = ['WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'CAMPAIGN', 'OTHER'] as const;
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

export interface LeadFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: string;
  estimatedValue: string; // rupees
  nextFollowUpDate: string; // yyyy-mm-dd
  notes: string;
}

export const EMPTY_LEAD_FORM: LeadFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  source: 'WALK_IN',
  estimatedValue: '',
  nextFollowUpDate: '',
  notes: '',
};

/** Rupee string ("12,500.50") to integer paise without float drift; null if invalid. */
export function rupeesToPaise(value: string): number | null {
  const s = value.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  return parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
}

export function buildLeadInput(form: LeadFormValues): Built {
  const errors: Record<string, string> = {};
  const input: Record<string, unknown> = {};
  const first = form.firstName.trim();
  const last = form.lastName.trim();
  if (!first) errors.firstName = 'First name is required';
  else if (first.length > 100) errors.firstName = 'First name must be at most 100 characters';
  if (!last) errors.lastName = 'Last name is required';
  else if (last.length > 100) errors.lastName = 'Last name must be at most 100 characters';
  input.firstName = first;
  input.lastName = last;

  if (form.phone.trim()) {
    const p = normalizePhone(form.phone);
    if (!p) errors.phone = 'Phone must be a valid number, e.g. +919820000001 or a 10-digit mobile';
    else input.phone = p;
  }
  const email = form.email.trim();
  if (email) {
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    else input.email = email;
  }
  if (!(LEAD_SOURCES as readonly string[]).includes(form.source)) errors.source = 'Select a source';
  input.source = form.source;

  if (form.estimatedValue.trim()) {
    const paise = rupeesToPaise(form.estimatedValue);
    if (paise === null) errors.estimatedValue = 'Enter an amount in rupees, e.g. 25000 or 25000.50';
    else input.estimatedValuePaise = paise;
  }
  if (form.nextFollowUpDate) {
    if (Number.isNaN(Date.parse(form.nextFollowUpDate))) errors.nextFollowUpDate = 'Enter a valid date';
    else input.nextFollowUpDate = new Date(`${form.nextFollowUpDate}T00:00:00.000Z`);
  }
  if (form.notes.trim()) input.notes = form.notes.trim();
  return finish(input, errors);
}

// ─── Campaign ─────────────────────────────────────────────────

export const CAMPAIGN_CHANNELS = ['WHATSAPP', 'SMS', 'EMAIL'] as const;
export const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

export interface CampaignFormValues {
  name: string;
  description: string;
  channel: string;
  scheduledAt: string; // yyyy-mm-ddThh:mm (datetime-local)
  customerType: string;
  city: string;
}

export const EMPTY_CAMPAIGN_FORM: CampaignFormValues = {
  name: '',
  description: '',
  channel: 'WHATSAPP',
  scheduledAt: '',
  customerType: '',
  city: '',
};

export function buildCampaignInput(form: CampaignFormValues, now: Date = new Date()): Built {
  const errors: Record<string, string> = {};
  const input: Record<string, unknown> = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Campaign name is required';
  else if (name.length > 255) errors.name = 'Name must be at most 255 characters';
  input.name = name;
  if (form.description.trim()) input.description = form.description.trim();
  if (!(CAMPAIGN_CHANNELS as readonly string[]).includes(form.channel)) errors.channel = 'Select a channel';
  input.channel = form.channel;

  if (form.scheduledAt) {
    const d = new Date(form.scheduledAt);
    if (Number.isNaN(d.getTime())) errors.scheduledAt = 'Enter a valid date and time';
    else if (d.getTime() <= now.getTime()) errors.scheduledAt = 'Schedule time must be in the future';
    else input.scheduledAt = d;
  }
  const filter: Record<string, unknown> = {};
  if (form.customerType) filter.customerType = [form.customerType];
  if (form.city.trim()) filter.city = [form.city.trim()];
  if (Object.keys(filter).length) input.audienceFilter = filter;
  return finish(input, errors);
}

// ─── Readers for real API shapes ──────────────────────────────

export function fullName(p: { firstName?: unknown; lastName?: unknown } | null | undefined): string {
  return `${typeof p?.firstName === 'string' ? p.firstName : ''} ${typeof p?.lastName === 'string' ? p.lastName : ''}`.trim();
}

/** Show a value or a "-" placeholder (so grid cells never collapse). */
export function orDash(v: unknown): string {
  if (v === null || v === undefined) return '-';
  const s = String(v).trim();
  return s === '' ? '-' : s;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** crm.customer360 returns { profile, loyalty, purchaseHistory, ... }. */
export function customer360View(data: Record<string, unknown>) {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const loyalty = (data.loyalty as Record<string, unknown> | undefined) ?? {};
  const history = (data.purchaseHistory as Array<Record<string, unknown>> | undefined) ?? [];
  const totalSpentPaise = history.reduce((sum, h) => sum + num(h.totalPaise), 0);
  return {
    profile,
    name: fullName(profile),
    totalSpentPaise,
    totalOrders: history.length,
    averageTicketPaise: history.length ? Math.round(totalSpentPaise / history.length) : 0,
    loyaltyPoints: num(loyalty.currentPoints),
    loyaltyTier: (loyalty.tier as string | null | undefined) ?? null,
  };
}

/** leadList / leadGet rows carry firstName/lastName and BigInt-as-string estimatedValuePaise. */
export function leadView(l: Record<string, unknown>) {
  const customer = l.customer as { firstName?: string; lastName?: string } | null | undefined;
  const name = fullName(l) || fullName(customer) || (typeof l.name === 'string' ? l.name : '');
  const est = l.estimatedValuePaise;
  return { name, estimatedValuePaise: est === null || est === undefined || est === '' ? null : num(est) };
}

/** campaignList / campaignGet: audience is totalRecipients; template is optional. */
export function campaignView(c: Record<string, unknown>) {
  const template = c.template as { name?: string; subject?: string } | null | undefined;
  return {
    audience: c.totalRecipients ?? c.audienceCount ?? null,
    sent: c.sentCount ?? null,
    delivered: c.deliveredCount ?? null,
    failed: c.failedCount ?? null,
    templateName: template?.name ?? null,
    subject: (c.subject as string | undefined) ?? template?.subject ?? null,
  };
}
