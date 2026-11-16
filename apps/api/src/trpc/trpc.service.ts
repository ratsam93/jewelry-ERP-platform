import { Injectable, Logger } from '@nestjs/common';
import { initTRPC, TRPCError } from '@trpc/server';
import { evaluateProcedureAccess, hasExactPermission } from './rbac';

export { evaluateProcedureAccess, hasExactPermission } from './rbac';

export interface TrpcContext {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  userPermissions?: string[];
}

// Custom JSON transformer: serialize BigInt (paise/mg fields) as decimal
// strings so JSON.stringify doesn't throw "Do not know how to serialize
// a BigInt". Dates go through as ISO strings by default.
const bigIntTransformer = {
  input: {
    serialize: (obj: unknown) => obj,
    deserialize: (obj: unknown) => obj,
  },
  output: {
    serialize: (obj: unknown): unknown => {
      return JSON.parse(
        JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      );
    },
    deserialize: (obj: unknown) => obj,
  },
};

const rbacLogger = new Logger('RBAC');

/** RBAC_ENFORCE (default true; 'false' disables). Read per call so it can be toggled in tests. */
function rbacEnforced(): boolean {
  return (process.env.RBAC_ENFORCE ?? 'true').toLowerCase() !== 'false';
}
function rbacLogOnly(): boolean {
  return (process.env.RBAC_LOG_ONLY ?? '').toLowerCase() === 'true';
}

@Injectable()
export class TrpcService {
  private readonly t = initTRPC.context<TrpcContext>().create({
    transformer: bigIntTransformer,
  });

  constructor() {
    if (!rbacEnforced()) {
      rbacLogger.warn(
        'RBAC_ENFORCE=false: tRPC permission checks are DISABLED. Any authenticated user can call any procedure.',
      );
    } else if (rbacLogOnly()) {
      rbacLogger.warn('RBAC_LOG_ONLY=true: tRPC permission denials are logged but NOT enforced.');
    }
  }

  get router() {
    return this.t.router;
  }

  get procedure() {
    return this.t.procedure;
  }

  get middleware() {
    return this.t.middleware;
  }

  get mergeRouters() {
    return this.t.mergeRouters;
  }

  /** Authentication-only middleware (no RBAC). */
  private get authMiddleware() {
    return this.t.middleware(({ ctx, next }) => {
      if (!ctx.userId || !ctx.tenantId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }
      return next({
        ctx: {
          ...ctx,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        },
      });
    });
  }

  private deny(message: string, detail: string): void {
    if (rbacLogOnly()) {
      rbacLogger.warn(`[log-only] would deny: ${detail}`);
      return;
    }
    rbacLogger.warn(`denied: ${detail}`);
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }

  /**
   * Authenticated + RBAC derived from the procedure path (`router.sub.proc`):
   * module = first segment, action = read/write from the procedure name.
   * See ./rbac.ts for the rules.
   */
  get authedProcedure() {
    return this.t.procedure.use(this.authMiddleware).use(
      this.t.middleware(({ ctx, path, type, next }) => {
        if (rbacEnforced()) {
          const decision = evaluateProcedureAccess(path, type, ctx.userPermissions);
          if (!decision.allowed) {
            this.deny(
              'Insufficient permissions',
              `user=${ctx.userId} tenant=${ctx.tenantId} path=${path} required=${decision.required} (${decision.reason})`,
            );
          }
        }
        return next();
      }),
    );
  }

  /**
   * Explicit permission requirement ('module.resource.action' or 'module:action').
   * Replaces the automatic path-derived check for that procedure.
   */
  permissionProcedure(permission: string) {
    return this.t.procedure.use(this.authMiddleware).use(
      this.t.middleware(({ ctx, path, next }) => {
        if (rbacEnforced() && !hasExactPermission(ctx.userPermissions, permission)) {
          this.deny(
            `Missing required permission: ${permission}`,
            `user=${ctx.userId} tenant=${ctx.tenantId} path=${path} required=${permission}`,
          );
        }
        return next();
      }),
    );
  }
}

/** Convenience wrapper: permissionProcedure(trpcService, 'inventory.item.read'). */
export function permissionProcedure(trpc: TrpcService, permission: string) {
  return trpc.permissionProcedure(permission);
}
