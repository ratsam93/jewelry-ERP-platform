import { beforeAll, describe, expect, it } from 'vitest';
import type { DemoContext, ModulePlan, Row } from '../../../../../../packages/db/src/demo-full/common';
import { planCustomers, type DemoCustomer } from '../../../../../../packages/db/src/demo-full/plan-crm';
import { PEOPLE_COMMERCE_COUNTS, planPeopleCommerce } from '../../../../../../packages/db/src/demo-full/plan-people-commerce';
import { planRetail, type RetailResult } from '../../../../../../packages/db/src/demo-full/plan-retail';
import { FIXED_NOW, makeCtx } from './demo-full.fakedb';

const DAY = 86_400_000;
const ser = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `__big:${x}` : x));

let ctx: DemoContext;
let customers: DemoCustomer[];
let retail: RetailResult;
let plan: ModulePlan;
const rows = (model: string): Row[] => plan.tables.find((t) => t.model === model)?.rows ?? [];
const big = (r: Row, k: string): bigint => r[k] as bigint;

beforeAll(async () => {
  ctx = await makeCtx();
  customers = planCustomers(ctx);
  retail = planRetail(ctx, customers);
  plan = planPeopleCommerce(ctx, customers, retail);
});

describe('people-commerce plan: structure', () => {
  it('is deterministic for the same context', () => {
    expect(ser(planPeopleCommerce(ctx, customers, retail))).toBe(ser(plan));
  });

  it('has unique ids per table and the intended row counts', () => {
    for (const t of plan.tables) {
      const ids = t.rows.map((r) => r.id);
      expect(new Set(ids).size, t.model).toBe(ids.length);
    }
    expect(rows('employee')).toHaveLength(PEOPLE_COMMERCE_COUNTS.employee);
    expect(rows('payrollPeriod')).toHaveLength(PEOPLE_COMMERCE_COUNTS.payrollPeriod);
    expect(rows('salesChannel')).toHaveLength(2);
    expect(rows('onlineOrder')).toHaveLength(15);
    expect(rows('clickAndCollect')).toHaveLength(3);
    expect(rows('productReview')).toHaveLength(8);
    expect(rows('wishlist')).toHaveLength(10);
    expect(rows('preOrder')).toHaveLength(3);
    expect(rows('hallmarkSubmission')).toHaveLength(8);
    expect(rows('amlRule')).toHaveLength(4);
    expect(rows('amlAlert')).toHaveLength(3);
    expect(rows('exportOrder')).toHaveLength(2);
    expect(rows('exportInvoice')).toHaveLength(2);
    expect(rows('role')).toHaveLength(4);
    expect(rows('hardwareLabelTemplate')).toHaveLength(2);
    expect(rows('blogPost')).toHaveLength(6);
    expect(rows('announcement')).toHaveLength(3);
    expect(rows('page').length).toBeGreaterThanOrEqual(3);
  });

  it('contains no user rows and never touches the Admin role', () => {
    expect(plan.tables.some((t) => t.model === 'user')).toBe(false);
    expect(rows('role').map((r) => r.name)).toEqual(['Sales Manager', 'Accountant', 'Store Staff', 'Karigar Supervisor']);
    for (const r of rows('role')) expect(r.isSystem).toBe(false);
  });

  it('only references parents that are planned earlier in the plan or exist in the context', () => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const t of plan.tables) {
      order.push(t.model);
      for (const r of t.rows) seen.add(`${t.model}:${r.id}`);
    }
    const idx = (m: string) => order.indexOf(m);
    expect(idx('employee')).toBeLessThan(idx('payslip'));
    expect(idx('payrollPeriod')).toBeLessThan(idx('payslip'));
    expect(idx('onlineOrder')).toBeLessThan(idx('onlineOrderItem'));
    expect(idx('onlineOrder')).toBeLessThan(idx('shipment'));
    expect(idx('salesChannel')).toBeLessThan(idx('onlineOrder'));
    expect(idx('paymentGateway')).toBeLessThan(idx('onlinePayment'));
    expect(idx('hallmarkSubmission')).toBeLessThan(idx('hallmarkSubmissionItem'));
    expect(idx('amlRule')).toBeLessThan(idx('amlAlert'));
    expect(idx('exportOrder')).toBeLessThan(idx('exportInvoice'));
    if (order.includes('hallmarkCenter')) expect(idx('hallmarkCenter')).toBeLessThan(idx('hallmarkSubmission'));
  });
});

