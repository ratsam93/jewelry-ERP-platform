// ─── CRM Customer helpers ──────────────────────────────────────
// Create-customer input schema and PAN/Aadhaar masking for API responses.

import { z } from 'zod';

/** E.164: "+" then 8-15 digits, first digit non-zero (e.g. +919820000001). */
export const E164_PHONE = /^\+[1-9]\d{7,14}$/;

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const CustomerCreateInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  phone: z.string().trim().regex(E164_PHONE, 'Phone must be in international format, e.g. +919820000001').optional(),
  alternatePhone: z.string().trim().regex(E164_PHONE, 'Alternate phone must be in international format').optional(),
  email: z.string().trim().email().max(255).optional(),
  address: optionalText(500),
  city: optionalText(100),
  state: optionalText(100),
  country: z.string().trim().length(2).toUpperCase().optional(),
  postalCode: optionalText(20),
  customerType: z.enum(['RETAIL', 'WHOLESALE', 'CORPORATE']).default('RETAIL'),
  notes: optionalText(5000),
});
export type CustomerCreateInput = z.infer<typeof CustomerCreateInputSchema>;

/** PAN: first 2 + last 1 character visible (ABCPS1234F -> ABXXXXXXXF). */
export function maskPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  if (pan.length <= 3) return 'X'.repeat(pan.length);
  return `${pan.slice(0, 2)}${'X'.repeat(pan.length - 3)}${pan.slice(-1)}`;
}

/** Aadhaar: last 4 digits only (same display format as the KYC status API). */
export function maskAadhaar(aadhaar: string | null | undefined): string | null {
  if (!aadhaar) return null;
  return `XXXX-XXXX-${aadhaar.slice(-4)}`;
}

/** Return a copy of a customer-like row with PAN and Aadhaar masked. */
export function maskCustomerIdentifiers<T extends { panNumber?: string | null; aadhaarNumber?: string | null }>(
  row: T,
): T {
  const out = { ...row };
  if ('panNumber' in out) out.panNumber = maskPan(out.panNumber);
  if ('aadhaarNumber' in out) out.aadhaarNumber = maskAadhaar(out.aadhaarNumber);
  return out;
}
