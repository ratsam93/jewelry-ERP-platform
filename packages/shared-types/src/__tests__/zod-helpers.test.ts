import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { partialUpdate } from '../zod-helpers';
import { AddressInputSchema } from '../storefront';

describe('partialUpdate', () => {
  const Schema = z.object({
    name: z.string().min(1),
    label: z.string().default('Home'),
    isDefault: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  });

  it('does not inject defaults for omitted fields (unlike Zod 4 .partial())', () => {
    // Documents the Zod 4 behaviour this helper exists to avoid.
    expect(Schema.partial().parse({ name: 'x' })).toEqual({
      name: 'x',
      label: 'Home',
      isDefault: false,
      tags: [],
    });
    expect(partialUpdate(Schema).parse({ name: 'x' })).toEqual({ name: 'x' });
  });

  it('accepts an empty update', () => {
    expect(partialUpdate(Schema).parse({})).toEqual({});
  });

  it('keeps explicitly provided values, including falsy ones', () => {
    expect(partialUpdate(Schema).parse({ isDefault: false, label: '' })).toEqual({
      isDefault: false,
      label: '',
    });
  });

  it('still validates the fields that are provided', () => {
    expect(partialUpdate(Schema).safeParse({ name: '' }).success).toBe(false);
    expect(partialUpdate(Schema).safeParse({ isDefault: 'yes' }).success).toBe(false);
  });

  it('a phone-only address update does not reset label or isDefault', () => {
    const parsed = partialUpdate(AddressInputSchema).parse({ phone: '+919876543210' });
    expect(parsed).toEqual({ phone: '+919876543210' });
    expect(parsed).not.toHaveProperty('label');
    expect(parsed).not.toHaveProperty('isDefault');
  });
});
