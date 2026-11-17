import { describe, it, expect, beforeEach } from 'vitest';
import { TrpcService } from '../trpc.service';
import { TRPCError } from '@trpc/server';

describe('TrpcService', () => {
  let service: TrpcService;

  beforeEach(() => {
    service = new TrpcService();
  });

  it('exposes a router builder function', () => {
    expect(typeof service.router).toBe('function');
  });

  it('exposes a base procedure builder', () => {
    expect(service.procedure).toBeDefined();
    // procedure should have .use, .input, .query, .mutation methods
    expect(typeof service.procedure.use).toBe('function');
  });

  it('exposes a mergeRouters function', () => {
    expect(typeof service.mergeRouters).toBe('function');
  });

  it('creates an authedProcedure that rejects when auth context is missing', async () => {
    // Build a minimal router using authedProcedure
    const router = service.router({
      testQuery: service.authedProcedure.query(({ ctx }) => {
        return { tenantId: ctx.tenantId, userId: ctx.userId };
      }),
    });

    const caller = router.createCaller({
      tenantId: undefined,
      userId: undefined,
    });

    await expect(caller.testQuery()).rejects.toThrow(TRPCError);
    await expect(caller.testQuery()).rejects.toThrow('Authentication required');
  });

  it('authedProcedure passes through when auth context is present', async () => {
    const router = service.router({
      testQuery: service.authedProcedure.query(({ ctx }) => {
        return { tenantId: ctx.tenantId, userId: ctx.userId };
      }),
    });

    const caller = router.createCaller({
      tenantId: 'tenant-1',
      userId: 'user-1',
      userRole: 'admin',
      userPermissions: ['*'],
    });

    const result = await caller.testQuery();
    expect(result.tenantId).toBe('tenant-1');
    expect(result.userId).toBe('user-1');
  });
});

describe('TrpcService principal separation', () => {
  const service = new TrpcService();
  const router = service.router({
    customerOnly: service.customerProcedure.query(({ ctx }) => ({ customerId: ctx.userId })),
    staffOnly: service.authedProcedure.query(({ ctx }) => ({ userId: ctx.userId })),
  });
  const staff = { tenantId: 't1', userId: 'staff-1', userPermissions: ['*'], principal: 'staff' as const };
  const customer = { tenantId: 't1', userId: 'cust-1', userPermissions: [], principal: 'customer' as const };

  it('customerProcedure rejects a staff token with FORBIDDEN', async () => {
    await expect(router.createCaller(staff).customerOnly()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('customerProcedure rejects legacy contexts without principal', async () => {
    const { principal: _p, ...legacy } = staff;
    await expect(router.createCaller(legacy).customerOnly()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('customerProcedure rejects unauthenticated with UNAUTHORIZED', async () => {
    await expect(router.createCaller({}).customerOnly()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('customerProcedure accepts a B2C customer token', async () => {
    await expect(router.createCaller(customer).customerOnly()).resolves.toEqual({ customerId: 'cust-1' });
  });
  it('authedProcedure rejects a customer token with FORBIDDEN', async () => {
    await expect(router.createCaller(customer).staffOnly()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('authedProcedure still accepts staff', async () => {
    await expect(router.createCaller(staff).staffOnly()).resolves.toEqual({ userId: 'staff-1' });
  });
});

describe('TrpcService anyPrincipalProcedure', () => {
  const service = new TrpcService();
  const router = service.router({
    either: service.anyPrincipalProcedure.query(({ ctx }) => ({ id: ctx.userId })),
  });
  it('accepts staff', async () => {
    await expect(
      router.createCaller({ tenantId: 't1', userId: 's1', userPermissions: ['*'], principal: 'staff' }).either(),
    ).resolves.toEqual({ id: 's1' });
  });
  it('accepts customer', async () => {
    await expect(
      router.createCaller({ tenantId: 't1', userId: 'c1', principal: 'customer' }).either(),
    ).resolves.toEqual({ id: 'c1' });
  });
  it('rejects no token', async () => {
    await expect(router.createCaller({}).either()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
