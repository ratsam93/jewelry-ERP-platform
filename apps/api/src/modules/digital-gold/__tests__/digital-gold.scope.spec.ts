import { describe, it, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { requireCustomerScope, requireTenant } from '../digital-gold.scope';

describe('digital-gold scope guards (fail closed)', () => {
  it('requireCustomerScope throws 401 when customerId is missing', () => {
    expect(() => requireCustomerScope('t1', undefined)).toThrow(UnauthorizedException);
    expect(() => requireCustomerScope('t1', '')).toThrow(UnauthorizedException);
  });

  it('requireCustomerScope throws 401 when tenantId is missing', () => {
    expect(() => requireCustomerScope(undefined, 'c1')).toThrow(UnauthorizedException);
    expect(() => requireCustomerScope(null, 'c1')).toThrow(UnauthorizedException);
  });

  it('passes with both ids', () => {
    expect(() => requireCustomerScope('t1', 'c1')).not.toThrow();
    expect(requireTenant('t1')).toBe('t1');
  });
});
