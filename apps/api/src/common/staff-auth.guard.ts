// ─── Staff Auth Guard ──────────────────────────────────────────
// Requires a verified staff JWT. TenantMiddleware is the only place
// that populates req.userId / req.tenantId (from a verified token),
// so this guard only checks that those values are present. It never
// reads tenant identity from request headers.

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class StaffAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.userId || !req.tenantId) {
      throw new UnauthorizedException('Staff authentication required');
    }
    return true;
  }
}
