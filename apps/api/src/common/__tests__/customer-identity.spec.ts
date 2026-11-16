import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  extractContext,
  resolveCustomer,
  UUID_RE,
  type HeaderBearingRequest,
} from '../customer-identity';

const SECRET = 'test-customer-identity-secret-0123456789';
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CUSTOMER = 'cust-0001';

function b2cToken(
  overrides: Record<string, unknown> = {},
  options: jwt.SignOptions = { expiresIn: '1h' },
  secret = SECRET,
): string {
  const payload = {
    sub: 'auth-0001',
    customerId: CUSTOMER,
    tenantId: TENANT_A,
    email: 'c@example.com',
    phone: null,
    type: 'b2c',
    ...overrides,
  };
  return jwt.sign(payload, secret, options);
}

function req(headers: Record<string, string | string[] | undefined>): HeaderBearingRequest {
  return { headers } as HeaderBearingRequest;
}

describe('customer-identity', () => {
  const savedSecret = process.env.JWT_SECRET;
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
  });

  describe('UUID_RE', () => {
    it('accepts canonical and seed-style UUIDs', () => {
      expect(UUID_RE.test(TENANT_A)).toBe(true);
      expect(UUID_RE.test('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true);
    });

    it('rejects malformed values', () => {
      expect(UUID_RE.test('not-a-uuid')).toBe(false);
      expect(UUID_RE.test('11111111-1111-1111-1111-11111111111')).toBe(false);
      expect(UUID_RE.test(`${TENANT_A} `)).toBe(false);
      expect(UUID_RE.test('')).toBe(false);
    });
  });

  describe('resolveCustomer', () => {
    it('returns tenant and customer from a valid B2C bearer token', () => {
      const token = b2cToken();
      const result = resolveCustomer(req({ authorization: `Bearer ${token}` }));
      expect(result).toEqual({ tenantId: TENANT_A, customerId: CUSTOMER });
    });

    it('accepts a token when x-tenant-id matches the token tenant', () => {
      const token = b2cToken();
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_A }),
      );
      expect(result).toEqual({ tenantId: TENANT_A, customerId: CUSTOMER });
    });

    it('treats the request as guest when x-tenant-id differs from the token tenant', () => {
      const token = b2cToken();
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
      expect(result.customerId).toBeUndefined();
    });

    it('rejects an invalid x-tenant-id even when a token would otherwise match', () => {
      const token = b2cToken();
      expect(() =>
        resolveCustomer(req({ authorization: `Bearer ${token}`, 'x-tenant-id': 'bogus' })),
      ).toThrow(BadRequestException);
    });

    it('resolves a guest from the x-tenant-id header when there is no authorization', () => {
      const result = resolveCustomer(req({ 'x-tenant-id': TENANT_B }));
      expect(result).toEqual({ tenantId: TENANT_B });
      expect(result.customerId).toBeUndefined();
    });

    it('throws BadRequest when x-tenant-id is missing for a guest', () => {
      expect(() => resolveCustomer(req({}))).toThrow(
        new BadRequestException('Missing x-tenant-id header'),
      );
    });

    it('throws BadRequest when x-tenant-id is not a UUID', () => {
      expect(() => resolveCustomer(req({ 'x-tenant-id': 'tenant-1' }))).toThrow(
        new BadRequestException('x-tenant-id must be a valid UUID'),
      );
    });

    it('falls back to guest when the token is signed with the wrong secret', () => {
      const token = b2cToken({}, { expiresIn: '1h' }, 'another-secret-entirely-0123456789ab');
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
    });

    it('falls back to guest for an expired token', () => {
      const token = b2cToken({}, { expiresIn: -10 });
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
    });

    it('falls back to guest for a malformed token', () => {
      const result = resolveCustomer(
        req({ authorization: 'Bearer not.a.jwt', 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
    });

    it('falls back to guest for a staff token (type is not b2c)', () => {
      const token = b2cToken({ type: 'staff' });
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
    });

    it('falls back to guest for a token without a type claim', () => {
      const token = b2cToken({ type: undefined });
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result.customerId).toBeUndefined();
    });

    it('falls back to guest when customerId is missing or empty', () => {
      const missing = b2cToken({ customerId: undefined });
      const empty = b2cToken({ customerId: '' });
      for (const token of [missing, empty]) {
        const result = resolveCustomer(
          req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
        );
        expect(result).toEqual({ tenantId: TENANT_B });
      }
    });

    it('falls back to guest when the token has no tenantId claim', () => {
      const token = b2cToken({ tenantId: undefined });
      const result = resolveCustomer(
        req({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
    });

    it('ignores authorization schemes other than Bearer', () => {
      const token = b2cToken();
      const result = resolveCustomer(
        req({ authorization: `Basic ${token}`, 'x-tenant-id': TENANT_B }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
    });

    it('accepts a lowercase bearer scheme', () => {
      const token = b2cToken();
      const result = resolveCustomer(req({ authorization: `bearer ${token}` }));
      expect(result.customerId).toBe(CUSTOMER);
    });

    it('never trusts an x-customer-id header', () => {
      const result = resolveCustomer(
        req({ 'x-tenant-id': TENANT_B, 'x-customer-id': 'spoofed-customer' }),
      );
      expect(result).toEqual({ tenantId: TENANT_B });
      expect(result.customerId).toBeUndefined();
    });

    it('uses the first value when x-tenant-id is sent as an array', () => {
      const result = resolveCustomer(req({ 'x-tenant-id': [TENANT_B, TENANT_A] }));
      expect(result).toEqual({ tenantId: TENANT_B });
    });
  });

  describe('extractContext', () => {
    it('returns a guest context with a generated session id when no headers are given', () => {
      const ctx = extractContext(req({ 'x-tenant-id': TENANT_B }));
      expect(ctx.tenantId).toBe(TENANT_B);
      expect(ctx.customerId).toBeNull();
      expect(ctx.sessionId).toMatch(/^sess-\d+$/);
    });

    it('uses the x-session-id header when provided', () => {
      const ctx = extractContext(req({ 'x-tenant-id': TENANT_B, 'x-session-id': 'sess-abc' }));
      expect(ctx.sessionId).toBe('sess-abc');
    });

    it('returns the verified customer id for a valid B2C token', () => {
      const token = b2cToken();
      const ctx = extractContext(
        req({ authorization: `Bearer ${token}`, 'x-session-id': 'sess-xyz' }),
      );
      expect(ctx).toEqual({ tenantId: TENANT_A, customerId: CUSTOMER, sessionId: 'sess-xyz' });
    });

    it('propagates the BadRequest for an invalid guest tenant header', () => {
      expect(() => extractContext(req({ 'x-tenant-id': 'nope' }))).toThrow(BadRequestException);
    });
  });
});
