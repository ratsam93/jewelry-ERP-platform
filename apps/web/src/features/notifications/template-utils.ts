// Helpers for the notification template editor (crm.notificationTemplate* procedures).

export const TEMPLATE_CHANNELS = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
] as const;

export const TEMPLATE_CATEGORIES = [
  { value: 'TRANSACTIONAL', label: 'Transactional' },
  { value: 'PROMOTIONAL', label: 'Promotional' },
  { value: 'REMINDER', label: 'Reminder' },
] as const;

export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number]['value'];
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['value'];

export interface TemplateFormValues {
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject: string;
  body: string;
  isActive: boolean;
}

export const EMPTY_TEMPLATE: TemplateFormValues = {
  name: '',
  channel: 'EMAIL',
  category: 'TRANSACTIONAL',
  subject: '',
  body: '',
  isActive: true,
};

export const SAMPLE_VARIABLES: Record<string, string> = {
  customerName: 'Priya Sharma',
  name: 'Priya Sharma',
  invoiceNumber: 'INV-2026-0042',
  amount: '₹45,000',
  orderNumber: 'ORD-1001',
  dueDate: '30 Nov 2026',
  storeName: 'Sharma Jewellers',
  points: '250',
};

/** Unique {{variable}} names used in the text, in order of first appearance. */
export function extractVariables(...texts: string[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)) seen.add(m[1] as string);
  }
  return Array.from(seen);
}

export function renderTemplatePreview(text: string, data: Record<string, string> = SAMPLE_VARIABLES): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(data, key) ? (data[key] as string) : match,
  );
}

/** Unbalanced `{{` / `}}` braces make a variable that will never be substituted. */
function hasBrokenBraces(text: string): boolean {
  const stripped = text.replace(/\{\{\s*[A-Za-z0-9_.]+\s*\}\}/g, '');
  return stripped.includes('{{') || stripped.includes('}}');
}

export function validateTemplate(v: TemplateFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.name.trim()) errors.name = 'Name is required.';
  else if (v.name.length > 255) errors.name = 'Name must be 255 characters or fewer.';
  if (v.channel === 'EMAIL' && !v.subject.trim()) errors.subject = 'Subject is required for email templates.';
  if (v.subject.length > 500) errors.subject = 'Subject must be 500 characters or fewer.';
  if (!v.body.trim()) errors.body = 'Message body is required.';
  else if (hasBrokenBraces(v.body) || hasBrokenBraces(v.subject)) {
    errors.body = 'Variables must look like {{customerName}}: check for an unclosed or empty {{ }}.';
  }
  return errors;
}

/** Build the API payload; `variables` is derived from the placeholders actually used. */
export function toTemplatePayload(v: TemplateFormValues) {
  return {
    name: v.name.trim(),
    channel: v.channel,
    category: v.category,
    subject: v.channel === 'EMAIL' ? v.subject.trim() : undefined,
    body: v.body,
    variables: extractVariables(v.body, v.channel === 'EMAIL' ? v.subject : ''),
    isActive: v.isActive,
  };
}
