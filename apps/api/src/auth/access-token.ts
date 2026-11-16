import * as jwt from 'jsonwebtoken';
import { getJwtSecret, JWT_ALGORITHMS } from '../common/jwt-secret';
import type { AccessTokenDenylistService } from './access-token-denylist.service';

/** Claims shared by staff (admin) and B2C access tokens. */
export interface VerifiedAccessClaims {
  sub?: string;
  tenantId?: string;
  role?: string;
  permissions?: unknown;
  type?: string;
  jti?: string;
  exp?: number;
  [key: string]: unknown;
}

/** Claims a staff route may rely on after validation. */
export interface StaffClaims {
  sub: string;
  tenantId: string;
  role: string;
  permissions: string[];
  jti?: string;
  exp?: number;
}

/** Extracts the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Verifies the JWT signature with the configured secret and HS256 only.
 * Returns null when the token is malformed, mis-signed or (unless
 * `ignoreExpiration` is set) expired.
 */
export function verifyAccessToken(
  token: string,
  options: { ignoreExpiration?: boolean } = {},
): VerifiedAccessClaims | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: JWT_ALGORITHMS,
      ignoreExpiration: options.ignoreExpiration ?? false,
    });
    if (typeof decoded !== 'object' || decoded === null) return null;
    return decoded as VerifiedAccessClaims;
  } catch {
    return null;
  }
}

/**
 * Returns jti/exp from a signature-verified token, ignoring expiry so that
 * logout/refresh can still revoke a token that has just expired (D-037).
 * Returns {} when the signature does not verify.
 */
export function revocationClaimsFromHeader(authHeader: string | undefined): {
  jti?: string;
  exp?: number;
} {
  const token = extractBearerToken(authHeader);
  if (!token) return {};
  const claims = verifyAccessToken(token, { ignoreExpiration: true });
  if (!claims) return {};
  return {
    jti: typeof claims.jti === 'string' ? claims.jti : undefined,
    exp: typeof claims.exp === 'number' ? claims.exp : undefined,
  };
}

/**
 * Resolves staff (admin/ERP user) claims from a bearer token.
 * Returns null when the token:
 *  - fails signature/expiry verification,
 *  - is a B2C customer token (`type === 'b2c'`),
 *  - lacks `sub` or `tenantId`,
 *  - has been revoked via the access-token denylist.
 */
export function resolveStaffClaims(
  token: string | undefined,
  denylist?: AccessTokenDenylistService,
): StaffClaims | null {
  if (!token) return null;
  const claims = verifyAccessToken(token);
  if (!claims) return null;
  if (claims.type === 'b2c') return null;
  if (typeof claims.sub !== 'string' || typeof claims.tenantId !== 'string') return null;
  if (denylist?.isRevoked(claims.jti)) return null;
  return {
    sub: claims.sub,
    tenantId: claims.tenantId,
    role: typeof claims.role === 'string' ? claims.role : 'user',
    permissions: Array.isArray(claims.permissions)
      ? claims.permissions.filter((p): p is string => typeof p === 'string')
      : [],
    jti: claims.jti,
    exp: claims.exp,
  };
}
