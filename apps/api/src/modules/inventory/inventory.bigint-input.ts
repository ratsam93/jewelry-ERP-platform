// ─── BigInt input coercion ─────────────────────────────────────
// The tRPC wire format is plain JSON (identity input transformer), which cannot
// carry a BigInt: JSON.stringify throws on the client before any request is
// sent. Clients therefore send weights (mg) and money (paise) as decimal
// strings and the router converts them to bigint before the shared zod
// schemas (which use z.bigint()) validate. Real bigints still pass through,
// so server-side callers and existing tests keep working.

import { z } from 'zod';

const INTEGER_STRING = /^-?\d+$/;

export function coerceBigIntFields(input: unknown, fields: readonly string[]): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const field of fields) {
    const v = out[field];
    if (typeof v === 'string' && INTEGER_STRING.test(v.trim())) {
      out[field] = BigInt(v.trim());
    } else if (typeof v === 'number' && Number.isSafeInteger(v)) {
      out[field] = BigInt(v);
    }
  }
  return out;
}

/** Wrap an object schema so the named fields accept decimal strings / integers as bigint. */
export function withBigIntFields<T extends z.ZodType>(schema: T, fields: readonly string[]) {
  return z.preprocess((v) => coerceBigIntFields(v, fields), schema) as unknown as z.ZodType<
    z.output<T>,
    unknown
  >;
}
