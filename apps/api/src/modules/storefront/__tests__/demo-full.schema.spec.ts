/**
 * Validates EVERY planned row of EVERY planner against the generated Prisma data model (DMMF):
 * known columns, required columns, enum values, scalar types, unique keys, and foreign keys.
 * Requires the generated client (`pnpm --filter @caratflow/db db:generate`).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { DemoContext } from '../../../../../../packages/db/src/demo-full/common';
import { planAll, type PlannedModule } from '../../../../../../packages/db/src/demo-full/runner';
import { datamodel, validatePlans } from '../../../../../../packages/db/src/demo-full/validate-plan';
import { makeCtx, makeFakeDb } from './demo-full.fakedb';

type Fld = { name: string; kind: string; type: string; isList: boolean };
const models = (datamodel as unknown as { models: Array<{ name: string; fields: Fld[] }> }).models;
const modelByDelegate = new Map(models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), m]));

describe('demo-full plans match the Prisma schema', () => {
  let ctx: DemoContext;
  let modules: PlannedModule[];
  beforeAll(async () => {
    ctx = await makeCtx();
    modules = planAll(ctx);
  });

  it('passes the DMMF validation (columns, enums, types, uniques, foreign keys)', () => {
    const existing = makeFakeDb().store;
    const ids = new Map<string, Set<unknown>>();
    const isExternal = (model: string, field: string, value: unknown): boolean => {
      const k = `${model}.${field}`;
      let s = ids.get(k);
      if (!s) {
        const key = model.charAt(0).toLowerCase() + model.slice(1);
        s = new Set((existing[key] ?? []).map((r) => r[field]));
        ids.set(k, s);
      }
      return s.has(value) || (model === 'User' && value === ctx.adminUserId) || (model === 'Tenant' && value === ctx.tenantId);
    };
    const errors = validatePlans(modules.map((m) => m.plan), { isExternal });
    expect(errors).toEqual([]);
  });

  it('Json columns hold plain objects/arrays and no table is unknown', () => {
    for (const m of modules) {
      for (const t of m.plan.tables) {
        const model = modelByDelegate.get(t.model);
        expect(model, `unknown delegate ${t.model}`).toBeDefined();
        const jsonCols = model!.fields.filter((f) => f.type === 'Json').map((f) => f.name);
        for (const row of t.rows) {
          for (const c of jsonCols) {
            const v = row[c];
            if (v === undefined || v === null) continue;
            expect(typeof v === 'object' && !(v instanceof Date) && typeof v !== 'bigint', `${t.model}.${c}`).toBe(true);
          }
        }
      }
    }
  });

  it('stock deltas target existing stock items', () => {
    const stock = new Set((makeFakeDb().store.stockItem ?? []).map((r) => r.id));
    for (const m of modules) for (const d of m.plan.stockDeltas) expect(stock.has(d.stockItemId), d.stockItemId).toBe(true);
  });
});
