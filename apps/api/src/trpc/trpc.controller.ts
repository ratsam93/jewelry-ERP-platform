import { Controller, All, Optional, Req, Res } from '@nestjs/common';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Request, Response } from 'express';
import { TrpcRouter } from './trpc.router';
import type { TrpcContext } from './trpc.service';
import { AccessTokenDenylistService } from '../auth/access-token-denylist.service';
import { extractBearerToken, resolveStaffClaims } from '../auth/access-token';
import { verifyB2CToken } from '../common/customer-identity';

@Controller('trpc')
export class TrpcController {
  constructor(
    private readonly trpcRouter: TrpcRouter,
    @Optional() private readonly denylist?: AccessTokenDenylistService,
  ) {}

  @All('*')
  async handleTrpc(@Req() req: Request, @Res() res: Response) {
    // TenantMiddleware doesn't reliably match multi-segment paths like
    // /api/v1/trpc/inventory.stockItems.list under Nest 11 + path-to-regexp
    // v6, so parse the JWT inline to guarantee tenantId/userId on every call.
    let tenantId = req.tenantId;
    let userId = req.userId;
    let userRole = req.userRole;
    let userPermissions = req.userPermissions;
    let principal: TrpcContext['principal'] = userId ? 'staff' : undefined;
    const authHeader = req.headers.authorization;
    if (!userId) {
      // Staff tokens only: B2C tokens, invalid/expired and revoked tokens leave
      // the context unauthenticated; authedProcedure returns UNAUTHORIZED.
      const claims = resolveStaffClaims(extractBearerToken(authHeader), this.denylist);
      if (claims) {
        tenantId = claims.tenantId;
        userId = claims.sub;
        userRole = claims.role;
        userPermissions = claims.permissions;
        principal = 'staff';
      } else {
        // B2C customer token: only customerProcedure accepts this principal;
        // authedProcedure (staff) rejects it with FORBIDDEN.
        const token = extractBearerToken(authHeader);
        const customer = token ? verifyB2CToken(token) : null;
        if (customer) {
          tenantId = customer.tenantId;
          userId = customer.customerId;
          userRole = 'customer';
          userPermissions = [];
          principal = 'customer';
        }
      }
    }
    const context: TrpcContext = {
      tenantId,
      userId,
      userRole,
      userPermissions,
      principal,
    };

    // Convert Express request to Fetch API Request
    const protocol = req.protocol;
    const host = req.get('host') ?? 'localhost:4000';
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }

    const fetchReq = new globalThis.Request(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    // Endpoint must match the full path prefix Nest sees.
    // Global prefix 'api/v1' + controller 'trpc' => URL is '/api/v1/trpc/<procedure>'.
    // fetchRequestHandler slices `endpoint.length` chars off to get the procedure.
    const fetchRes = await fetchRequestHandler({
      endpoint: '/api/v1/trpc',
      req: fetchReq,
      router: this.trpcRouter.appRouter,
      createContext: () => context,
    });

    // Send the response back via Express
    res.status(fetchRes.status);
    fetchRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const body = await fetchRes.text();
    res.send(body);
  }
}
