import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrpcService } from '../trpc.service';
import {
  setMutationAuditSink,
  buildMutationAuditEvent,
  deriveEntity,
  classifyVerb,
  type MutationAuditEvent,
} from '../mutation-audit';
import { z } from 'zod';

const flush = () => new Promise((r) => setTimeout(r, 5));

describe('mutation audit', () => {
  const events: MutationAuditEvent[] = [];
  beforeEach(() => {
    events.length = 0;
    setMutationAuditSink((e) => {
      events.push(e);
    });
  });
  afterEach(() => setMutationAuditSink(null));

  it('maps verbs to actions and paths to entity types', () => {
    expect(classifyVerb('register')).toBe('created');
    expect(classifyVerb('remove')).toBe('deleted');
    expect(classifyVerb('updateTranslation')).toBe('updated');
    expect(deriveEntity('hardware.devices.register')).toEqual({
      entityType: 'hardware.devices',
      action: 'created',
    });
  });

  it('records a successful mutation with ids and whitelisted fields only', async () => {
    const svc = new TrpcService();
    const router = svc.router({
      hw: svc.router({
        register: svc.authedProcedure
          .input(z.object({ name: z.string(), password: z.string(), locationId: z.string() }))
          .mutation(() => ({ id: 'dev-1', name: 'Scale' })),
      }),
    });
    const caller = router.createCaller({ tenantId: 't1', userId: 'u1', userPermissions: ['*'] });
    await caller.hw.register({ name: 'Scale', password: 'hunter2', locationId: 'loc-1' });
    await flush();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId: 't1',
      userId: 'u1',
      entityType: 'hw',
      action: 'created',
      entityId: 'dev-1',
    });
    expect(JSON.stringify(events[0].newValues)).not.toContain('hunter2');
    expect(events[0].newValues.name).toBe('Scale');
  });

  it('does not record queries or failed mutations', async () => {
    const svc = new TrpcService();
    const router = svc.router({
      q: svc.authedProcedure.query(() => 1),
      m: svc.authedProcedure.mutation(() => {
        throw new Error('boom');
      }),
    });
    const caller = router.createCaller({ tenantId: 't1', userId: 'u1', userPermissions: ['*'] });
    await caller.q();
    await expect(caller.m()).rejects.toThrow();
    await flush();
    expect(events).toHaveLength(0);
  });

  it('never fails the request when the sink throws', async () => {
    setMutationAuditSink(() => Promise.reject(new Error('db down')));
    const svc = new TrpcService();
    const router = svc.router({ m: svc.authedProcedure.mutation(() => 'ok') });
    const caller = router.createCaller({ tenantId: 't1', userId: 'u1', userPermissions: ['*'] });
    await expect(caller.m()).resolves.toBe('ok');
    await flush();
  });

  it('skips audit-own paths and uses nested data/ids', () => {
    expect(
      buildMutationAuditEvent({ path: 'platform.audit.purge', tenantId: 't', rawInput: {}, output: {} }),
    ).toBeNull();
    const e = buildMutationAuditEvent({
      path: 'hardware.devices.update',
      tenantId: 't',
      rawInput: { deviceId: 'd-9', data: { name: 'X', token: 'abc' } },
      output: undefined,
    });
    expect(e?.entityId).toBe('d-9');
    expect(e?.action).toBe('updated');
    expect(e?.newValues.token).toBeUndefined();
  });

  it('never records password fields and skips password-reset mutations entirely', () => {
    const created = buildMutationAuditEvent({
      path: 'platform.users.create',
      tenantId: 't1',
      userId: 'u1',
      rawInput: { email: 'a@b.com', firstName: 'A', password: 'S3cret!Passw0rd', newPassword: 'x', currentPassword: 'y', roleId: 'r1' },
      output: { id: 'new-user' },
    });
    expect(created).not.toBeNull();
    const dump = JSON.stringify(created);
    expect(dump).not.toMatch(/S3cret|password|newPassword|currentPassword/i);
    expect(
      buildMutationAuditEvent({
        path: 'platform.users.setPassword',
        tenantId: 't1',
        rawInput: { userId: 'u', newPassword: 'S3cret!Passw0rd' },
        output: { success: true },
      }),
    ).toBeNull();
  });
});
