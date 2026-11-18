import { describe, expect, it } from 'vitest';
import { runDemoFull as seedDemoFull } from '../../../../../../packages/db/src/demo-full/runner';
import { DemoSeedRefusal } from '../../../../../../packages/db/src/demo-full/load-context';
import { DemoSeedError, parseRunOptions, planAll, runPlans, type PlannedModule, type RunOptions } from '../../../../../../packages/db/src/demo-full/runner';
import type { ModulePlan } from '../../../../../../packages/db/src/demo-full/common';
import { FIXED_NOW, makeCtx, makeFakeDb } from './demo-full.fakedb';

const ENV = { TENANT_SLUG: 'techbeyond-jewellers', DOMAIN: 'erp.example.com' };
const NO_OPTS: RunOptions = { dry: false, only: null, skip: [] };
const hash = async () => 'hashed-staff-pw';

describe('parseRunOptions', () => {
  it('parses DRY_RUN, ONLY and SKIP with aliases and rejects unknown modules', () => {
    const r = parseRunOptions({ DRY_RUN: 'TRUE', ONLY: 'crm, Retail', SKIP: 'people' });
    expect(r).toEqual({ ok: true, options: { dry: true, only: ['crm', 'retail'], skip: ['peopleCommerce'] } });
    expect(parseRunOptions({})).toEqual({ ok: true, options: { dry: false, only: null, skip: [] } });
    const bad = parseRunOptions({ ONLY: 'crm,nope' });
    expect(bad.ok).toBe(false);
  });
});

