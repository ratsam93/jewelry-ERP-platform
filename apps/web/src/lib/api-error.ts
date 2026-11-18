/**
 * Turn any API / network failure into a readable string. The API answers errors as
 * `{ success:false, error:{ code, message, details? } }` (an OBJECT), Nest validation as
 * `{ message: string | string[] }`, tRPC as `{ error:{ json:{ message } } }` / `{ message }`.
 * Never returns "[object Object]".
 */

const GENERIC = 'Something went wrong. Please try again.';
const NETWORK = 'Could not reach the server. Check your connection and try again.';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function clean(s: string): string {
  return s.trim();
}

function fromDetails(details: unknown): string {
  if (typeof details === 'string') return clean(details);
  if (Array.isArray(details)) {
    return details
      .map((d) => (typeof d === 'string' ? d : isRecord(d) && typeof d.message === 'string' ? d.message : ''))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function find(value: unknown, depth = 0): string {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') return clean(value);
  if (value instanceof Error) {
    if (/^(failed to fetch|networkerror|load failed|network request failed)/i.test(value.message)) return NETWORK;
    return clean(value.message);
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => find(v, depth + 1))
      .filter(Boolean)
      .join(', ');
  }
  if (!isRecord(value)) return '';
  // tRPC wire shape: { error: { json: { message, data } } } or { json: {...} }
  if ('json' in value) {
    const m = find(value.json, depth + 1);
    if (m) return m;
  }
  const msg = find(value.message, depth + 1);
  if (msg) return msg;
  if ('error' in value) {
    const m = find(value.error, depth + 1);
    if (m) return m;
  }
  const det = fromDetails(value.details);
  if (det) return det;
  return '';
}

/** Best readable message for any failed-response body, Error, string or tRPC error. */
export function extractErrorMessage(body: unknown, fallback: string = GENERIC): string {
  const found = find(body);
  return found || fallback;
}

/** Machine code if the body carries one (`error.code`, `code`, tRPC `data.code`). */
export function extractErrorCode(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  if (typeof body.code === 'string') return body.code;
  if (isRecord(body.error)) {
    if (typeof body.error.code === 'string') return body.error.code;
    if (isRecord(body.error.json) && isRecord(body.error.json.data) && typeof body.error.json.data.code === 'string') {
      return body.error.json.data.code;
    }
  }
  if (isRecord(body.data) && typeof body.data.code === 'string') return body.data.code;
  return undefined;
}

/** Error thrown by `api` for non-2xx responses; keeps status/code/body for callers. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;
  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Friendly text for the sign-in form. */
export function loginErrorMessage(err: unknown, fallback = 'Login failed. Please try again.'): string {
  const status = err instanceof ApiError ? err.status : undefined;
  const code = (err instanceof ApiError ? err.code : extractErrorCode(err)) ?? '';
  const raw = extractErrorMessage(err, '');
  const text = raw.toLowerCase();

  if (raw === NETWORK) return NETWORK;
  if (/lock/.test(text) || /lock/i.test(code)) return raw || fallback; // account locked: API message
  if (status === 429 || /rate|throttl|too_many/i.test(code) || /too many/.test(text)) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (/invalid tenant|tenant not found|unknown tenant/.test(text) || /tenant/i.test(code)) {
    return 'We could not find that business. Check the business name (slug).';
  }
  if (/invalid (credentials|email or password)|incorrect (email|password)/.test(text) || /credential/i.test(code)) {
    return 'Incorrect email or password.';
  }
  return raw || fallback;
}
