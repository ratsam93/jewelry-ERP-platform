// Shared PII masking helpers for API responses.
//
// PAN:      first 2 + last 1 visible        (ABCPS1234F   -> ABXXXXXXXF)
// Aadhaar:  last 4 digits only              (234567890124 -> XXXX-XXXX-0124)
// Bank a/c: last 4 digits only              (123456789012 -> XXXXXXXX9012)
// Secrets:  never returned; replaced by a `<name>Set: boolean` style flag by callers.

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

/** Return a copy of a customer-like row with PAN and Aadhaar masked (shallow). */
export function maskCustomerIdentifiers<T extends { panNumber?: string | null; aadhaarNumber?: string | null }>(
  row: T,
): T {
  const out = { ...row };
  if ('panNumber' in out) out.panNumber = maskPan(out.panNumber);
  if ('aadhaarNumber' in out) out.aadhaarNumber = maskAadhaar(out.aadhaarNumber);
  return out;
}

const PAN_KEYS = new Set(['panNumber', 'pan']);
const AADHAAR_KEYS = new Set(['aadhaarNumber', 'aadhaar']);
const BANK_KEYS = new Set(['bankAccountNumber', 'accountNumber']);
/** Fields that must never leave the server. */
const STRIP_KEYS = new Set([
  'passwordHash',
  'refreshToken',
  'otp',
  'otpCode',
  'secret',
  'apiKey',
  'apiSecret',
  'webhookSecret',
  'twoFactorSecret',
  'tokenReference',
  'accessToken',
]);

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-copy a response value, masking PAN/Aadhaar/bank-account fields and
 * removing credential fields at any depth. Dates, BigInt, Decimal and other
 * class instances are passed through untouched.
 */
export function maskSensitiveDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => maskSensitiveDeep(v)) as unknown as T;
  if (!isPlain(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (STRIP_KEYS.has(k)) continue;
    if (typeof v === 'string' || v === null || v === undefined) {
      if (PAN_KEYS.has(k)) {
        out[k] = maskPan(v as string | null | undefined);
        continue;
      }
      if (AADHAAR_KEYS.has(k)) {
        out[k] = maskAadhaar(v as string | null | undefined);
        continue;
      }
      if (BANK_KEYS.has(k)) {
        out[k] = maskBankAccount(v as string | null | undefined);
        continue;
      }
    }
    out[k] = maskSensitiveDeep(v);
  }
  return out as T;
}
