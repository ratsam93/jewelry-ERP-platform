import { describe, it, expect, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { TrpcService } from '../trpc.service';
import { classifyAction, evaluateProcedureAccess } from '../rbac';

// Mirrors AuthService.extractPermissions applied to the REAL seed Role.permissions JSON.
function flatten(json: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(json)) for (const a of v) out.push(`${k}.${a}`);
  return out;
}
const ADMIN = flatten({ '*': ['create', 'read', 'update', 'delete'] }); // '*.create', ...
const ADMIN_BARE = ['*'];
const MANAGER = flatten({
  'inventory.*': ['create', 'read', 'update'],
  'retail.*': ['create', 'read', 'update'],
  'crm.*': ['create', 'read', 'update'],
  'reports.*': ['read'],
});
const SALES = flatten({
  'retail.sale': ['create', 'read'],
  'retail.estimate': ['create', 'read'],
  'inventory.stock': ['read'],
  'crm.customer': ['create', 'read', 'update'],
});
const ACCOUNTANT = flatten({ 'financial.*': ['create', 'read', 'update'], 'reports.*': ['read'] });

const ok = (path: string, perms: string[], type = 'query') =>
  evaluateProcedureAccess(path, type, perms).allowed;

describe('classifyAction', () => {
  it('classifies verbs', () => {
    expect(classifyAction('list')).toBe('read');
    expect(classifyAction('getById')).toBe('read');
    expect(classifyAction('searchItems')).toBe('read');
    expect(classifyAction('createInvoice')).toBe('write');
    expect(classifyAction('deactivate')).toBe('write');
    expect(classifyAction('weirdName', 'query')).toBe('read');
    expect(classifyAction('weirdName', 'mutation')).toBe('write');
  });
});

describe('evaluateProcedureAccess with seed roles', () => {
  it('admin (both shapes) is allowed everywhere incl. sensitive', () => {
    for (const a of [ADMIN, ADMIN_BARE]) {
      expect(ok('inventory.items.list', a)).toBe(true);
      expect(ok('platform.roles.create', a, 'mutation')).toBe(true);
      expect(ok('platform.users.assignRole', a, 'mutation')).toBe(true);
      expect(ok('unknownRouter.thing', a, 'mutation')).toBe(true);
    }
  });
  it('sales associate: allowed in own modules, denied elsewhere', () => {
    expect(ok('retail.sales.create', SALES, 'mutation')).toBe(true);
    expect(ok('retail.sales.list', SALES)).toBe(true);
    expect(ok('crm.customers.update', SALES, 'mutation')).toBe(true);
    expect(ok('inventory.items.list', SALES)).toBe(true);
    expect(ok('inventory.items.create', SALES, 'mutation')).toBe(false); // stock read only
    expect(ok('financial.invoices.list', SALES)).toBe(false);
    expect(ok('wholesale.orders.list', SALES)).toBe(false);
    expect(ok('search.global', SALES)).toBe(true);
    expect(ok('platform.branches.list', SALES)).toBe(true);
    expect(ok('platform.branches.create', SALES, 'mutation')).toBe(false);
  });
  it('manager: wildcard module perms, reports alias, no create on reporting', () => {
    expect(ok('inventory.items.create', MANAGER, 'mutation')).toBe(true);
    expect(ok('reporting.dashboard.summary', MANAGER)).toBe(true);
    expect(ok('reporting.dashboard.createWidget', MANAGER, 'mutation')).toBe(false);
    expect(ok('financial.invoices.list', MANAGER)).toBe(false);
  });
  it('accountant: financial + reports read only', () => {
    expect(ok('financial.invoices.create', ACCOUNTANT, 'mutation')).toBe(true);
    expect(ok('reporting.sales.report', ACCOUNTANT)).toBe(true);
    expect(ok('reporting.sales.create', ACCOUNTANT, 'mutation')).toBe(false);
    expect(ok('retail.sales.list', ACCOUNTANT)).toBe(false);
  });
  it('sensitive procedures need admin', () => {
    for (const p of [MANAGER, SALES, ACCOUNTANT]) {
      expect(ok('platform.roles.create', p, 'mutation')).toBe(false);
      expect(ok('platform.roles.assignToUser', p, 'mutation')).toBe(false);
      expect(ok('platform.roles.list', p)).toBe(false);
      expect(ok('platform.users.list', p)).toBe(false);
      expect(ok('platform.settings.set', p, 'mutation')).toBe(false);
    }
    // a custom role with explicit platform perms is still not admin-level
    expect(ok('platform.roles.create', ['platform.role.create'], 'mutation')).toBe(false);
    // self-service
    expect(ok('platform.users.changePassword', SALES, 'mutation')).toBe(true);
  });
  it('unmapped routers default to admin only', () => {
    expect(ok('chatbot.ask', MANAGER, 'mutation')).toBe(false);
    expect(ok('chatbot.ask', ADMIN, 'mutation')).toBe(true);
  });
  it('hardware and india mappings', () => {
    expect(ok('hardware.devices.list', SALES)).toBe(true);
    expect(ok('hardware.printer.print', SALES, 'mutation')).toBe(true);
    expect(ok('hardware.devices.list', ACCOUNTANT)).toBe(false);
    expect(ok('india.rates.getCurrent', SALES)).toBe(true);
    expect(ok('india.rates.getAll', SALES)).toBe(true);
    expect(ok('india.girvi.create', SALES, 'mutation')).toBe(false);
    expect(ok('india.girvi.list', SALES)).toBe(false);
    expect(ok('india.girvi.create', ACCOUNTANT, 'mutation')).toBe(true);
    expect(ok('india.rates.refreshNow', ACCOUNTANT, 'mutation')).toBe(false);
    expect(ok('india.rates.refreshNow', ADMIN, 'mutation')).toBe(true);
    expect(ok('payroll.runs.list', ACCOUNTANT)).toBe(true);
  });
  it('no permissions at all is denied', () => {
    expect(ok('retail.sales.list', [])).toBe(false);
    expect(ok('search.global', [])).toBe(false);
  });
});

