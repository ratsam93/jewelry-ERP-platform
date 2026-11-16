import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AccessTokenDenylistService } from '../auth/access-token-denylist.service';
import { extractBearerToken, resolveStaffClaims } from '../auth/access-token';

export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  role: string;
  permissions: string[];
  jti?: string;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
      userId?: string;
      userRole?: string;
      userPermissions?: string[];
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(@Optional() private readonly denylist?: AccessTokenDenylistService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    // Only staff tokens populate userId/tenant. B2C customer tokens, expired or
    // mis-signed tokens, and denylisted (revoked) tokens are treated as anonymous;
    // guards then return 401.
    const claims = resolveStaffClaims(extractBearerToken(req.headers.authorization), this.denylist);
    if (claims) {
      req.tenantId = claims.tenantId;
      req.userId = claims.sub;
      req.userRole = claims.role;
      req.userPermissions = claims.permissions;
      req.accessTokenJti = claims.jti;
      req.accessTokenExp = claims.exp;
    }
    next();
  }
}
