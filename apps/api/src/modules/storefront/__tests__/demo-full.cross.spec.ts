/**
 * Cross-module consistency of the whole demo plan (all planners on one ctx): determinism, idempotency against a
 * database that already holds the plan, stock arithmetic, customer chronology, dates, dashboard totals, counts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { DemoContext, Row } from '../../../../../../packages/db/src/demo-full/common';
import { formatReport, parseRunOptions, planAll, runDemoFull, runPlans, type PlannedModule } from '../../../../../../packages/db/src/demo-full/runner';
import { loadDemoContext, type Db } from '../../../../../../packages/db/src/demo-full/load-context';
import { FIXED_NOW, makeCtx, makeFakeDb } from './demo-full.fakedb';

const DAY = 86_400_000;
const json = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
const asStr = (v: unknown): string => String(v);

function tablesOf(mods: PlannedModule[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const p of mods) for (const t of p.plan.tables) m.set(t.model, [...(m.get(t.model) ?? []), ...t.rows]);
  return m;
}

describe('demo-full whole plan', () => {
  let ctx: DemoContext;
  let mods: PlannedModule[];
  let rows: Map<string, Row[]>;
  const R = (m: string): Row[] => rows.get(m) ?? [];

  beforeAll(async () => {
    ctx = await makeCtx();
    mods = planAll(ctx);
    rows = tablesOf(mods);
  });

  it('planAll is deterministic', () => {
    expect(json(planAll(ctx))).toBe(json(mods));
  });

  it('ids are unique per delegate', () => {
    for (const [model, list] of rows) {
      const ids = list.map((r) => r.id).filter((x) => x !== undefined);
      expect(new Set(ids).size, model).toBe(ids.length);
    }
  });

  it('a database that already holds the plan yields the same ids and nothing new (idempotent, stock not applied twice)', async () => {
    const f = makeFakeDb();
    const hash = async () => 'x';
    const env = { TENANT_SLUG: 'techbeyond-jewellers', DOMAIN: 'erp.example.com' };
    const r1 = await runDemoFull(f.db as Db, env, FIXED_NOW, hash);
    expect(r1.report.total).toBeGreaterThan(1000);
    const stock1 = JSON.stringify((f.store.stockItem ?? []).map((s) => [s.id, s.quantityOnHand]));
    const ctx2 = await loadDemoContext(f.db as Db, { slug: 'techbeyond-jewellers', now: FIXED_NOW, env: { DOMAIN: 'erp.example.com' } });
    // qty0 comes from the catalog spec, not the live (already adjusted) stock rows
    expect(ctx2.products.map((p) => p.qty0)).toEqual(ctx.products.map((p) => p.qty0));
    const mods2 = planAll(ctx2);
    for (const [model, list] of tablesOf(mods2)) {
      const first = new Set(R(model).map((r) => r.id));
      for (const r of list) if (r.id !== undefined) expect(first.has(r.id), `${model} ${asStr(r.id)} is new on the second plan`).toBe(true);
    }
    const r2 = await runDemoFull(f.db as Db, env, FIXED_NOW, hash);
    expect(r2.report.total).toBe(0);
    expect(r2.report.modules.reduce((a, m) => a + m.stockDeltasApplied, 0)).toBe(0);
    expect(JSON.stringify((f.store.stockItem ?? []).map((s) => [s.id, s.quantityOnHand]))).toBe(stock1);
  });

  it('stock: never negative across all planners, deltas = movements, one movement per source event', () => {
    const qty0 = new Map<string, number>();
    for (const p of ctx.products) if (p.showroomStockId) qty0.set(p.showroomStockId, p.qty0);
    const delta = new Map<string, number>();
    for (const m of mods) for (const d of m.plan.stockDeltas) delta.set(d.stockItemId, (delta.get(d.stockItemId) ?? 0) + d.delta);
    for (const [id, d] of delta) {
      expect(qty0.has(id), `delta targets unknown stock item ${id}`).toBe(true);
      expect(qty0.get(id)! + d, `final stock of ${id}`).toBeGreaterThanOrEqual(0);
    }
    const moveSum = new Map<string, number>();
    for (const r of R('stockMovement')) moveSum.set(asStr(r.stockItemId), (moveSum.get(asStr(r.stockItemId)) ?? 0) + Number(r.quantityChange));
    const newItems = new Map(R('stockItem').map((r) => [asStr(r.id), Number(r.quantityOnHand)]));
    for (const [id, sum] of moveSum) {
      if (newItems.has(id)) expect(newItems.get(id), `new stock item ${id}`).toBe(Math.max(0, sum));
      else expect(delta.get(id) ?? 0, `existing stock item ${id}`).toBe(sum);
    }
    for (const id of delta.keys()) if (!newItems.has(id)) expect(moveSum.has(id), `delta without movements ${id}`).toBe(true);
    // each movement is a distinct source event; a retail sale emits one OUT per line item
    const seen = new Set<string>();
    for (const r of R('stockMovement')) {
      if (r.referenceType === 'RETAIL_SALE') continue;
      const key = [r.stockItemId, r.movementType, r.referenceType, r.referenceId, r.notes, asStr(r.movedAt)].join('|');
      expect(seen.has(key), `duplicate stock movement ${key}`).toBe(false);
      seen.add(key);
    }
    const outs = new Map<string, number>();
    for (const r of R('stockMovement')) if (r.referenceType === 'RETAIL_SALE') outs.set(`${asStr(r.referenceId)}|${asStr(r.stockItemId)}`, (outs.get(`${asStr(r.referenceId)}|${asStr(r.stockItemId)}`) ?? 0) + 1);
    const stockOf = new Map(ctx.products.map((p) => [p.id, p.showroomStockId]));
    const lines = new Map<string, number>();
    const saleStatus = new Map(R('sale').map((s) => [asStr(s.id), s.status]));
    for (const l of R('saleLineItem')) {
      if (!saleStatus.has(asStr(l.saleId))) continue;
      const k = `${asStr(l.saleId)}|${asStr(stockOf.get(asStr(l.productId)))}`;
      lines.set(k, (lines.get(k) ?? 0) + 1);
    }
    for (const [k, n] of outs) expect(n, `retail movements for ${k}`).toBe(lines.get(k));
  });

  it('a customer exists before any of their activity', () => {
    const created = new Map(R('customer').map((c) => [asStr(c.id), (c.createdAt as Date).getTime()]));
    let checked = 0;
    for (const [model, list] of rows) {
      if (model === 'customer') continue;
      for (const r of list) {
        const cid = r.customerId;
        const at = r.createdAt;
        if (typeof cid !== 'string' || !(at instanceof Date) || !created.has(cid)) continue;
        expect(at.getTime(), `${model} ${asStr(r.id)} predates its customer`).toBeGreaterThanOrEqual(created.get(cid)!);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('timestamps are not in the future and transactional dates stay within ~120 days, heavier recently', () => {
    const now = ctx.now.getTime();
    const stamps = ['createdAt', 'updatedAt', 'movedAt', 'placedAt', 'paidAt', 'deliveredAt', 'shippedAt', 'processedAt', 'sentAt', 'completedAt'];
    for (const [model, list] of rows) {
      for (const r of list) {
        for (const k of stamps) {
          const v = r[k];
          if (v instanceof Date) expect(v.getTime(), `${model}.${k} of ${asStr(r.id)}`).toBeLessThanOrEqual(now);
        }
      }
    }
    for (const model of ['sale', 'invoice', 'payment', 'onlineOrder', 'stockMovement', 'journalEntry']) {
      const times = R(model).map((r) => ((r.createdAt ?? r.movedAt) as Date).getTime());
      expect(times.length, model).toBeGreaterThan(10);
      expect(Math.min(...times), model).toBeGreaterThanOrEqual(now - 125 * DAY);
    }
    const sales = R('sale').map((r) => (r.createdAt as Date).getTime());
    expect(sales.filter((t) => t >= now - 30 * DAY).length / sales.length).toBeGreaterThan(0.3);
  });

  it('dashboard totals: sales this and last month, paid + outstanding invoices, not-yet-due bucket, jobs in every status, payslips', () => {
    const month = (d: Date) => d.getFullYear() * 12 + d.getMonth();
    const cur = month(ctx.now);
    const sales = R('sale').filter((s) => s.status === 'COMPLETED');
    expect(sales.filter((s) => month(s.createdAt as Date) === cur).length).toBeGreaterThan(5);
    expect(sales.filter((s) => month(s.createdAt as Date) === cur - 1).length).toBeGreaterThan(5);
    const inv = R('invoice');
    const open = (i: Row) => (i.paidPaise as bigint) < (i.totalPaise as bigint) && i.status !== 'CANCELLED' && i.status !== 'DRAFT';
    expect(inv.some((i) => i.status === 'PAID')).toBe(true);
    expect(inv.some((i) => i.dueDate instanceof Date && i.dueDate.getTime() > ctx.now.getTime() && open(i))).toBe(true);
    expect(inv.some((i) => i.dueDate instanceof Date && i.dueDate.getTime() < ctx.now.getTime() && open(i))).toBe(true);
    const jobStatuses = new Set(R('jobOrder').map((j) => asStr(j.status)));
    for (const s of ['DRAFT', 'PLANNED', 'MATERIAL_ISSUED', 'IN_PROGRESS', 'QC_PENDING', 'QC_PASSED', 'COMPLETED', 'CANCELLED']) expect(jobStatuses.has(s), `job status ${s}`).toBe(true);
    const ends = R('payrollPeriod').map((p) => (p.endDate as Date).getTime()).sort((a, b) => b - a);
    expect(ends.length).toBeGreaterThanOrEqual(2);
    expect(ends[1]!).toBeGreaterThan(ctx.now.getTime() - 100 * DAY);
    expect(R('payslip').length).toBeGreaterThan(10);
  });

  it('every business number is unique per model', () => {
    const numberCols = ['saleNumber', 'invoiceNumber', 'paymentNumber', 'entryNumber', 'orderNumber', 'jobNumber', 'poNumber', 'purchaseNumber', 'returnNumber', 'grNumber', 'transferNumber'];
    for (const [model, list] of rows) {
      for (const col of numberCols) {
        const vals = list.map((r) => r[col]).filter((v): v is string => typeof v === 'string');
        if (vals.length) expect(new Set(vals).size, `${model}.${col}`).toBe(vals.length);
      }
    }
  });

  it('prints per-module row counts of a dry run', async () => {
    const f = makeFakeDb();
    const opts = parseRunOptions({ DRY_RUN: 'true' });
    if (!opts.ok) throw new Error(opts.error);
    const ctx3 = await loadDemoContext(f.db as Db, { slug: 'techbeyond-jewellers', now: FIXED_NOW, env: { DOMAIN: 'erp.example.com' } });
    const report = await runPlans(f.db as Db, planAll(ctx3), opts.options);
    expect(report.total).toBeGreaterThan(1000);
    for (const line of formatReport(report, ctx3.slug).filter((l) => !l.startsWith('    '))) console.warn(line);
  });
});
