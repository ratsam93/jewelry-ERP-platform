import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { initTRPC, TRPCError } from '@trpc/server';
import { evaluateProcedureAccess, hasExactPermission } from './rbac';

export { evaluateProcedureAccess, hasExactPermission } from './rbac';

export interface TrpcContext {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  userPermissions?: string[];
  /**
   * Who the bearer token belongs to. Undefined is treated as staff (legacy
   * callers/tests). For `customer`, `userId` is the B2C customerId.
   */
  principal?: 'staff' | 'customer';
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
      // JSON.stringify(undefined) returns undefined (void mutations); JSON.parse
      // of that throws '"undefined" is not valid JSON'. Pass undefined through;
      // tRPC's envelope serializer simply omits the `data` key.
      const json = JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      return json === undefined ? undefined : JSON.parse(json);
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

const errorLogger = new Logger('TrpcErrors');

type TrpcCode = TRPCError['code'];

function exposeRawErrors(): boolean {
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test';
}

/** Maps NestJS HttpException subclasses / Prisma known errors to a TRPCError, or null. */
function mapKnownError(err: unknown): TRPCError | null {
  if (err instanceof TRPCError) return err;
  if (!err || typeof err !== 'object') return null;
  const e = err as { name?: string; code?: unknown; message?: string };

  // Prisma known request errors (duck-typed so it works across client copies).
  if (e.name === 'PrismaClientKnownRequestError' && typeof e.code === 'string') {
    switch (e.code) {
      case 'P2025':
        return new TRPCError({ code: 'NOT_FOUND', message: 'Not found', cause: err });
      case 'P2002':
        return new TRPCError({ code: 'CONFLICT', message: 'Already exists', cause: err });
      case 'P2003':
      case 'P2014':
        return new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid reference', cause: err });
      default:
        return null;
    }
  }

  // Tenant integration not configured: a client-correctable precondition, and
  // the original message embeds the tenant id, so never forward it.
  if (e.name === 'WhatsAppNotConfiguredError') {
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'WhatsApp is not configured for this account',
      cause: err,
    });
  }

  const authored = (code: TrpcCode, fallback: string) => {
    const response = err instanceof HttpException ? err.getResponse() : undefined;
    const raw = typeof response === 'string' ? response : e.message;
    return new TRPCError({
      code,
      message: typeof raw === 'string' && raw ? raw : fallback,
      cause: err,
    });
  };
  if (err instanceof NotFoundException) return authored('NOT_FOUND', 'Not found');
  if (err instanceof BadRequestException) return authored('BAD_REQUEST', 'Bad request');
  if (err instanceof ForbiddenException) return authored('FORBIDDEN', 'Forbidden');
  if (err instanceof UnauthorizedException) return authored('UNAUTHORIZED', 'Unauthorized');
  if (err instanceof ConflictException) return authored('CONFLICT', 'Already exists');
  if (err instanceof UnprocessableEntityException) {
    return authored('UNPROCESSABLE_CONTENT', 'Unprocessable');
  }
  return null;
}

/** Converts any thrown value into a safe TRPCError (never leaks raw internals). */
function toSafeError(err: unknown): TRPCError {
  const mapped = mapKnownError(err);
  if (mapped) return mapped;
  const name = (err as { name?: string } | null)?.name ?? '';
  const raw = err instanceof Error ? err.message : String(err);
  const isPrisma = name.startsWith('PrismaClient');
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: exposeRawErrors() && !isPrisma ? raw : 'Internal server error',
    cause: err,
  });
}

@Injectable()
export class TrpcService {
  private readonly t = initTRPC.context<TrpcContext>().create({
    transformer: bigIntTransformer,
    isDev: false,
    errorFormatter({ shape }) {
      // Never ship stack traces (absolute server paths) to clients.
      const data = { ...shape.data } as Record<string, unknown>;
      delete data.stack;
      return { ...shape, data: data as typeof shape.data };
    },
  });

  /** Outermost middleware: normalizes service-layer errors into TRPCErrors. */
  private get errorMappingMiddleware() {
    return this.t.middleware(async ({ path, type, next }) => {
      const handle = (err: unknown): never => {
        if (err instanceof TRPCError && !(err.cause && err.code === 'INTERNAL_SERVER_ERROR')) {
          throw err;
        }
        const original = err instanceof TRPCError ? err.cause : err;
        const safe = toSafeError(original ?? err);
        const isServerFault = safe.code === 'INTERNAL_SERVER_ERROR';
        const detail = original instanceof Error ? (original.stack ?? original.message) : String(original);
        if (isServerFault) {
          errorLogger.error(`${type} ${path} failed: ${detail}`);
        } else {
          errorLogger.debug(`${type} ${path} -> ${safe.code}: ${detail}`);
        }
        throw safe;
      };
      let result;
      try {
        result = await next();
      } catch (err) {
        return handle(err);
      }
      if (!result.ok) return handle(result.error);
      return result;
    });
  }

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
    return this.t.procedure.use(this.errorMappingMiddleware);
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
      if (ctx.principal === 'customer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Staff access required' });
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

  /**
   * Customer-facing procedures: require a verified B2C customer token. Staff
   * tokens are rejected (FORBIDDEN) so staff ids are never used as customer ids.
   * `ctx.userId` is the B2C customerId. No staff RBAC applies.
   */
  get customerProcedure() {
    return this.procedure.use(
      this.t.middleware(({ ctx, next }) => {
        if (!ctx.userId || !ctx.tenantId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
        }
        if (ctx.principal !== 'customer') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
        }
        return next({ ctx: { ...ctx, tenantId: ctx.tenantId, userId: ctx.userId } });
      }),
    );
  }

  /**
   * Read-only procedures usable by either principal (staff or B2C customer).
   * Requires a valid token. Staff keep the path-derived RBAC check; customers
   * skip RBAC (they have no staff permissions).
   */
  get anyPrincipalProcedure() {
    return this.procedure.use(
      this.t.middleware(({ ctx, path, type, next }) => {
        if (!ctx.userId || !ctx.tenantId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
        }
        if (ctx.principal !== 'customer' && rbacEnforced()) {
          const decision = evaluateProcedureAccess(path, type, ctx.userPermissions);
          if (!decision.allowed) {
            this.deny(
              'Insufficient permissions',
              `user=${ctx.userId} tenant=${ctx.tenantId} path=${path} required=${decision.required} (${decision.reason})`,
            );
          }
        }
        return next({ ctx: { ...ctx, tenantId: ctx.tenantId, userId: ctx.userId } });
      }),
    );
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
    return this.procedure.use(this.authMiddleware).use(
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
    return this.procedure.use(this.authMiddleware).use(
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