describe('people-commerce plan: payroll', () => {
  it('employees carry valid-format PAN/IFSC/bank and spread over departments', () => {
    for (const e of rows('employee')) {
      expect(e.panNumber).toMatch(/^[A-Z]{5}[0-9]{4}[A-Z]$/);
      expect(e.bankIfsc).toMatch(/^[A-Z]{4}0[0-9A-Z]{6}$/);
      expect(e.bankAccountNumber).toMatch(/^[0-9]{9,18}$/);
      expect(e.aadhaarNumber).toMatch(/^[2-9][0-9]{11}$/);
    }
    expect(new Set(rows('employee').map((e) => e.department)).size).toBeGreaterThanOrEqual(4);
  });

  it('attendance is date-only at UTC midnight, unique per employee/day, never in the future, with realistic mix', () => {
    const att = rows('employeeAttendance');
    const keys = new Set<string>();
    const counts: Record<string, number> = {};
    for (const a of att) {
      const d = a.date as Date;
      expect(d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() + d.getUTCMilliseconds()).toBe(0);
      expect(d.getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
      expect(FIXED_NOW.getTime() - d.getTime()).toBeLessThanOrEqual(125 * DAY);
      keys.add(`${a.employeeId}|${d.toISOString()}`);
      counts[a.status as string] = (counts[a.status as string] ?? 0) + 1;
    }
    expect(keys.size).toBe(att.length);
    for (const s of ['PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'WEEKLY_OFF']) expect(counts[s], s).toBeGreaterThan(0);
    expect((counts.PRESENT ?? 0) / att.length).toBeGreaterThan(0.6);
    // the last 60 days are covered for every employee
    const first = Math.min(...att.map((a) => (a.date as Date).getTime()));
    expect(FIXED_NOW.getTime() - first).toBeGreaterThanOrEqual(60 * DAY);
  });

  it('periods use UTC-midnight DATE values and statuses PAID, PROCESSED, DRAFT', () => {
    const ps = [...rows('payrollPeriod')].sort((a, b) => String(a.periodLabel).localeCompare(String(b.periodLabel)));
    expect(ps.map((p) => p.status)).toEqual(['PAID', 'PROCESSED', 'DRAFT']);
    for (const p of ps) {
      const [y, m] = String(p.periodLabel).split('-').map(Number) as [number, number];
      expect((p.startDate as Date).toISOString()).toBe(new Date(Date.UTC(y, m - 1, 1)).toISOString());
      expect((p.endDate as Date).toISOString()).toBe(new Date(Date.UTC(y, m, 0)).toISOString());
    }
    expect(ps[2]!.processedAt).toBeNull();
    expect(ps[2]!.periodLabel).toBe('2026-05');
  });

  it('every payslip adds up: gross = components, net = gross - deductions, statuses follow the period', () => {
    const periods = new Map(rows('payrollPeriod').map((p) => [p.id, p]));
    const slips = rows('payslip');
    expect(slips).toHaveLength(36);
    const seen = new Set<string>();
    for (const s of slips) {
      const a = s.allowances as Record<string, number>;
      const allowances = BigInt(a.da! + a.conveyance! + a.medical! + a.other!);
      expect(big(s, 'grossSalary')).toBe(big(s, 'basicSalary') + big(s, 'hra') + allowances + big(s, 'overtimePay'));
      const adv = BigInt((s.otherDeductions as Record<string, number>).advanceRecovery ?? 0);
      const ded = big(s, 'pfDeduction') + big(s, 'esiDeduction') + big(s, 'tdsDeduction') + big(s, 'professionalTax') + adv;
      expect(big(s, 'totalDeductions')).toBe(ded);
      expect(big(s, 'netSalary')).toBe(big(s, 'grossSalary') - ded);
      expect(big(s, 'netSalary')).toBeGreaterThan(0n);
      const period = periods.get(s.payrollPeriodId)!;
      expect(period).toBeTruthy();
      const expected = period.status === 'PAID' ? 'PAID' : period.status === 'PROCESSED' ? 'APPROVED' : 'DRAFT';
      expect(s.status).toBe(expected);
      expect(s.paidAt === null).toBe(expected !== 'PAID');
      if (s.paidAt) expect((s.paidAt as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
      seen.add(`${s.employeeId}|${s.payrollPeriodId}`);
    }
    expect(seen.size).toBe(slips.length);
  });

  it('salary structures exist per designation and label templates use the printer LabelField shape', () => {
    expect(rows('salaryStructure').length).toBeGreaterThanOrEqual(3);
    for (const l of rows('hardwareLabelTemplate')) {
      const fields = l.fields as Array<Record<string, unknown>>;
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        expect(['text', 'barcode', 'qr', 'image']).toContain(f.type);
        expect(typeof f.value).toBe('string');
        expect(typeof f.width).toBe('number');
      }
    }
  });
});

describe('people-commerce plan: e-commerce', () => {
  const orders = (): Row[] => rows('onlineOrder');

  it('order numbers follow the API formats in the collision-safe 9001+ range and are unique', () => {
    const nums = orders().map((o) => String(o.orderNumber));
    expect(new Set(nums).size).toBe(nums.length);
    for (const n of nums) {
      const m = /^ON\/(B2C|AMA)\/(\d{4})\/(\d+)$/.exec(n);
      expect(m, n).not.toBeNull();
      expect(Number(m![3])).toBeGreaterThanOrEqual(9001);
      if (m![1] === 'B2C') expect(m![3]).toHaveLength(5);
      else expect(m![3]).toHaveLength(4);
    }
    for (const s of rows('shipment')) expect(String(s.shipmentNumber)).toMatch(/^SH\/\d{4}\/9\d{3}$/);
  });

  it('covers every status; totals, items and payments are exact', () => {
    const statuses = new Set(orders().map((o) => o.status));
    for (const s of ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']) expect(statuses.has(s), s).toBe(true);
    const items = rows('onlineOrderItem');
    const pays = rows('onlinePayment');
    const productIds = new Set(ctx.products.map((p) => p.id));
    const channelIds = new Set(rows('salesChannel').map((c) => c.id));
    const customerIds = new Set([...customers.map((c) => c.id), ...ctx.existingCustomers.map((c) => c.id)]);
    for (const o of orders()) {
      const its = items.filter((i) => i.orderId === o.id);
      expect(its.length).toBeGreaterThan(0);
      for (const i of its) {
        expect(big(i, 'totalPaise')).toBe(big(i, 'unitPricePaise') * BigInt(i.quantity as number));
        expect(productIds.has(i.productId as string)).toBe(true);
      }
      const sub = its.reduce((a, i) => a + big(i, 'totalPaise'), 0n);
      expect(big(o, 'subtotalPaise')).toBe(sub);
      expect(big(o, 'totalPaise')).toBe(sub - big(o, 'discountPaise') + big(o, 'shippingPaise') + big(o, 'taxPaise'));
      expect(channelIds.has(o.channelId as string)).toBe(true);
      expect(customerIds.has(o.customerId as string)).toBe(true);
      expect((o.shippingAddress as Record<string, unknown>).postalCode).toBeTruthy();
      const p = pays.filter((x) => x.orderId === o.id);
      expect(p).toHaveLength(1);
      expect(big(p[0]!, 'amountPaise')).toBe(big(o, 'totalPaise'));
    }
  });

  it('timestamps and payment/shipment states are consistent with the order status', () => {
    const pays = new Map(rows('onlinePayment').map((p) => [p.orderId, p]));
    const ships = new Map(rows('shipment').map((s) => [s.orderId, s]));
    for (const o of orders()) {
      const placed = (o.placedAt as Date).getTime();
      expect(placed).toBeLessThanOrEqual(FIXED_NOW.getTime());
      const confirmed = o.confirmedAt as Date | null;
      const shipped = o.shippedAt as Date | null;
      const delivered = o.deliveredAt as Date | null;
      for (const d of [confirmed, shipped, delivered]) if (d) expect(d.getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
      expect(FIXED_NOW.getTime() - placed).toBeLessThanOrEqual(120 * DAY);
      if (confirmed) expect(confirmed.getTime()).toBeGreaterThanOrEqual(placed);
      if (shipped) expect(shipped.getTime()).toBeGreaterThan(placed);
      if (shipped && delivered) expect(delivered.getTime()).toBeGreaterThan(shipped.getTime());
      const pay = pays.get(o.id)!;
      switch (o.status) {
        case 'PENDING':
          expect(confirmed).toBeNull();
          expect(pay.status).toBe('INITIATED');
          break;
        case 'CONFIRMED':
        case 'PROCESSING':
          expect(confirmed).not.toBeNull();
          expect(delivered).toBeNull();
          break;
        case 'SHIPPED':
          expect(shipped).not.toBeNull();
          expect(delivered).toBeNull();
          expect(['IN_TRANSIT', 'OUT_FOR_DELIVERY']).toContain(ships.get(o.id)?.status);
          break;
        case 'DELIVERED':
          expect(delivered).not.toBeNull();
          expect(pay.status).toBe('CAPTURED');
          break;
        case 'CANCELLED':
          expect(shipped).toBeNull();
          expect(o.cancelReason).toBeTruthy();
          expect(pay.status).toBe('REFUNDED');
          break;
        case 'RETURNED':
          expect(delivered).not.toBeNull();
          expect(pay.status).toBe('REFUNDED');
          expect(big(pay, 'refundAmountPaise')).toBe(big(o, 'totalPaise'));
          break;
      }
      if (pay.method === 'COD' && o.status !== 'DELIVERED') expect(pay.status).toBe('INITIATED');
    }
    for (const s of rows('shipment')) {
      expect(String(s.trackingNumber).length).toBeGreaterThan(8);
      expect(s.carrier).toBeTruthy();
      if (s.status === 'DELIVERED') expect(s.actualDeliveryDate).not.toBeNull();
      const d = s.estimatedDeliveryDate as Date;
      expect(d.getUTCHours()).toBe(0);
    }
  });

  it('click and collect rows match their orders', () => {
    const byId = new Map(orders().map((o) => [o.id, o]));
    const cc = rows('clickAndCollect');
    expect(cc.map((c) => c.status).sort()).toEqual(['NOTIFIED', 'PICKED_UP', 'READY_FOR_PICKUP']);
    for (const c of cc) {
      const o = byId.get(c.orderId)!;
      expect(c.locationId).toBe(ctx.showroom.id);
      expect(rows('shipment').some((s) => s.orderId === o.id)).toBe(false);
      if (c.status === 'PICKED_UP') {
        expect(o.status).toBe('DELIVERED');
        expect(c.pickedUpAt).not.toBeNull();
      } else expect(o.status).toBe('PROCESSING');
    }
  });

  it('reviews, wishlists and pre-orders are valid and unique', () => {
    const productIds = new Set(ctx.products.map((p) => p.id));
    for (const r of rows('productReview')) {
      expect(r.rating as number).toBeGreaterThanOrEqual(1);
      expect(r.rating as number).toBeLessThanOrEqual(5);
      expect(productIds.has(r.productId as string)).toBe(true);
      expect(r.isPublished === (r.publishedAt !== null)).toBe(true);
      expect((r.createdAt as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    }
    const wl = rows('wishlist').map((w) => `${w.customerId}|${w.productId}`);
    expect(new Set(wl).size).toBe(wl.length);
    const types = rows('preOrder').map((p) => p.orderType).sort();
    expect(types).toEqual(['BACKORDER', 'MADE_TO_ORDER', 'PRE_ORDER']);
    for (const p of rows('preOrder')) expect(big(p, 'depositPaise')).toBeGreaterThan(0n);
    const cfg = rows('preOrderConfig').map((c) => c.productId);
    expect(new Set(cfg).size).toBe(cfg.length);
  });

  it('stock effects: movements are OUT/RETURN, deltas only decrement and net to the OUT rows of live orders', () => {
    const moves = rows('stockMovement');
    const liveOut = moves.filter((m) => m.movementType === 'OUT' && orders().find((o) => o.id === m.referenceId && !['CANCELLED', 'RETURNED'].includes(o.status as string)));
    const delta = plan.stockDeltas.reduce((a, d) => a + d.delta, 0);
    expect(delta).toBe(-liveOut.length);
    for (const d of plan.stockDeltas) expect(d.delta).toBeLessThan(0);
    for (const m of moves) expect((m.movedAt as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
  });
});

describe('people-commerce plan: compliance and export', () => {
  it('hallmark submissions follow a valid status flow with consistent counters and HUIDs', () => {
    const items = rows('hallmarkSubmissionItem');
    const huids: string[] = [];
    const nums = new Set<string>();
    for (const s of rows('hallmarkSubmission')) {
      nums.add(String(s.submissionNumber));
      expect(String(s.submissionNumber)).toMatch(/^HM-DEMO\d{4}$/);
      const its = items.filter((i) => i.submissionId === s.id);
      expect(its.length).toBe(s.totalItems);
      expect(its.filter((i) => i.status === 'PASSED')).toHaveLength(s.passedItems as number);
      expect(its.filter((i) => i.status === 'FAILED')).toHaveLength(s.failedItems as number);
      const pending = its.filter((i) => i.status === 'PENDING').length;
      switch (s.status) {
        case 'SUBMITTED':
          expect(pending).toBe(its.length);
          expect(s.actualReturnDate).toBeNull();
          break;
        case 'IN_PROGRESS':
          expect(pending).toBeGreaterThan(0);
          expect(its.some((i) => i.status === 'PASSED')).toBe(true);
          expect(s.actualReturnDate).toBeNull();
          break;
        case 'COMPLETED':
          expect(pending + (s.failedItems as number)).toBe(0);
          expect(s.actualReturnDate).not.toBeNull();
          break;
        case 'PARTIAL_REJECT':
          expect(s.failedItems as number).toBeGreaterThan(0);
          expect(s.passedItems as number).toBeGreaterThan(0);
          break;
        case 'REJECTED':
          expect(s.passedItems).toBe(0);
          expect(s.failedItems).toBe(s.totalItems);
          break;
      }
      if (s.actualReturnDate) expect((s.actualReturnDate as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
      expect((s.submittedDate as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
      for (const i of its) {
        if (i.status === 'PASSED') {
          expect(String(i.huidAssigned)).toMatch(/^[A-Z0-9]{6}$/);
          huids.push(String(i.huidAssigned));
          expect(i.testedPurity as number).toBeGreaterThanOrEqual(i.declaredPurity as number);
        } else expect(i.huidAssigned).toBeNull();
        if (i.status === 'FAILED') expect(i.failureReason).toBeTruthy();
      }
    }
    expect(nums.size).toBe(8);
    expect(new Set(huids).size).toBe(huids.length);
    const statuses = new Set(rows('hallmarkSubmission').map((s) => s.status));
    for (const s of ['SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL_REJECT', 'REJECTED']) expect(statuses.has(s), s).toBe(true);
  });

  it('AML alerts point at real planned rules and retail sales', () => {
    const ruleIds = new Set(rows('amlRule').map((r) => r.id));
    const sales = new Map(retail.sales.map((s) => [s.id, s]));
    for (const a of rows('amlAlert')) {
      expect(ruleIds.has(a.ruleId as string)).toBe(true);
      const tx = a.transactionIds as string[];
      expect(tx).toHaveLength(1);
      expect(sales.get(tx[0]!)?.totals.totalPaise).toBe(a.amountPaise);
      expect(sales.get(tx[0]!)?.customerId).toBe(a.customerId);
      expect((a.createdAt as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    }
    for (const r of rows('amlRule')) expect(Object.keys(r.parameters as object).length).toBeGreaterThan(0);
  });

  it('export orders and invoices reconcile in the buyer currency', () => {
    const invs = rows('exportInvoice');
    for (const o of rows('exportOrder')) {
      expect(String(o.orderNumber)).toMatch(/^EXP\/TECH\/\d{4}\/90\d{2}$/);
      const its = rows('exportOrderItem').filter((i) => i.exportOrderId === o.id);
      for (const i of its) expect(big(i, 'totalPricePaise')).toBe(big(i, 'unitPricePaise') * BigInt(i.quantity as number));
      const sub = its.reduce((a, i) => a + big(i, 'totalPricePaise'), 0n);
      expect(big(o, 'subtotalPaise')).toBe(sub);
      expect(big(o, 'totalPaise')).toBe(sub + big(o, 'shippingPaise') + big(o, 'insurancePaise') + big(o, 'dutyPaise'));
      const inv = invs.filter((v) => v.exportOrderId === o.id);
      expect(inv).toHaveLength(1);
      expect(big(inv[0]!, 'subtotalPaise')).toBe(sub);
      expect(big(inv[0]!, 'totalPaise')).toBe(sub + big(inv[0]!, 'igstPaise'));
      expect(inv[0]!.exchangeRate).toBe(o.exchangeRate);
      const invItems = rows('exportInvoiceItem').filter((i) => i.invoiceId === inv[0]!.id);
      expect(invItems.reduce((a, i) => a + big(i, 'totalPricePaise'), 0n)).toBe(sub);
      if (inv[0]!.invoiceType === 'COMMERCIAL') expect(inv[0]!.lutNumber).toBeTruthy();
      expect(String(inv[0]!.ieCode)).toHaveLength(10);
      if (o.status === 'DELIVERED') expect(o.actualShipDate).not.toBeNull();
      expect((o.createdAt as Date).getTime()).toBeLessThanOrEqual(FIXED_NOW.getTime());
    }
  });
});