describe('runPlans with small hand-made plans', () => {
  const plan = (name: string, ids: string[], extra: Partial<ModulePlan> = {}): PlannedModule => ({
    key: 'crm',
    plan: { name, sentinel: { model: 'widget', id: ids[0]! }, tables: [{ model: 'widget', rows: ids.map((id) => ({ id, tenantId: 't' })) }], stockDeltas: [], ...extra },
  });

  it('inserts only missing ids and chunks createMany', async () => {
    const f = makeFakeDb();
    f.store.widget = [{ id: 'w1', tenantId: 't' }];
    const ids = Array.from({ length: 600 }, (_, i) => `w${i + 1}`);
    const r = await runPlans(f.db, [plan('m', ids)], NO_OPTS);
    expect(r.total).toBe(599);
    expect(f.store.widget).toHaveLength(600);
    expect(f.stats.createManyCalls).toBe(3); // 599 rows / 250
    expect(r.modules[0]!.tables[0]).toMatchObject({ planned: 600, alreadyThere: 1, inserted: 599 });
  });

  it('applies stock deltas once (clamped at 0) and only on the first run', async () => {
    const f = makeFakeDb();
    const s1 = f.store.stockItem![0]!;
    const s2 = f.store.stockItem![1]!;
    const q1 = Number(s1.quantityOnHand);
    const p = plan('m', ['a1'], { stockDeltas: [{ stockItemId: String(s1.id), delta: -2 }, { stockItemId: String(s1.id), delta: 1 }, { stockItemId: String(s2.id), delta: -9999 }] });
    await runPlans(f.db, [p], NO_OPTS);
    expect(s1.quantityOnHand).toBe(q1 - 1);
    expect(s2.quantityOnHand).toBe(0);
    await runPlans(f.db, [p], NO_OPTS);
    expect(s1.quantityOnHand).toBe(q1 - 1);
  });

  it('names the module and table on failure and rolls the module back', async () => {
    const f = makeFakeDb();
    const good = plan('first', ['g1']);
    const bad: PlannedModule = {
      key: 'retail',
      plan: { name: 'second', sentinel: { model: 'gadget', id: 'x1' }, tables: [{ model: 'widget', rows: [{ id: 'k1' }] }, { model: 'gadget', rows: [{ id: 'x1' }] }], stockDeltas: [] },
    };
    f.failOn.model = 'gadget';
    await expect(runPlans(f.db, [good, bad], NO_OPTS)).rejects.toThrow(/module "second", table "gadget"/);
    expect(f.store.widget!.map((r) => r.id)).toEqual(['g1']); // first committed, second rolled back
    try {
      await runPlans(f.db, [bad], NO_OPTS);
    } catch (e) {
      expect(e).toBeInstanceOf(DemoSeedError);
      expect(String((e as Error).message)).not.toMatch(/password|mysql:\/\//i);
    }
  });
});

describe('full run against an in-memory catalog tenant', () => {
  it('dry run writes nothing but reports counts', async () => {
    const f = makeFakeDb();
    const before = JSON.stringify(Object.fromEntries(Object.entries(f.store).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.length])));
    const r = await seedDemoFull(f.db, { ...ENV, DRY_RUN: 'true' }, FIXED_NOW, hash);
    expect(r.report.dry).toBe(true);
    expect(r.report.total).toBeGreaterThan(300);
    expect(f.stats.transactions).toBe(0);
    expect(f.stats.createManyCalls).toBe(0);
    expect(JSON.stringify(Object.fromEntries(Object.entries(f.store).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.length])))).toBe(before);
  });

  it('first run inserts N rows in one transaction per module, second run inserts 0', async () => {
    const f = makeFakeDb();
    const first = await seedDemoFull(f.db, ENV, FIXED_NOW, hash);
    expect(first.report.total).toBeGreaterThan(300);
    const executed = first.report.modules.filter((m) => !m.skipped);
    expect(f.stats.transactions).toBe(executed.length);
    expect(executed.map((m) => m.name)).toEqual(expect.arrayContaining(['locations', 'crm', 'retail']));
    expect(f.store.sale!.length).toBeGreaterThan(50);
    expect(f.store.location!.some((l) => l.locationType === 'WORKSHOP')).toBe(true);
    const rowsAfterFirst = Object.fromEntries(Object.entries(f.store).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.length]));
    expect(first.report.total).toBe(Object.entries(rowsAfterFirst).reduce((a, [k, n]) => a + n - (BASE_COUNTS[k] ?? 0), 0));

    // no duplicate ids anywhere
    for (const [model, rows] of Object.entries(f.store)) {
      const ids = rows.map((r) => r.id).filter((x) => x !== undefined);
      expect(new Set(ids).size, model).toBe(ids.length);
    }

    const stock = f.store.stockItem!.reduce((a, s) => a + Number(s.quantityOnHand), 0);
    const second = await seedDemoFull(f.db, ENV, FIXED_NOW, hash);
    expect(second.report.total).toBe(0);
    expect(Object.fromEntries(Object.entries(f.store).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.length]))).toEqual(rowsAfterFirst);
    expect(f.store.stockItem!.reduce((a, s) => a + Number(s.quantityOnHand), 0)).toBe(stock);
    expect(f.store.stockItem!.every((s) => Number(s.quantityOnHand) >= 0)).toBe(true);
  });

  it('idempotent even when run on a later day (plan ids do not depend on live stock)', async () => {
    const f = makeFakeDb();
    await seedDemoFull(f.db, ENV, FIXED_NOW, hash);
    const again = await seedDemoFull(f.db, ENV, new Date(FIXED_NOW.getTime() + 3_600_000), hash);
    // same day, a bit later: nothing new may be planned
    expect(again.report.total).toBe(0);
  });

  it('ONLY and SKIP are respected', async () => {
    const only = makeFakeDb();
    const r1 = await seedDemoFull(only.db, { ...ENV, ONLY: 'crm' }, FIXED_NOW, hash);
    const names = r1.report.modules.filter((m) => !m.skipped).map((m) => m.name);
    expect(names).toEqual(['locations', 'crm']);
    expect(only.store.sale).toBeUndefined();
    expect(only.store.customer!.length).toBeGreaterThan(40);

    const skip = makeFakeDb();
    const r2 = await seedDemoFull(skip.db, { ...ENV, SKIP: 'retail,finance,ops,peopleCommerce' }, FIXED_NOW, hash);
    expect(r2.report.modules.filter((m) => !m.skipped).map((m) => m.name)).toEqual(['locations', 'crm']);
  });

  it('refuses a missing tenant, a missing catalog and bad options; never leaks the staff password', async () => {
    const f = makeFakeDb();
    await expect(seedDemoFull(f.db, { TENANT_SLUG: 'nope' }, FIXED_NOW, hash)).rejects.toThrow(/Tenant not found/);
    await expect(seedDemoFull(f.db, {}, FIXED_NOW, hash)).rejects.toThrow(DemoSeedRefusal);
    await expect(seedDemoFull(f.db, { ...ENV, ONLY: 'bogus' }, FIXED_NOW, hash)).rejects.toThrow(/unknown module/);
    await expect(seedDemoFull(f.db, { ...ENV, DEMO_STAFF_PASSWORD: 'short' }, FIXED_NOW, hash)).rejects.toThrow(/at least 8/);
    const empty = makeFakeDb();
    empty.store.product = [];
    await expect(seedDemoFull(empty.db, ENV, FIXED_NOW, hash)).rejects.toThrow(/seed-demo-catalog first/);
  });

  it('passes the staff password hash (never the password) to the planners', async () => {
    const f = makeFakeDb();
    const r = await seedDemoFull(f.db, { ...ENV, DEMO_STAFF_PASSWORD: 'Sup3r-secret-pw' }, FIXED_NOW, hash);
    expect(r.staffUsers).toBe(true);
    expect(JSON.stringify(f.store, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain('Sup3r-secret-pw');
    const ctx = await makeCtx({ staffPasswordHash: 'h' });
    expect(ctx.staffPasswordHash).toBe('h');
    expect((await makeCtx()).staffPasswordHash).toBeNull();
  });

  it('planAll is deterministic and FK-ordered by module', async () => {
    const ctx = await makeCtx();
    const ser = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
    const a = planAll(ctx);
    expect(ser(planAll(ctx))).toBe(ser(a));
    expect(a.map((m) => m.key)).toEqual(['locations', 'crm', 'retail', 'finance', 'ops', 'peopleCommerce']);
    for (const m of a) {
      expect(m.plan.tables.length, m.key).toBeGreaterThan(0);
      const sentinelTable = m.plan.tables.find((t) => t.model === m.plan.sentinel.model);
      expect(sentinelTable?.rows.some((r) => r.id === m.plan.sentinel.id), `${m.key} sentinel in plan`).toBe(true);
    }
  });
});

/** Rows the catalog fixture already has (per model), to compare with the insert total. */
const BASE_COUNTS: Record<string, number> = (() => {
  const f = makeFakeDb();
  return Object.fromEntries(Object.entries(f.store).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.length]));
})();
