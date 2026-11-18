import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_RATE_RUPEES_PER_GRAM } from '../../../../../../packages/db/src/seed-demo-catalog-data';
import type { DemoContext, ModulePlan, Row } from '../../../../../../packages/db/src/demo-full/common';
import { planCustomers, type DemoCustomer } from '../../../../../../packages/db/src/demo-full/plan-crm';
import { OPS_COUNTS, planOps } from '../../../../../../packages/db/src/demo-full/plan-ops';
import { planRetail, type RetailResult } from '../../../../../../packages/db/src/demo-full/plan-retail';
import { FIXED_NOW, makeCtx } from './demo-full.fakedb';

const DAY = 86_400_000;

describe('demo-full ops planner', () => {
  let ctx: DemoContext;
  let customers: DemoCustomer[];
  let retail: RetailResult;
  let plan: ModulePlan;
  const rows = (m: string): Row[] => plan.tables.find((t) => t.model === m)?.rows ?? [];

  beforeAll(async () => {
    ctx = await makeCtx();
    customers = planCustomers(ctx);
    retail = planRetail(ctx, customers);
    plan = planOps(ctx, customers, retail);
  });

  it('has the intended row counts', () => {
    for (const m of ['metalStock', 'stoneStock', 'stockTransfer', 'stockTransferItem', 'stockTake', 'stockTakeItem'] as const) {
      expect(rows(m).length, m).toBe(OPS_COUNTS[m]);
    }
    for (const m of ['karigar', 'billOfMaterials', 'jobOrder', 'supplier', 'purchaseOrder', 'agentBroker', 'consignmentOut', 'consignmentIn'] as const) {
      expect(rows(m).length, m).toBeGreaterThanOrEqual(OPS_COUNTS[m]);
    }
  });

  it('is deterministic and has unique ids per table', () => {
    const again = planOps(ctx, customers, retail);
    expect(JSON.stringify(again, (_, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(
      JSON.stringify(plan, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
    for (const t of plan.tables) expect(new Set(t.rows.map((r) => r.id)).size, t.model).toBe(t.rows.length);
  });

  it('creates a movement row for every retail move exactly once', () => {
    const sales = rows('stockMovement').filter((r) => r.referenceType === 'RETAIL_SALE');
    expect(sales.length).toBe(retail.stockMoves.filter((m) => m.referenceType === 'RETAIL_SALE').length);
    expect(sales.every((r) => (r.quantityChange as number) < 0)).toBe(true);
  });

  it('references only existing stock items and never goes negative in the warehouse', () => {
    const items = new Map(rows('stockItem').map((r) => [r.id as string, r]));
    const showroomIds = new Set(ctx.products.map((p) => p.showroomStockId).filter(Boolean));
    const sumBy = new Map<string, number>();
    for (const m of rows('stockMovement')) {
      const id = m.stockItemId as string;
      expect(items.has(id) || showroomIds.has(id), id).toBe(true);
      sumBy.set(id, (sumBy.get(id) ?? 0) + (m.quantityChange as number));
    }
    for (const [id, it] of items) {
      if (it.locationId === ctx.warehouse.id) {
        expect(it.quantityOnHand).toBe(sumBy.get(id) ?? 0);
        expect(it.quantityOnHand as number).toBeGreaterThanOrEqual(0);
      }
    }
    const deltas = new Map<string, number>();
    for (const d of plan.stockDeltas) deltas.set(d.stockItemId, (deltas.get(d.stockItemId) ?? 0) + d.delta);
    for (const id of showroomIds) expect(deltas.get(id as string) ?? 0).toBe(sumBy.get(id as string) ?? 0);
  });

  it('keeps transfers consistent with their status and lines', () => {
    const items = rows('stockTransferItem');
    const moves = rows('stockMovement').filter((r) => r.referenceType === 'STOCK_TRANSFER');
    for (const t of rows('stockTransfer')) {
      const lines = items.filter((i) => i.stockTransferId === t.id);
      expect(lines.length).toBeGreaterThan(0);
      const out = moves.filter((m) => m.referenceId === t.id && (m.quantityChange as number) < 0).length;
      const inn = moves.filter((m) => m.referenceId === t.id && (m.quantityChange as number) > 0).length;
      for (const l of lines) {
        if (t.status === 'RECEIVED') expect([l.quantitySent, l.quantityReceived]).toEqual([l.quantityRequested, l.quantityRequested]);
        if (t.status === 'IN_TRANSIT') expect([l.quantitySent, l.quantityReceived]).toEqual([l.quantityRequested, 0]);
        if (t.status === 'DRAFT') expect([l.quantitySent, l.quantityReceived]).toEqual([0, 0]);
      }
      expect(out).toBe(t.status === 'DRAFT' ? 0 : lines.length);
      expect(inn).toBe(t.status === 'RECEIVED' ? lines.length : 0);
    }
    expect(rows('stockTransfer').map((t) => t.status).sort()).toEqual(['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'RECEIVED']);
  });

  it('computes stock take variances and posts adjustments only when completed', () => {
    const takes = rows('stockTake');
    for (const it of rows('stockTakeItem')) {
      if (it.countedQuantity === null) expect(it.varianceQuantity).toBeNull();
      else expect(it.varianceQuantity).toBe((it.countedQuantity as number) - (it.systemQuantity as number));
      expect(it.countedQuantity === null || (it.countedQuantity as number) >= 0).toBe(true);
    }
    for (const t of takes) {
      const adj = rows('stockMovement').filter((m) => m.referenceType === 'STOCK_TAKE' && m.referenceId === t.id);
      const withVar = rows('stockTakeItem').filter((i) => i.stockTakeId === t.id && i.varianceQuantity);
      if (t.status === 'COMPLETED') {
        expect(adj.length).toBe(withVar.length);
        expect(withVar.length).toBeGreaterThan(0);
        expect((t.completedAt as Date).getTime()).toBeGreaterThanOrEqual((t.startedAt as Date).getTime());
      } else expect(adj.length).toBe(0);
    }
  });

  it('values metal stock at the ctx rate and validates certificates', () => {
    expect(new Set(rows('metalStock').map((r) => r.locationId))).toEqual(new Set([ctx.warehouse.id, ctx.showroom.id]));
    for (const m of rows('metalStock')) {
      const rate = BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM[`${m.metalType}_${m.purityFineness}`]! * 100));
      const exact = (rate * (m.weightMg as bigint)) / 1000n;
      const diff = (m.valuePaise as bigint) - exact;
      expect(diff === 0n || diff === 1n).toBe(true);
    }
    for (const s of rows('stoneStock')) {
      expect(s.totalWeightMg).toBeGreaterThan(0n);
      if (s.origin === 'NATURAL') expect(s.growthMethod).toBe('NONE');
      else expect(s.growthMethod).not.toBe('NONE');
      if (s.reportLab === 'GIA') expect(s.certificationNumber).toMatch(/^\d{10}$/);
      else if (s.reportLab === 'IGI') expect(s.certificationNumber).toMatch(/^(LG\d{9}|\d{9})$/);
      else expect(s.certificationNumber).toBeNull();
    }
    const certs = rows('stoneStock').map((s) => s.certificationNumber).filter(Boolean);
    expect(certs.length).toBeGreaterThanOrEqual(6);
    expect(new Set(certs).size).toBe(certs.length);
  });

  it('keeps all dates within the last ~120 days and not in the future', () => {
    const dateKeys = ['movedAt', 'createdAt', 'startedAt', 'completedAt'];
    for (const t of plan.tables.filter((x) => ['stockMovement', 'stockTransfer', 'stockTake', 'stockItem'].includes(x.model))) {
      for (const r of t.rows) {
        for (const k of dateKeys) {
          const d = r[k];
          if (d instanceof Date) {
            expect(d.getTime(), `${t.model}.${k}`).toBeLessThanOrEqual(FIXED_NOW.getTime());
            expect(d.getTime(), `${t.model}.${k}`).toBeGreaterThan(FIXED_NOW.getTime() - 120 * DAY);
          }
        }
      }
    }
  });
});