describe('TrpcService enforcement', () => {
  const saved = { e: process.env.RBAC_ENFORCE, l: process.env.RBAC_LOG_ONLY };
  afterEach(() => {
    if (saved.e === undefined) delete process.env.RBAC_ENFORCE;
    else process.env.RBAC_ENFORCE = saved.e;
    if (saved.l === undefined) delete process.env.RBAC_LOG_ONLY;
    else process.env.RBAC_LOG_ONLY = saved.l;
  });

  const build = () => {
    const svc = new TrpcService();
    const router = svc.router({
      retail: svc.router({ sales: svc.router({ list: svc.authedProcedure.query(() => 'ok') }) }),
      platform: svc.router({ roles: svc.router({ create: svc.authedProcedure.mutation(() => 'made') }) }),
      explicit: svc.router({ x: svc.permissionProcedure('inventory.stock.adjust').mutation(() => 'adj') }),
    });
    return (perms: string[]) =>
      router.createCaller({ tenantId: 't', userId: 'u', userPermissions: perms });
  };

  it('allows admin, denies limited role with FORBIDDEN', async () => {
    const c = build();
    expect(await c(ADMIN).retail.sales.list()).toBe('ok');
    expect(await c(SALES).retail.sales.list()).toBe('ok');
    await expect(c(ACCOUNTANT).retail.sales.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(c(MANAGER).platform.roles.create()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await c(ADMIN).platform.roles.create()).toBe('made');
  });
  it('permissionProcedure is resource exact', async () => {
    const c = build();
    expect(await c(ADMIN).explicit.x()).toBe('adj');
    expect(await c(['inventory.stock.adjust']).explicit.x()).toBe('adj');
    expect(await c(['inventory.*.adjust']).explicit.x()).toBe('adj');
    await expect(c(['inventory.item.adjust']).explicit.x()).rejects.toBeInstanceOf(TRPCError);
    await expect(c(SALES).explicit.x()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('RBAC_LOG_ONLY allows denied calls', async () => {
    process.env.RBAC_LOG_ONLY = 'true';
    const c = build();
    expect(await c(ACCOUNTANT).retail.sales.list()).toBe('ok');
  });
  it('RBAC_ENFORCE=false disables checks', async () => {
    process.env.RBAC_ENFORCE = 'false';
    const c = build();
    expect(await c([]).platform.roles.create()).toBe('made');
  });
});
