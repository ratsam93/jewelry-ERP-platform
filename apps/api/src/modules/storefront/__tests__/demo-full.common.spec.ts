import { beforeAll, describe, expect, it } from 'vitest';
import {
  PhoneBook, Rng, Sequencer, bsum, daysAgoAt, eid, fakeAadhaar, fakeGstin, fakePan, rateFactor, roundDiv, roundToRupee,
  spreadDayOffsets, startOfDay, yymm, type DemoContext, type Row, type TablePlan,
} from '../../../../../../packages/db/src/demo-full/common';
import { CUSTOMER_COUNT, planCrm, planCustomers, type DemoCustomer } from '../../../../../../packages/db/src/demo-full/plan-crm';
import { SALE_COUNT, planRetail, type RetailResult } from '../../../../../../packages/db/src/demo-full/plan-retail';
import { withVerhoeffDigit } from '../../../../../../packages/db/src/seed-demo-customer';
import { FIXED_NOW, makeCtx } from './demo-full.fakedb';

const DAY = 86_400_000;
const table = (tables: TablePlan[], model: string): Row[] => tables.find((t) => t.model === model)?.rows ?? [];

describe('demo-full common helpers', () => {
  it('Rng is deterministic per seed and differs across seeds', () => {
    const a = new Rng('x');
    const b = new Rng('x');
    const c = new Rng('y');
    const sa = Array.from({ length: 20 }, () => a.int(0, 1000));
    expect(Array.from({ length: 20 }, () => b.int(0, 1000))).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.int(0, 1000))).not.toEqual(sa);
    for (let i = 0; i < 200; i++) {
      const v = a.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('eid is stable, unique per key and tenant', () => {
    const t = { tenantId: 't1' };
    expect(eid(t, 'sale', 1)).toBe(eid(t, 'sale', 1));
    expect(eid(t, 'sale', 1)).not.toBe(eid(t, 'sale', 2));
    expect(eid(t, 'sale', 1)).not.toBe(eid({ tenantId: 't2' }, 'sale', 1));
    expect(eid(t, 'sale', 1)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('daysAgoAt never returns a future date, spreadDayOffsets respects the month minimums', () => {
    expect(daysAgoAt(FIXED_NOW, 0, 23, 59).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    const offs = spreadDayOffsets(new Rng('s'), FIXED_NOW, 72);
    expect(offs).toHaveLength(72);
    expect(Math.max(...offs)).toBeLessThanOrEqual(90 + 31);
    expect(Math.min(...offs)).toBeGreaterThanOrEqual(0);
    expect([...offs].sort((a, b) => b - a)).toEqual(offs);
    const thisMonth = offs.filter((o) => daysAgoAt(FIXED_NOW, o).getMonth() === FIXED_NOW.getMonth()).length;
    expect(thisMonth).toBeGreaterThanOrEqual(8);
  });

  it('Sequencer is contiguous per key; yymm formats like the API', () => {
    const s = new Sequencer();
    expect([s.next('a'), s.next('a'), s.next('b'), s.next('a')]).toEqual([1, 2, 1, 3]);
    expect(yymm(new Date(2026, 4, 3))).toBe('2605');
  });

  it('money helpers are exact BigInt arithmetic', () => {
    expect(bsum([1n, 2n, 3n])).toBe(6n);
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundToRupee(12_349n)).toBe(12_300n);
    expect(roundToRupee(12_350n)).toBe(12_400n);
    expect(rateFactor(0)).toBe(1);
  });

  it('fake identifiers are format valid and unique', () => {
    const rng = new Rng('id');
    expect(fakePan(rng, 'P', 'S')).toMatch(/^DMOPS\d{4}[A-Z]$/);
    const aad = fakeAadhaar(rng);
    expect(aad).toMatch(/^[2-9]\d{11}$/);
    expect(withVerhoeffDigit(aad.slice(0, 11))).toBe(aad);
    const g = fakeGstin('27', 'DMOPS1234A', 1);
    expect(g).toMatch(/^27DMOPS1234A1Z[0-9A-Z]$/);
    const book = new PhoneBook(new Rng('ph'));
    const phones = new Set(Array.from({ length: 300 }, () => book.next()));
    expect(phones.size).toBe(300);
    for (const p of phones) expect(p).toMatch(/^\+91[6-9]\d{9}$/);
    expect(phones.has('+919820000001')).toBe(false);
  });
});

describe('demo-full context loader', () => {
  it('derives an immutable baseline from the catalog', async () => {
    const ctx = await makeCtx();
    expect(ctx.products.length).toBeGreaterThanOrEqual(24);
    expect(ctx.products.every((p) => p.sku.startsWith('TB-') && p.showroomStockId && p.qty0 > 0)).toBe(true);
    expect(ctx.products.some((p) => p.fixedPrice)).toBe(true);
    expect(ctx.products.some((p) => !p.fixedPrice && p.makingPaise > 0n)).toBe(true);
    expect(ctx.existingCustomers.map((c) => c.firstName)).toEqual(['Priya']);
    expect(ctx.adminUserId).toBe('admin-user-1');
    expect(ctx.workshop.id).not.toBe(ctx.warehouse.id);
    expect(ctx.newLocations.map((l) => l.locationType)).toEqual(['WORKSHOP']);
    expect(ctx.permissionStrings).toContain('retail.sale.read');
  });
});

describe('demo-full CRM planner', () => {
  let ctx: DemoContext;
  let customers: DemoCustomer[];
  let retail: RetailResult;
  beforeAll(async () => {
    ctx = await makeCtx();
    customers = planCustomers(ctx);
    retail = planRetail(ctx, customers);
  });

  it('plans unique, format-valid customers', () => {
    expect(customers).toHaveLength(CUSTOMER_COUNT);
    for (const key of ['id', 'email', 'phone'] as const) expect(new Set(customers.map((c) => c[key])).size).toBe(CUSTOMER_COUNT);
    for (const c of customers) {
      expect(c.email).toMatch(/@example\.com$/);
      expect(c.phone).toMatch(/^\+91[6-9]\d{9}$/);
      if (c.gstin) expect(c.gstin).toMatch(/^\d{2}[A-Z0-9]{10}\dZ[0-9A-Z]$/);
    }
    expect(customers.filter((c) => c.kyc).length).toBeGreaterThanOrEqual(10);
    expect(customers.every((c) => !(c.firstName === 'Priya' && c.lastName === 'Sharma'))).toBe(true);
  });

  it('is deterministic', () => {
    const again = planCrm(ctx, planCustomers(ctx), retail.salesByCustomer);
    const first = planCrm(ctx, customers, retail.salesByCustomer);
    const ser = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
    expect(ser(again)).toBe(ser(first));
  });

  it('has unique ids per table, valid references and no future createdAt', () => {
    const plan = planCrm(ctx, customers, retail.salesByCustomer);
    const custIds = new Set(table(plan.tables, 'customer').map((r) => r.id));
    expect(custIds.size).toBe(CUSTOMER_COUNT);
    for (const t of plan.tables) {
      const ids = t.rows.map((r) => r.id);
      expect(new Set(ids).size, t.model).toBe(ids.length);
      for (const r of t.rows) {
        expect(r.tenantId ?? ctx.tenantId, t.model).toBe(ctx.tenantId);
        const created = r.createdAt;
        if (created instanceof Date) expect(created.getTime(), `${t.model}.createdAt`).toBeLessThanOrEqual(ctx.now.getTime());
        if (typeof r.customerId === 'string') expect(custIds.has(r.customerId) || ctx.existingCustomers.some((c) => c.id === r.customerId), t.model).toBe(true);
      }
    }
    expect(plan.sentinel.id).toBe(table(plan.tables, 'loyaltyProgram')[0]!.id);
  });

  it('loyalty ledger balances chain per customer', () => {
    const plan = planCrm(ctx, customers, retail.salesByCustomer);
    const byCustomer = new Map<string, Row[]>();
    for (const r of table(plan.tables, 'loyaltyTransaction')) {
      const list = byCustomer.get(String(r.customerId)) ?? [];
      list.push(r);
      byCustomer.set(String(r.customerId), list);
    }
    for (const rows of byCustomer.values()) {
      // plan order (welcome bonus, then purchases oldest first). NOTE: for some customers the welcome
      // bonus is dated AFTER their first purchase (createdDaysAgo is not tied to the sale dates).
      let bal = 0;
      for (const r of rows) {
        bal += Number(r.points);
        expect(Number(r.balanceAfter)).toBe(bal);
        expect(bal).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('demo-full retail planner', () => {
  let ctx: DemoContext;
  let retail: RetailResult;
  beforeAll(async () => {
    ctx = await makeCtx();
    retail = planRetail(ctx, planCustomers(ctx));
  });

  it('plans about SALE_COUNT sales within 90-120 days, none in the future', () => {
    expect(retail.sales.length).toBeGreaterThan(SALE_COUNT - 12);
    expect(retail.sales.length).toBeLessThanOrEqual(SALE_COUNT);
    for (const s of retail.sales) {
      expect(s.date.getTime()).toBeLessThanOrEqual(ctx.now.getTime());
      expect(ctx.now.getTime() - s.date.getTime()).toBeLessThan(125 * DAY);
    }
    const lastMonth = retail.sales.filter((s) => ctx.now.getTime() - s.date.getTime() < 30 * DAY).length;
    expect(lastMonth).toBeGreaterThanOrEqual(retail.sales.length / 3);
  });

  it('sale numbers are unique, SL/<loc>/<yymm>/<seq> and contiguous per month', () => {
    const nums = retail.sales.map((s) => s.number);
    expect(new Set(nums).size).toBe(nums.length);
    const perMonth = new Map<string, number[]>();
    for (const s of retail.sales) {
      const m = s.number.match(/^SL\/[A-Z]{3}\/(\d{4})\/(\d{4})$/);
      expect(m, s.number).not.toBeNull();
      expect(m![1]).toBe(yymm(s.date));
      perMonth.set(m![1]!, [...(perMonth.get(m![1]!) ?? []), Number(m![2])]);
    }
    for (const seqs of perMonth.values()) expect(seqs.sort((a, b) => a - b)).toEqual(seqs.map((_, i) => i + 1));
  });

  it('line, sale and payment totals are exact', () => {
    for (const s of retail.sales) {
      for (const l of s.lines) {
        const gross = l.unitPricePaise * BigInt(l.quantity);
        expect(l.taxablePaise).toBe(gross - l.discountPaise);
        expect(l.lineTotalPaise).toBe(l.taxablePaise + l.cgstPaise + l.sgstPaise + l.igstPaise);
        expect(l.igstPaise > 0n ? l.cgstPaise + l.sgstPaise : l.igstPaise).toBe(0n);
        expect(l.cgstPaise).toBe(l.sgstPaise);
      }
      expect(s.totals.subtotalPaise).toBe(bsum(s.lines.map((l) => l.taxablePaise)));
      expect(s.totals.taxPaise).toBe(bsum(s.lines.map((l) => l.cgstPaise + l.sgstPaise + l.igstPaise)));
      expect(s.totals.totalPaise).toBe(s.totals.subtotalPaise + s.totals.taxPaise + s.totals.roundOffPaise);
      expect(s.totals.totalPaise % 100n).toBe(0n);
      expect(bsum(s.payments.map((p) => p.amountPaise)), s.number).toBe(s.totals.totalPaise);
      expect(s.payments.every((p) => p.amountPaise > 0n)).toBe(true);
    }
  });

  it('table rows agree with SaleInfo and ids / numbers are unique', () => {
    const tables = retail.module.tables;
    const sales = table(tables, 'sale');
    expect(sales).toHaveLength(retail.sales.length);
    for (const row of sales) {
      const info = retail.sales.find((s) => s.id === row.id)!;
      expect(row.totalPaise).toBe(info.totals.totalPaise);
      expect(row.status).toBe(info.status);
    }
    for (const t of tables) {
      const ids = t.rows.map((r) => r.id);
      expect(new Set(ids).size, t.model).toBe(ids.length);
      for (const r of t.rows) {
        const c = r.createdAt;
        if (c instanceof Date) expect(c.getTime(), `${t.model}.createdAt`).toBeLessThanOrEqual(ctx.now.getTime());
      }
    }
    const saleIds = new Set(sales.map((r) => r.id));
    for (const li of table(tables, 'saleLineItem')) expect(saleIds.has(li.saleId)).toBe(true);
    for (const p of table(tables, 'salePayment')) expect(saleIds.has(p.saleId)).toBe(true);
    for (const key of ['saleReturn:returnNumber', 'repairOrder:repairNumber', 'customOrder:orderNumber', 'oldGoldPurchase:purchaseNumber', 'appraisal:appraisalNumber', 'giftCard:cardNumber']) {
      const [m, f] = key.split(':');
      const vals = table(tables, m!).map((r) => r[f!]);
      expect(new Set(vals).size, key).toBe(vals.length);
    }
  });

  it('stock never goes negative given the catalog quantities', () => {
    const net = new Map<string, number>();
    for (const m of retail.stockMoves) {
      if (m.where === 'showroom') net.set(m.productId, (net.get(m.productId) ?? 0) + m.delta);
    }
    for (const p of ctx.products) expect(p.qty0 + (net.get(p.id) ?? 0), p.sku).toBeGreaterThanOrEqual(0);
    for (const m of retail.stockMoves) expect(m.date.getTime()).toBeLessThanOrEqual(ctx.now.getTime());
  });

  it('high value sales have a KYC-verified buyer and the plan is deterministic', async () => {
    const ctx2 = await makeCtx();
    const again = planRetail(ctx2, planCustomers(ctx2));
    const ser = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x instanceof Map ? [...x] : x));
    expect(ser(again.module)).toBe(ser(retail.module));
    expect(ser(again.sales)).toBe(ser(retail.sales));
    const kycIds = new Set(planCustomers(ctx).filter((c) => c.kyc).map((c) => c.id));
    for (const s of retail.sales) {
      if (s.totals.totalPaise >= 20_000_000n) expect(s.customerId && (kycIds.has(s.customerId) || ctx.existingCustomers.some((c) => c.id === s.customerId))).toBeTruthy();
    }
    expect(startOfDay(FIXED_NOW).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
  });
});
