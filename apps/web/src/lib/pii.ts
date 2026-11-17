// Display masking for PII on read-only pages. Same formats as the API helper
// (apps/api/src/common/pii-mask.ts) and idempotent: masking an already-masked
// value returns it unchanged, so these are a safety net on top of API masking.
//
// PAN:     first 2 + last 1 visible   (ABCDE1234F  -> ABXXXXXXXF)
// Aadhaar: last 4 digits only         (234567890124 -> XXXX-XXXX-0124)
// Bank:    last 4 digits only         (123456789012 -> XXXXXXXX9012)

export function maskPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  if (pan.length <= 3) return 'X'.repeat(pan.length);
  return `${pan.slice(0, 2)}${'X'.repeat(pan.length - 3)}${pan.slice(-1)}`;
}

export function maskAadhaar(aadhaar: string | null | undefined): string | null {
  if (!aadhaar) return null;
  return `XXXX-XXXX-${aadhaar.slice(-4)}`;
}

export function maskBankAccount(account: string | null | undefined): string | null {
  if (!account) return null;
  if (account.length <= 4) return 'X'.repeat(account.length);
  return `${'X'.repeat(account.length - 4)}${account.slice(-4)}`;
}
