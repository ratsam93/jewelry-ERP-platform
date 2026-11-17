import { describe, it, expect } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TRPCError } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { TrpcService } from '../trpc.service';

function prismaError(code: string) {
  const e = new Error(
    'Invalid `this.prisma.customer.findFirstOrThrow()` invocation in C:/srv/crm.service.ts:28:49',
  );
  e.name = 'PrismaClientKnownRequestError';
  (e as unknown as { code: string }).code = code;
  return e;
}

const ctx = { tenantId: 't1', userId: 'u1', userPermissions: ['*'] };

function build(thrower: () => never) {
  const svc = new TrpcService();
  const router = svc.router({
    boom: svc.procedure.query(() => thrower()),
    authedBoom: svc.authedProcedure.query(() => thrower()),
  });
  return router.createCaller(ctx);
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(TRPCError);
    return e as TRPCError;
  }
  throw new Error('did not throw');
}

describe('tRPC error mapping', () => {
  it.each([
    ['P2025', 'NOT_FOUND', 'Not found'],
    ['P2002', 'CONFLICT', 'Already exists'],
    ['P2003', 'BAD_REQUEST', 'Invalid reference'],
    ['P2014', 'BAD_REQUEST', 'Invalid reference'],
  ])('maps Prisma %s', async (pc, code, msg) => {
    const e = await codeOf(
      build(() => {
        throw prismaError(pc);
      }).authedBoom(),
    );
    expect(e.code).toBe(code);
    expect(e.message).toBe(msg);
  });

  it.each([
    [new NotFoundException('nope'), 'NOT_FOUND'],
    [new ForbiddenException('no'), 'FORBIDDEN'],
    [new UnauthorizedException('who'), 'UNAUTHORIZED'],
    [new ConflictException('dup'), 'CONFLICT'],
    [new UnprocessableEntityException('bad'), 'UNPROCESSABLE_CONTENT'],
  ])('maps Nest exception %#', async (ex, code) => {
    const e = await codeOf(
      build(() => {
        throw ex;
      }).boom(),
    );
    expect(e.code).toBe(code);
  });

  it('preserves BadRequestException string message', async () => {
    const e = await codeOf(
      build(() => {
        throw new BadRequestException('Quantity must be positive');
      }).authedBoom(),
    );
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.message).toBe('Quantity must be positive');
  });

  it('passes existing TRPCErrors through untouched', async () => {
    const e = await codeOf(
      build(() => {
        throw new TRPCError({ code: 'CONFLICT', message: 'mine' });
      }).boom(),
    );
    expect(e.code).toBe('CONFLICT');
    expect(e.message).toBe('mine');
  });

  it('unknown Prisma/Error is INTERNAL_SERVER_ERROR with generic message', async () => {
    const e = await codeOf(
      build(() => {
        throw prismaError('P9999');
      }).boom(),
    );
    expect(e.code).toBe('INTERNAL_SERVER_ERROR');
    expect(e.message).toBe('Internal server error');
  });

  it('unknown Error hides raw message outside dev/test', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const e = await codeOf(
        build(() => {
          throw new Error('secret detail at C:/x/y.ts');
        }).boom(),
      );
      expect(e.code).toBe('INTERNAL_SERVER_ERROR');
      expect(e.message).toBe('Internal server error');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('auth is still enforced and errorFormatter strips stack', async () => {
    const svc = new TrpcService();
    const router = svc.router({ a: svc.authedProcedure.query(() => 1) });
    const e = await codeOf(router.createCaller({}).a());
    expect(e.code).toBe('UNAUTHORIZED');
    const shape = (
      svc as unknown as { t: { _config: { errorFormatter: (o: unknown) => { data: Record<string, unknown> } } } }
    ).t._config.errorFormatter({
      shape: { message: 'x', code: -1, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500, stack: 'at C:/a.ts', path: 'a' } },
    });
    expect(shape.data.stack).toBeUndefined();
    expect(shape.data.httpStatus).toBe(500);
  });

  describe('output serializer', () => {
    const svc = new TrpcService();
    const router = svc.router({
      none: svc.authedProcedure.mutation(() => undefined),
      big: svc.authedProcedure.query(() => 5n),
      nul: svc.authedProcedure.query(() => null),
      nested: svc.authedProcedure.query(() => ({ a: [{ n: 1n }], b: { c: 2n, d: 'x' } })),
    });
    const call = async (proc: string, method: 'GET' | 'POST') => {
      const res = await fetchRequestHandler({
        endpoint: '/trpc',
        req: new Request(`http://localhost/trpc/${proc}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? 'null' : undefined }),
        router,
        createContext: () => ctx,
      });
      return { status: res.status, body: await res.json() };
    };

    it('void mutation succeeds over HTTP (no 500)', async () => {
      const r = await call('none', 'POST');
      expect(r.status).toBe(200);
      expect(r.body.result.data).toBeUndefined();
    });
    it('void mutation resolves via caller', async () => {
      await expect(router.createCaller(ctx).none()).resolves.toBeUndefined();
    });
    it('BigInt becomes a decimal string, null stays null, nested converts', async () => {
      expect((await call('big', 'GET')).body.result.data).toBe('5');
      expect((await call('nul', 'GET')).body.result.data).toBeNull();
      expect((await call('nested', 'GET')).body.result.data).toEqual({
        a: [{ n: '1' }],
        b: { c: '2', d: 'x' },
      });
    });
  });
});

describe('WhatsApp not configured mapping', () => {
  it('maps to PRECONDITION_FAILED without leaking the tenant id', async () => {
    const { WhatsAppNotConfiguredError } = await import('../../modules/crm/whatsapp.service');
    const err = await codeOf(
      build(() => {
        throw new WhatsAppNotConfiguredError('tenant-secret-id');
      }).authedBoom(),
    );
    expect(err.code).toBe('PRECONDITION_FAILED');
    expect(err.message).not.toContain('tenant-secret-id');
  });
});
