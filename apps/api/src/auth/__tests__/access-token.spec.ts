import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as jwt from 'jsonwebtoken';
import {
  extractBearerToken,
  resolveStaffClaims,
  revocationClaimsFromHeader,
  verifyAccessToken,
} from '../access-token';
import type { AccessTokenDenylistService } from '../access-token-denylist.service';

const SECRET = 'test-access-token-secret-0123456789abcdef';
const TENANT = '11111111-1111-1111-1111-111111111111';

function staffToken(
  overrides: Record<string, unknown> = {},
  options: jwt.SignOptions = { expiresIn: '15m', jwtid: 'jti-1' },
  secret = SECRET,
): string {
  const payload = {
    sub: 'user-1',
    tenantId: TENANT,
    role: 'admin',
    permissions: ['read:orders', 'write:orders'],
    ...overrides,
  };
  return jwt.sign(payload, secret, options);
}

function unsignedToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

describe('access-token', () => {
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
    vi.restoreAllMocks();
  });

  describe('extractBearerToken', () => {
    it('returns undefined when there is no header', () => {
      expect(extractBearerToken(undefined)).toBeUndefined();
    });

    it('returns undefined for a non-Bearer scheme', () => {
      expect(extractBearerToken('Basic abc123')).toBeUndefined();
    });

    it('is case-sensitive about the Bearer prefix', () => {
      expect(extractBearerToken('bearer abc123')).toBeUndefined();
    });

    it('returns undefined when the bearer value is empty or whitespace', () => {
      expect(extractBearerToken('Bearer ')).toBeUndefined();
      expect(extractBearerToken('Bearer    ')).toBeUndefined();
    });

    it('returns the token and trims surrounding whitespace', () => {
      expect(extractBearerToken('Bearer   abc.def.ghi  ')).toBe('abc.def.ghi');
    });
  });

  describe('verifyAccessToken', () => {
    it('returns the claims for a valid HS256 token', () => {
      const claims = verifyAccessToken(staffToken());
      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe('user-1');
      expect(claims?.tenantId).toBe(TENANT);
    });

    it('returns null for a token signed with another secret', () => {
      expect(verifyAccessToken(staffToken({}, undefined, 'other-secret-0123456789abcdefghij'))).toBeNull();
    });

    it('returns null for an expired token', () => {
      expect(verifyAccessToken(staffToken({}, { expiresIn: -5 }))).toBeNull();
    });

    it('returns claims for an expired token when ignoreExpiration is set', () => {
      const claims = verifyAccessToken(staffToken({}, { expiresIn: -5, jwtid: 'jti-old' }), {
        ignoreExpiration: true,
      });
      expect(claims?.jti).toBe('jti-old');
    });

    it('returns null for an unsigned alg=none token', () => {
      expect(verifyAccessToken(unsignedToken({ sub: 'user-1', tenantId: TENANT }))).toBeNull();
    });

    it('returns null for an HS512 token even when signed with the right secret', () => {
      const token = jwt.sign({ sub: 'user-1', tenantId: TENANT }, SECRET, { algorithm: 'HS512' });
      expect(verifyAccessToken(token)).toBeNull();
    });

    it('returns null for a malformed token', () => {
      expect(verifyAccessToken('garbage')).toBeNull();
      expect(verifyAccessToken('')).toBeNull();
    });

    it('returns null for a token whose payload is not an object', () => {
      const token = jwt.sign('just-a-string', SECRET);
      expect(verifyAccessToken(token)).toBeNull();
    });
  });

  describe('revocationClaimsFromHeader', () => {
    it('returns an empty object without an authorization header', () => {
      expect(revocationClaimsFromHeader(undefined)).toEqual({});
    });

    it('returns an empty object for a non-bearer header', () => {
      expect(revocationClaimsFromHeader('Basic xyz')).toEqual({});
    });

    it('returns jti and exp from a valid token', () => {
      const token = staffToken();
      const decoded = jwt.decode(token) as { exp: number };
      expect(revocationClaimsFromHeader(`Bearer ${token}`)).toEqual({
        jti: 'jti-1',
        exp: decoded.exp,
      });
    });

    it('still returns jti and exp for an already-expired but correctly signed token', () => {
      const token = staffToken({}, { expiresIn: -60, jwtid: 'jti-expired' });
      const claims = revocationClaimsFromHeader(`Bearer ${token}`);
      expect(claims.jti).toBe('jti-expired');
      expect(typeof claims.exp).toBe('number');
    });

    it('returns an empty object when the signature does not verify', () => {
      const token = staffToken({}, undefined, 'other-secret-0123456789abcdefghij');
      expect(revocationClaimsFromHeader(`Bearer ${token}`)).toEqual({});
    });

    it('omits jti and exp when they are not the expected types', () => {
      const token = jwt.sign({ sub: 'user-1', tenantId: TENANT, jti: 42 }, SECRET, {
        noTimestamp: true,
      });
      const claims = revocationClaimsFromHeader(`Bearer ${token}`);
      expect(claims.jti).toBeUndefined();
      expect(claims.exp).toBeUndefined();
    });
  });

  describe('resolveStaffClaims', () => {
    it('returns null without a token', () => {
      expect(resolveStaffClaims(undefined)).toBeNull();
      expect(resolveStaffClaims('')).toBeNull();
    });

    it('returns null for an invalid token', () => {
      expect(resolveStaffClaims('not-a-token')).toBeNull();
    });

    it('returns null for an expired token', () => {
      expect(resolveStaffClaims(staffToken({}, { expiresIn: -5 }))).toBeNull();
    });

    it('rejects B2C customer tokens', () => {
      const token = staffToken({ type: 'b2c' });
      expect(resolveStaffClaims(token)).toBeNull();
    });

    it('returns null when sub is missing', () => {
      const token = staffToken({ sub: undefined });
      expect(resolveStaffClaims(token)).toBeNull();
    });

    it('returns null when tenantId is missing', () => {
      const token = staffToken({ tenantId: undefined });
      expect(resolveStaffClaims(token)).toBeNull();
    });

    it('returns the staff identity from a valid token', () => {
      const claims = resolveStaffClaims(staffToken());
      expect(claims).toEqual({
        sub: 'user-1',
        tenantId: TENANT,
        role: 'admin',
        permissions: ['read:orders', 'write:orders'],
        jti: 'jti-1',
        exp: expect.any(Number),
      });
    });

    it('defaults role to "user" and permissions to [] when they are absent or malformed', () => {
      const claims = resolveStaffClaims(
        staffToken({ role: 42, permissions: 'read:all' }),
      );
      expect(claims?.role).toBe('user');
      expect(claims?.permissions).toEqual([]);
    });

    it('drops non-string entries from permissions', () => {
      const claims = resolveStaffClaims(
        staffToken({ permissions: ['read:orders', 7, null, 'write:orders'] }),
      );
      expect(claims?.permissions).toEqual(['read:orders', 'write:orders']);
    });

    it('returns null when the token jti is on the denylist', () => {
      const denylist = { isRevoked: vi.fn(() => true) } as unknown as AccessTokenDenylistService;
      expect(resolveStaffClaims(staffToken(), denylist)).toBeNull();
      expect(denylist.isRevoked).toHaveBeenCalledWith('jti-1');
    });

    it('returns claims when the denylist does not contain the jti', () => {
      const denylist = { isRevoked: vi.fn(() => false) } as unknown as AccessTokenDenylistService;
      expect(resolveStaffClaims(staffToken(), denylist)?.sub).toBe('user-1');
      expect(denylist.isRevoked).toHaveBeenCalledWith('jti-1');
    });
  });
});
