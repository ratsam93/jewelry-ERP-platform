// ─── Digital Gold request-scope guards ─────────────────────────
// Fail closed: Prisma silently drops `undefined` filter values, so a
// missing tenantId/customerId would otherwise widen a query to every
// customer's rows. Every customer-scoped service entry point calls these.

import { UnauthorizedException } from '@nestjs/common';

export function requireTenant(tenantId: string | undefined | null): string {
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new UnauthorizedException('Tenant context is required');
  }
  return tenantId;
}

export function requireCustomerScope(
  tenantId: string | undefined | null,
  customerId: string | undefined | null,
): void {
  requireTenant(tenantId);
  if (typeof customerId !== 'string' || customerId.length === 0) {
    throw new UnauthorizedException('Customer authentication required');
  }
}
