// ─── Zod helpers ───────────────────────────────────────────────

import { z } from 'zod';
import type { core } from 'zod';

/** A field schema with any top-level `.default()` removed. */
type WithoutDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

/** Shape where every field is optional and carries no default. */
export type PartialUpdateShape<S extends core.$ZodShape> = {
  [K in keyof S]: z.ZodOptional<WithoutDefault<S[K]>>;
};

/**
 * Build an update (PATCH-style) schema from a create schema.
 *
 * Use this instead of `schema.partial()` for updates. In Zod 4, `.partial()`
 * keeps each field's `.default()`, so a field the client did not send is
 * filled with its default and then written to the database — e.g. updating
 * only an address's phone would reset its label to 'Home' and clear
 * `isDefault`. This helper strips top-level defaults first, so omitted fields
 * stay `undefined` and are left unchanged.
 */
export function partialUpdate<S extends core.$ZodShape>(
  schema: z.ZodObject<S>,
): z.ZodObject<PartialUpdateShape<S>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const base = field instanceof z.ZodDefault ? field.removeDefault() : field;
    shape[key] = (base as z.ZodType).optional();
  }
  return z.object(shape) as unknown as z.ZodObject<PartialUpdateShape<S>>;
}
