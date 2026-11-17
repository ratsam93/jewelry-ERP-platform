// ─── Storefront Customer Identity ──────────────────────────────
// Single source of truth for resolving the tenant and (optional) B2C customer
// of a storefront request. The customer is taken ONLY from a verified B2C
// Bearer token. Client-supplied identity headers (x-customer-id) are never
// trusted.

import { BadRequestException } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import * as jwt from 'jsonwebtoken';
import type { B2CJwtPayload } from '@caratflow/shared-types';
import { getJwtSecret, JWT_ALGORITHMS } from './jwt-secret';

/** Generic 8-4-4-4-12 hex UUID shape (accepts seed IDs such as 11111111-1111-1111-1111-111111111111). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal request shape: anything with Node/Express style headers. */
export interface HeaderBearingRequest {
  headers: IncomingHttpHeaders;
}

export interface ResolvedCustomer {
  tenantId: string;
  /** Present only when a valid B2C Bearer token was supplied. */
  customerId?: string;
}

export interface StorefrontContext {
  tenantId: string;
  /** Verified customer id, or null for guests. */
  customerId: string | null;
  sessionId: string;
}

function headerValue(req: HeaderBearingRequest, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Verify a B2C access token. Returns null for any token that is not a valid,
 * unexpired, B2C token. The secret lookup happens outside the try block so a
 * server misconfiguration (missing JWT_SECRET in production) surfaces as an error.
 */
export function verifyB2CToken(token: string): { tenantId: string; customerId: string } | null {
  const secret = getJwtSecret();
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret, { algorithms: JWT_ALGORITHMS });
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object') return null;
  const payload = decoded as Partial<B2CJwtPayload>;
  if (payload.type !== 'b2c') return null;
  if (typeof payload.customerId !== 'string' || payload.customerId.length === 0) return null;
  if (typeof payload.tenantId !== 'string' || payload.tenantId.length === 0) return null;
  return { tenantId: payload.tenantId, customerId: payload.customerId };
}

/**
 * Resolve tenant and customer for a storefront request.
 *
 * - Valid B2C Bearer token: customerId and tenantId come from the token. If an
 *   x-tenant-id header is also sent it must match the token's tenant; otherwise
 *   the token is ignored and the request is treated as a guest.
 * - No token, or an invalid/expired/non-B2C token: guest. Tenant comes from the
 *   x-tenant-id header, which must be a UUID.
 *
 * Routes that need a customer must check `customerId` and reject guests with 401.
 */
export function resolveCustomer(req: HeaderBearingRequest): ResolvedCustomer {
  const headerTenant = headerValue(req, 'x-tenant-id');
  const authorization = headerValue(req, 'authorization');
  const match = authorization ? /^Bearer\s+(\S+)\s*$/i.exec(authorization) : null;

  if (match) {
    const verified = verifyB2CToken(match[1] as string);
    if (verified && (!headerTenant || headerTenant === verified.tenantId)) {
      return { tenantId: verified.tenantId, customerId: verified.customerId };
    }
  }

  if (!headerTenant) throw new BadRequestException('Missing x-tenant-id header');
  if (!UUID_RE.test(headerTenant)) {
    throw new BadRequestException('x-tenant-id must be a valid UUID');
  }
  return { tenantId: headerTenant };
}

/**
 * Full storefront request context: resolveCustomer plus the session id used
 * for guest carts and recommendation/behaviour logs.
 */
export function extractContext(req: HeaderBearingRequest): StorefrontContext {
  const resolved = resolveCustomer(req);
  return {
    tenantId: resolved.tenantId,
    customerId: resolved.customerId ?? null,
    sessionId: headerValue(req, 'x-session-id') ?? `sess-${Date.now()}`,
  };
}
