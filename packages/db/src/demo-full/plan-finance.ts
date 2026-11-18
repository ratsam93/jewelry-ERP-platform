/**
 * Finance planner (pure, deterministic, INSERT-ONLY):
 *  - chart of accounts (reuses ctx.accountIdByCode, only missing codes are inserted), 2 bank accounts, FY, cost centres, budgets
 *  - ~30 invoices (SALES to CRM customers + PURCHASE from wholesale-style suppliers) in every status, with line items,
 *    GST tax rows (CGST+SGST intra-state, IGST inter-state; 3% on metal, 5% on making/labour) and receipts / supplier payments
 *  - one balanced POSTED journal entry per business event: invoice issue (+COGS), receipts, supplier payments,
 *    every retail POS sale (+COGS), completed retail returns, monthly rent / salaries / utilities, opening balances
 *  - bank transactions (statement lines of the two bank ledgers, running balance)
 *  - Girvi (pledge) loans with payments and interest accruals, gold-savings + kitty/chit schemes, BNPL provider / EMI plans /
 *    transactions / schedules.
 *
 * Numbering mimics the API generators exactly so future real documents never collide:
 *   invoices  INV-/PINV-<yyyymm>-<NNNN>   payments PAY-<yyyymm>-<NNNN>   journals JE-<yyyymm>-<NNNN>
 *   girvi     GRV-<yyyymm>-<NNNN>         members  <SCH>-<NNNN> / GS-<NNNN>
 * The API derives the next number from count(startsWith base)+1, and every sequence here is contiguous from 1 per
 * month, so no counter row has to be advanced (the app keeps none).
 * Accounting note: this plan posts its own ledger entries for the retail sales (entry numbers JE-...), so the older
 * `seed-demo-ledger.ts` (DEMO-* entries) must NOT be run on top of it, or sales would be posted twice.
 */
import { DEMO_RATE_RUPEES_PER_GRAM } from '../seed-demo-catalog-data';
import {
  CITIES, Rng, Sequencer, addDays, bsum, daysAgoAt, eid, fakeBankAccount, fakeGstin, fakeIfsc, fakePan, pad, rateFactor,
  roundDiv, roundToRupee, rupees, yyyymm, type DemoContext, type ModulePlan, type ProductInfo, type Row, type TablePlan,
} from './common';
import type { DemoCustomer } from './plan-crm';
import { priceLine, type RetailResult } from './plan-retail';

export const COGS_PERCENT = 72n;

export const FINANCE_COUNTS = {
  /** Upper bound: only codes missing from ctx.accountIdByCode are inserted. */
  accounts: 16,
  bankAccounts: 2,
  financialYears: 1,
  costCenters: 3,
  budgets: 3,
  salesInvoices: 20,
  purchaseInvoices: 10,
  invoices: 30,
  girviLoans: 8,
  goldSavingsSchemes: 2,
  goldSavingsMembers: 11,
  kittySchemes: 2,
  kittyMembers: 13,
  bnplProviders: 1,
  emiPlans: 3,
  bnplTransactions: 3,
} as const;

// ─── Chart of accounts ─────────────────────────────────────────────

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export const CHART: ReadonlyArray<{ code: string; name: string; type: AccountType }> = [
  { code: '1000', name: 'Cash / Bank', type: 'ASSET' },
  { code: '1010', name: 'HDFC Current Account', type: 'ASSET' },
  { code: '1020', name: 'ICICI Current Account', type: 'ASSET' },
  { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '1400', name: 'Inventory', type: 'ASSET' },
  { code: '1500', name: 'GST Input Credit', type: 'ASSET' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '2100', name: 'GST Output Payable', type: 'LIABILITY' },
  { code: '2200', name: 'Gift Card Liability', type: 'LIABILITY' },
  { code: '3000', name: 'Owner Capital', type: 'EQUITY' },
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
  { code: '5100', name: 'Shop Rent', type: 'EXPENSE' },
  { code: '5200', name: 'Staff Salaries', type: 'EXPENSE' },
  { code: '5300', name: 'Utilities', type: 'EXPENSE' },
];

const cogsOf = (net: bigint): bigint => (net * COGS_PERCENT) / 100n;
const ceilTo = (x: bigint, unit: bigint): bigint => ((x + unit - 1n) / unit) * unit;

interface Leg {
  code: string;
  debit: bigint;
  credit: bigint;
  desc: string;
}
interface Pending {
  key: string;
  date: Date;
  description: string;
  reference: string | null;
  legs: Leg[];
  /** payment id this entry belongs to (for bank reconciliation) */
  paymentId?: string;
}
const D = (code: string, amount: bigint, desc: string): Leg => ({ code, debit: amount, credit: 0n, desc });
const C = (code: string, amount: bigint, desc: string): Leg => ({ code, debit: 0n, credit: amount, desc });

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function gstFor(taxable: bigint, gstRate: number, inter: boolean): { cgst: bigint; sgst: bigint; igst: bigint } {
  if (inter) return { cgst: 0n, sgst: 0n, igst: roundDiv(taxable * BigInt(gstRate), 10000n) };
  const half = roundDiv(taxable * BigInt(gstRate), 20000n);
  return { cgst: half, sgst: half, igst: 0n };
}

function stateCodeOf(state: string): string {
  return CITIES.find((c) => c.state.toLowerCase() === state.toLowerCase())?.stateCode ?? '27';
}

// ─── Invoice drafting ──────────────────────────────────────────────

interface LineDraft {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPricePaise: bigint;
  discountPaise: bigint;
  taxablePaise: bigint;
  hsnCode: string;
  gstRate: number;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  totalPaise: bigint;
}

interface InvoiceDraft {
  key: string;
  type: 'SALES' | 'PURCHASE';
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  daysAgo: number;
  termDays: number;
  customer: DemoCustomer | null;
  supplierName: string | null;
  sourceState: string;
  destState: string;
  inter: boolean;
  lines: LineDraft[];
  notes: string;
  number: string;
  date: Date;
  dueDate: Date;
  subtotal: bigint;
  discount: bigint;
  tax: bigint;
  total: bigint;
  paid: bigint;
  payments: Array<{ date: Date; amount: bigint; method: string; reference: string | null }>;
}

type PayPlan = 'none' | 'full' | 'full2' | number; // number = percent paid

interface Scenario {
  type: 'SALES' | 'PURCHASE';
  status: InvoiceDraft['status'];
  daysAgo: number;
  term: number;
  pay: PayPlan;
}

const SALES_SCENARIOS: Scenario[] = [
  { type: 'SALES', status: 'DRAFT', daysAgo: 2, term: 30, pay: 'none' },
  { type: 'SALES', status: 'DRAFT', daysAgo: 1, term: 15, pay: 'none' },
  { type: 'SALES', status: 'SENT', daysAgo: 6, term: 30, pay: 'none' },
  { type: 'SALES', status: 'SENT', daysAgo: 12, term: 45, pay: 'none' },
  { type: 'SALES', status: 'SENT', daysAgo: 20, term: 30, pay: 'none' },
  { type: 'SALES', status: 'SENT', daysAgo: 3, term: 15, pay: 'none' },
  { type: 'SALES', status: 'PARTIALLY_PAID', daysAgo: 25, term: 30, pay: 40 },
  { type: 'SALES', status: 'PARTIALLY_PAID', daysAgo: 50, term: 30, pay: 60 },
  { type: 'SALES', status: 'PARTIALLY_PAID', daysAgo: 100, term: 30, pay: 50 },
  { type: 'SALES', status: 'PAID', daysAgo: 85, term: 30, pay: 'full2' },
  { type: 'SALES', status: 'PAID', daysAgo: 70, term: 15, pay: 'full' },
  { type: 'SALES', status: 'PAID', daysAgo: 58, term: 30, pay: 'full' },
  { type: 'SALES', status: 'PAID', daysAgo: 44, term: 30, pay: 'full2' },
  { type: 'SALES', status: 'PAID', daysAgo: 33, term: 15, pay: 'full' },
  { type: 'SALES', status: 'PAID', daysAgo: 21, term: 30, pay: 'full' },
  { type: 'SALES', status: 'PAID', daysAgo: 9, term: 15, pay: 'full' },
  { type: 'SALES', status: 'OVERDUE', daysAgo: 28, term: 15, pay: 'none' },
  { type: 'SALES', status: 'OVERDUE', daysAgo: 62, term: 30, pay: 'none' },
  { type: 'SALES', status: 'OVERDUE', daysAgo: 95, term: 45, pay: 'none' },
  { type: 'SALES', status: 'CANCELLED', daysAgo: 30, term: 30, pay: 'none' },
];

const PURCHASE_SCENARIOS: Scenario[] = [
  { type: 'PURCHASE', status: 'DRAFT', daysAgo: 3, term: 30, pay: 'none' },
  { type: 'PURCHASE', status: 'SENT', daysAgo: 8, term: 30, pay: 'none' },
  { type: 'PURCHASE', status: 'SENT', daysAgo: 15, term: 45, pay: 'none' },
  { type: 'PURCHASE', status: 'PARTIALLY_PAID', daysAgo: 40, term: 30, pay: 50 },
  { type: 'PURCHASE', status: 'PAID', daysAgo: 90, term: 30, pay: 'full' },
  { type: 'PURCHASE', status: 'PAID', daysAgo: 72, term: 15, pay: 'full2' },
  { type: 'PURCHASE', status: 'PAID', daysAgo: 50, term: 30, pay: 'full' },
  { type: 'PURCHASE', status: 'PAID', daysAgo: 27, term: 30, pay: 'full' },
  { type: 'PURCHASE', status: 'OVERDUE', daysAgo: 60, term: 30, pay: 'none' },
  { type: 'PURCHASE', status: 'CANCELLED', daysAgo: 35, term: 30, pay: 'none' },
];

const SUPPLIERS = [
  'Shree Laxmi Bullion Traders', 'Mehta Gold Refiners', 'Kalyan Diamond Exports', 'Raj Silver House', 'Ganesh Bullion & Co',
  'Sona Karigar Cooperative', 'Jain Gems and Stones', 'Patel Metal Refinery', 'Vishwakarma Casting Works', 'Bharat Precious Metals',
];

interface SalesLineDraft {
  product: ProductInfo | null;
  description: string;
  quantity: number;
  unit: bigint;
  discount: bigint;
  hsn: string;
  gstRate: number;
}

function finalizeLines(id: (k: number) => string, raw: SalesLineDraft[], inter: boolean): LineDraft[] {
  return raw.map((l, k) => {
    const taxable = l.unit * BigInt(l.quantity) - l.discount;
    const g = gstFor(taxable, l.gstRate, inter);
    return {
      id: id(k), productId: l.product ? l.product.id : null, description: l.description.slice(0, 500), quantity: l.quantity,
      unitPricePaise: l.unit, discountPaise: l.discount, taxablePaise: taxable, hsnCode: l.hsn, gstRate: l.gstRate,
      cgstPaise: g.cgst, sgstPaise: g.sgst, igstPaise: g.igst, totalPaise: taxable + g.cgst + g.sgst + g.igst,
    };
  });
}

function splitPayments(total: bigint, plan: PayPlan): bigint[] {
  if (plan === 'none') return [];
  if (plan === 'full') return [total];
  if (plan === 'full2') {
    const first = roundToRupee((total * 60n) / 100n);
    return [first, total - first];
  }
  const part = roundToRupee((total * BigInt(plan)) / 100n);
  return [part];
}

function accrueSimple(principal: number, rateBps: number, days: number): number {
  return Math.round(principal * (rateBps / (365 * 10000)) * days);
}

/** Mirrors IndiaGirviService.calculateInterestForPeriod. */
function girviInterest(principal: number, rateBps: number, days: number, type: 'SIMPLE' | 'COMPOUND', comp: string | null): number {
  if (type === 'SIMPLE') return accrueSimple(principal, rateBps, days);
  let ppy = 12;
  if (comp === 'QUARTERLY') ppy = 4;
  if (comp === 'YEARLY') ppy = 1;
  const periodRate = rateBps / (ppy * 10000);
  const periods = (days / 365) * ppy;
  return Math.round(principal * Math.pow(1 + periodRate, periods) - principal);
}

/** Mirrors BnplEmiService.calculateEmi + generateEmiSchedule. */
function emiOf(amount: number, tenure: number, ratePct: number): { emi: number; interest: number; payable: number } {
  if (ratePct === 0) return { emi: Math.ceil(amount / tenure), interest: 0, payable: amount };
  const r = ratePct / (12 * 10000);
  const p = Math.pow(1 + r, tenure);
  const emi = Math.ceil((amount * r * p) / (p - 1));
  return { emi, interest: emi * tenure - amount, payable: emi * tenure };
}

function emiSchedule(amount: number, tenure: number, ratePct: number, start: Date) {
  const { emi } = emiOf(amount, tenure, ratePct);
  const out: Array<{ n: number; due: Date; amount: number; principal: number; interest: number }> = [];
  let out0 = amount;
  const r = ratePct / (12 * 10000);
  for (let i = 1; i <= tenure; i++) {
    let interest: number;
    let principal: number;
    let amt: number;
    if (ratePct === 0) {
      amt = i < tenure ? Math.ceil(amount / tenure) : out0;
      principal = amt;
      interest = 0;
    } else {
      interest = Math.round(out0 * r);
      if (i < tenure) {
        amt = emi;
        principal = amt - interest;
      } else {
        principal = out0;
        amt = principal + interest;
      }
    }
    out0 -= principal;
    if (out0 < 0) {
      principal += out0;
      amt = principal + interest;
      out0 = 0;
    }
    out.push({ n: i, due: addMonths(start, i), amount: amt, principal, interest });
  }
  return out;
}

// ─── Planner ───────────────────────────────────────────────────────

export function planFinance(ctx: DemoContext, customers: DemoCustomer[], retail: RetailResult): ModulePlan {
  const { now, tenantId } = ctx;
  const admin = ctx.adminUserId;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const minusMin = (d: Date): Date => (d.getTime() > now.getTime() ? new Date(now.getTime() - 60_000) : d);

  const showroomCode = stateCodeOf(ctx.showroom.state);
  const accId = (code: string): string => ctx.accountIdByCode[code] ?? eid(ctx, 'account', code);

  // ─── accounts (only the missing codes) ───
  for (const a of CHART) {
    if (ctx.accountIdByCode[a.code]) continue;
    add('account', {
      id: eid(ctx, 'account', a.code), tenantId, accountCode: a.code, name: a.name, accountType: a.type, isActive: true,
      currencyCode: 'INR', createdAt: daysAgoAt(now, 120, 9), createdBy: admin,
    });
  }

  // ─── invoices ───
  const b2b = customers.filter((c) => c.type !== 'RETAIL');
  const retailers = customers.filter((c) => c.type === 'RETAIL');
  const salesParties = b2b.length > 0 ? b2b : customers;

  const drafts: InvoiceDraft[] = [];
  const invRng = new Rng(`${tenantId}:finance:invoices`);
  const products = ctx.products;

  const makeSales = (sc: Scenario, i: number): InvoiceDraft => {
    // two thirds to B2B parties, the rest to repeat retail customers
    const cust = i % 3 === 2 && retailers.length > 0 ? retailers[(i * 5) % retailers.length]! : salesParties[i % salesParties.length]!;
    const inter = cust.city.state.toLowerCase() !== ctx.showroom.state.toLowerCase();
    const factor = rateFactor(sc.daysAgo);
    const nProducts = invRng.int(2, 3);
    const raw: SalesLineDraft[] = [];
    for (let k = 0; k < nProducts; k++) {
      const p = invRng.pick(products);
      const qty = p.sellingPaise > 20_000_000n ? invRng.int(1, 2) : invRng.int(2, 6);
      const disc = invRng.chance(0.4) ? { pct: invRng.pick([2, 3, 5]) } : null;
      const pl = priceLine(p, factor, qty, disc);
      const makingUnit = pl.makingPaise;
      const metalUnit = pl.unitPricePaise - makingUnit;
      const metalDiscount = pl.discountPaise > metalUnit * BigInt(qty) ? 0n : pl.discountPaise;
      raw.push({
        product: p, description: `${p.name} (${p.sku}) - ${makingUnit > 0n ? 'metal value incl. wastage' : 'item value'}`, quantity: qty,
        unit: metalUnit, discount: metalDiscount, hsn: '7113', gstRate: 300,
      });
      if (makingUnit > 0n) {
        raw.push({ product: p, description: `${p.name} (${p.sku}) - making charges`, quantity: qty, unit: makingUnit, discount: 0n, hsn: '7113', gstRate: 500 });
      }
    }
    return {
      key: `s${i}`, type: 'SALES', status: sc.status, daysAgo: sc.daysAgo, termDays: sc.term, customer: cust, supplierName: null,
      sourceState: showroomCode, destState: cust.city.stateCode, inter, lines: finalizeLines((k) => eid(ctx, 'inv-line', `s${i}-${k}`), raw, inter),
      notes: `Wholesale order for ${cust.firstName} ${cust.lastName}`, number: '', date: new Date(0), dueDate: new Date(0),
      subtotal: 0n, discount: 0n, tax: 0n, total: 0n, paid: 0n, payments: [],
    };
  };

  const makePurchase = (sc: Scenario, i: number): InvoiceDraft => {
    const supplier = SUPPLIERS[i % SUPPLIERS.length]!;
    const city = CITIES[(i * 3 + 1) % CITIES.length]!;
    const inter = city.stateCode !== showroomCode;
    const factor = rateFactor(sc.daysAgo);
    const gold999 = BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM['GOLD_999']! * 100 * factor));
    const gold916 = BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM['GOLD_916']! * 100 * factor));
    const silver = BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM['SILVER_999']! * 100 * factor));
    const raw: SalesLineDraft[] = [];
    const flavour = i % 4;
    if (flavour === 0 || flavour === 1) raw.push({ product: null, description: 'Gold bar 24K 999, 100 g', quantity: invRng.int(1, 2), unit: gold999 * 100n, discount: 0n, hsn: '7108', gstRate: 300 });
    if (flavour === 1 || flavour === 2) raw.push({ product: null, description: 'Gold 22K 916 alloy sheet, 50 g', quantity: invRng.int(1, 3), unit: gold916 * 50n, discount: 0n, hsn: '7108', gstRate: 300 });
    if (flavour === 2 || flavour === 3) raw.push({ product: null, description: 'Silver 999 bars, 1 kg', quantity: invRng.int(2, 6), unit: silver * 1000n, discount: 0n, hsn: '7106', gstRate: 300 });
    if (flavour === 3) raw.push({ product: null, description: 'Polished diamond parcel (VS-SI), 1.2 ct', quantity: 1, unit: rupees(240000), discount: 0n, hsn: '7102', gstRate: 25 });
    raw.push({ product: null, description: 'Karigar job work: casting and finishing labour', quantity: 1, unit: rupees(invRng.int(8, 30) * 1000), discount: 0n, hsn: '9988', gstRate: 500 });
    const pan = fakePan(invRng, 'F', supplier[0]!);
    return {
      key: `p${i}`, type: 'PURCHASE', status: sc.status, daysAgo: sc.daysAgo, termDays: sc.term, customer: null, supplierName: supplier,
      sourceState: city.stateCode, destState: showroomCode, inter, lines: finalizeLines((k) => eid(ctx, 'inv-line', `p${i}-${k}`), raw, inter),
      notes: `Supplier: ${supplier}, ${city.city}. GSTIN ${fakeGstin(city.stateCode, pan, 1)}. Wholesale purchase.`, number: '', date: new Date(0), dueDate: new Date(0),
      subtotal: 0n, discount: 0n, tax: 0n, total: 0n, paid: 0n, payments: [],
    };
  };

  SALES_SCENARIOS.forEach((sc, i) => drafts.push(makeSales(sc, i)));
  PURCHASE_SCENARIOS.forEach((sc, i) => drafts.push(makePurchase(sc, i)));
  const scenarioOf = (d: InvoiceDraft): Scenario => (d.type === 'SALES' ? SALES_SCENARIOS : PURCHASE_SCENARIOS)[Number(d.key.slice(1))]!;

  // totals, dates, payments
  const payRng = new Rng(`${tenantId}:finance:payments`);
  for (const d of drafts) {
    const { hour, minute } = { hour: payRng.int(10, 18), minute: payRng.int(0, 59) };
    d.date = daysAgoAt(now, d.daysAgo, hour, minute);
    d.dueDate = addDays(d.date, d.termDays);
    d.subtotal = bsum(d.lines.map((l) => l.unitPricePaise * BigInt(l.quantity)));
    d.discount = bsum(d.lines.map((l) => l.discountPaise));
    d.tax = bsum(d.lines.map((l) => l.cgstPaise + l.sgstPaise + l.igstPaise));
    d.total = d.subtotal - d.discount + d.tax;
    const amounts = splitPayments(d.total, scenarioOf(d).pay);
    amounts.forEach((amount, k) => {
      const offset = scenarioOf(d).pay === 'full2' ? (k === 0 ? 5 : 15) : payRng.int(4, 10);
      const date = minusMin(addDays(d.date, Math.min(offset, Math.max(1, d.daysAgo - 1))));
      const method = d.type === 'SALES' ? payRng.pick(['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'BANK_TRANSFER']) : payRng.pick(['BANK_TRANSFER', 'CHEQUE']);
      const ref = method === 'CASH' ? null : `${method === 'UPI' ? 'UPI' : method === 'CHEQUE' ? 'CHQ' : 'NEFT'}${payRng.int(100000000, 999999999)}`;
      d.payments.push({ date, amount, method, reference: ref });
    });
    d.paid = bsum(d.payments.map((p) => p.amount));
  }

  // numbering: contiguous per prefix+month in chronological order
  const invSeq = new Sequencer();
  [...drafts].sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key)).forEach((d) => {
    const prefix = d.type === 'SALES' ? 'INV' : 'PINV';
    d.number = `${prefix}-${yyyymm(d.date)}-${pad(invSeq.next(`${prefix}${yyyymm(d.date)}`))}`;
  });

  // ─── business events -> pending journal entries ───
  const pend: Pending[] = [];
  const issued = (d: InvoiceDraft) => d.status !== 'DRAFT' && d.status !== 'CANCELLED';
  const invJeKey = (d: InvoiceDraft) => `inv-${d.key}`;
  const payments: Array<{ d: InvoiceDraft; idx: number; id: string; date: Date; amount: bigint; method: string; reference: string | null }> = [];

  const bankFor = (d: InvoiceDraft, idx: number): string => ((Number(d.key.slice(1)) + idx) % 2 === 0 ? '1010' : '1020');
  for (const d of drafts) {
    if (!issued(d)) continue;
    const net = d.total - d.tax;
    if (d.type === 'SALES') {
      pend.push({
        key: invJeKey(d), date: d.date, description: `Invoice ${d.number} issued`, reference: d.number,
        legs: [D('1200', d.total, 'Receivable'), C('4000', net, 'Sales revenue'), ...(d.tax > 0n ? [C('2100', d.tax, 'GST output')] : [])],
      });
      pend.push({
        key: `cogs-${d.key}`, date: d.date, description: `Cost of goods for invoice ${d.number}`, reference: d.number,
        legs: [D('5000', cogsOf(net), 'COGS'), C('1400', cogsOf(net), 'Inventory relief')],
      });
    } else {
      pend.push({
        key: invJeKey(d), date: d.date, description: `Invoice ${d.number} issued`, reference: d.number,
        legs: [D('1400', net, 'Purchases / inventory'), ...(d.tax > 0n ? [D('1500', d.tax, 'GST input')] : []), C('2000', d.total, 'Payable')],
      });
    }
    d.payments.forEach((p, idx) => {
      const id = eid(ctx, 'payment', `${d.key}-${idx}`);
      payments.push({ d, idx, id, date: p.date, amount: p.amount, method: p.method, reference: p.reference });
      const cash = p.method === 'CASH' ? '1000' : bankFor(d, idx);
      if (d.type === 'SALES') {
        pend.push({
          key: `pay-${d.key}-${idx}`, date: p.date, description: `Payment received via ${p.method}`, reference: p.reference ?? d.number, paymentId: id,
          legs: [D(cash, p.amount, 'Receipt'), C('1200', p.amount, 'Receivable settled')],
        });
      } else {
        pend.push({
          key: `pay-${d.key}-${idx}`, date: p.date, description: `Payment made via ${p.method}`, reference: p.reference ?? d.number, paymentId: id,
          legs: [D('2000', p.amount, 'Payable settled'), C(cash, p.amount, 'Supplier payment')],
        });
      }
    });
  }

  // retail POS sales
  let giftRedeemed = 0n;
  for (const s of retail.sales) {
    const tax = s.totals.taxPaise;
    const total = s.totals.totalPaise;
    const net = total - tax;
    const byAccount = new Map<string, bigint>();
    for (const p of s.payments) {
      const code = p.method === 'CASH' ? '1000' : p.method === 'GIFT_CARD' ? '2200' : p.method === 'OLD_GOLD' ? '1400' : '1010';
      byAccount.set(code, (byAccount.get(code) ?? 0n) + p.amountPaise);
      if (code === '2200') giftRedeemed += p.amountPaise;
    }
    const paid = bsum([...byAccount.values()]);
    if (paid !== total) byAccount.set('1000', (byAccount.get('1000') ?? 0n) + (total - paid)); // keeps the entry balanced
    pend.push({
      key: `sale-${s.id}`, date: s.date, description: `POS sale ${s.number}`, reference: s.number,
      legs: [...[...byAccount.entries()].filter(([, v]) => v !== 0n).map(([code, v]) => D(code, v, 'Tender')), C('4000', net, 'Sales revenue'), ...(tax > 0n ? [C('2100', tax, 'GST output')] : [])],
    });
    pend.push({
      key: `sale-cogs-${s.id}`, date: s.date, description: `Cost of goods for sale ${s.number}`, reference: s.number,
      legs: [D('5000', cogsOf(net), 'COGS'), C('1400', cogsOf(net), 'Inventory relief')],
    });
  }
  // completed retail returns (cash refund)
  retail.returns.filter((r) => r.status === 'COMPLETED').forEach((r) => {
    const net = r.refundPaise - r.taxPaise;
    const sale = retail.sales.find((s) => s.id === r.saleId);
    pend.push({
      key: `ret-${r.id}`, date: r.date, description: `Sales return for ${sale?.number ?? r.saleId}`, reference: sale?.number ?? r.saleId,
      legs: [D('4000', net, 'Sales returned'), ...(r.taxPaise > 0n ? [D('2100', r.taxPaise, 'GST output reversed')] : []), C('1000', r.refundPaise, 'Cash refund')],
    });
    pend.push({
      key: `ret-cogs-${r.id}`, date: r.date, description: `Inventory restored for return of ${sale?.number ?? r.saleId}`, reference: sale?.number ?? r.saleId,
      legs: [D('1400', cogsOf(net), 'Inventory restored'), C('5000', cogsOf(net), 'COGS reversed')],
    });
  });
  // monthly operating expenses paid from the HDFC account
  const expenseRng = new Rng(`${tenantId}:finance:expenses`);
  for (let k = 3; k >= 0; k--) {
    const base = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const items: Array<[string, number, string, bigint]> = [
      ['5100', 5, 'Shop rent', rupees(150000)],
      ['5300', 12, 'Electricity, internet and insurance', rupees(38000 + expenseRng.int(0, 9) * 1000)],
      ['5200', 28, 'Staff salaries', rupees(310000 + expenseRng.int(0, 5) * 5000)],
    ];
    for (const [code, day, label, amount] of items) {
      const date = new Date(base.getFullYear(), base.getMonth(), day, 11, 0);
      const ago = (now.getTime() - date.getTime()) / 86_400_000;
      if (date.getTime() > now.getTime() || ago > 110) continue;
      pend.push({
        key: `exp-${code}-${k}`, date, description: `${label} ${date.toLocaleString('en-US', { month: 'short' })} ${date.getFullYear()}`, reference: `EXP-${yyyymm(date)}-${code}`,
        legs: [D(code, amount, label), C('1010', amount, 'Paid from bank')],
      });
    }
  }

  // ─── opening entry sized so cash, banks and inventory never go negative ───
  const ordered = (list: Pending[]): Pending[] => list.map((p, i) => ({ p, i })).sort((a, b) => a.p.date.getTime() - b.p.date.getTime() || a.i - b.i).map((x) => x.p);
  const sim = ordered(pend);
  const minCum = (code: string): bigint => {
    let cum = 0n;
    let min = 0n;
    for (const e of sim) {
      for (const l of e.legs) if (l.code === code) cum += l.debit - l.credit;
      if (cum < min) min = cum;
    }
    return min;
  };
  const floors: Array<[string, bigint]> = [['1000', rupees(50000)], ['1010', rupees(500000)], ['1020', rupees(300000)], ['1400', rupees(1000000)]];
  const opening: Record<string, bigint> = {};
  for (const [code, floor] of floors) opening[code] = ceilTo(floor - minCum(code) > 0n ? floor - minCum(code) : 0n, rupees(10000));
  const giftOpening = ceilTo(giftRedeemed, rupees(1000));
  opening['1010'] = (opening['1010'] ?? 0n) + giftOpening;
  const debitsOpening = bsum(Object.values(opening));
  const openingEntry: Pending = {
    key: 'opening', date: daysAgoAt(now, 118, 10), description: 'Opening balances brought forward', reference: 'OPENING',
    legs: [
      ...Object.entries(opening).filter(([, v]) => v > 0n).map(([code, v]) => D(code, v, 'Opening balance')),
      ...(giftOpening > 0n ? [C('2200', giftOpening, 'Gift card liability brought forward')] : []),
      C('3000', debitsOpening - giftOpening, 'Owner capital'),
    ],
  };
  const all = ordered([openingEntry, ...pend]);

  // journal numbers: JE-<yyyymm>-<NNNN>, contiguous per month in chronological order
  const jeSeq = new Sequencer();
  const jeByKey = new Map<string, { id: string; number: string }>();
  for (const e of all) {
    const number = `JE-${yyyymm(e.date)}-${pad(jeSeq.next(yyyymm(e.date)))}`;
    jeByKey.set(e.key, { id: eid(ctx, 'journal', e.key), number });
  }
  for (const e of all) {
    const je = jeByKey.get(e.key)!;
    add('journalEntry', {
      id: je.id, tenantId, entryNumber: je.number, date: e.date, description: e.description.slice(0, 500), reference: e.reference, status: 'POSTED',
      postedAt: e.date, createdAt: e.date, createdBy: admin,
    });
    e.legs.forEach((l, i) => add('journalEntryLine', {
      id: eid(ctx, 'journal-line', `${e.key}-${i}`), tenantId, journalEntryId: je.id, accountId: accId(l.code), debitPaise: l.debit, creditPaise: l.credit,
      description: l.desc, currencyCode: 'INR', exchangeRate: 10000, createdAt: e.date,
    }));
  }

  // ─── bank accounts + statement lines ───
  const bankRng = new Rng(`${tenantId}:finance:banks`);
  const bankDefs = [
    { code: '1010', city: CITIES[0]!, branch: 'Fort Branch, Mumbai', isDefault: true },
    { code: '1020', city: CITIES[1]!, branch: 'Bandra Branch, Mumbai', isDefault: false },
  ];
  const bankIds: Record<string, string> = {};
  const running: Record<string, bigint> = { '1010': 0n, '1020': 0n };
  const paymentIdByKey = new Map(pend.filter((p) => p.paymentId).map((p) => [p.key, p.paymentId!]));
  bankDefs.forEach((b, n) => { bankIds[b.code] = eid(ctx, 'bank-account', n + 1); });
  for (const e of all) {
    for (const code of ['1010', '1020']) {
      const legs = e.legs.filter((l) => l.code === code);
      if (legs.length === 0) continue;
      const dep = bsum(legs.map((l) => l.debit)); // ledger debit = money into the bank
      const wd = bsum(legs.map((l) => l.credit));
      running[code] = running[code]! + dep - wd;
      const reconciled = now.getTime() - e.date.getTime() > 14 * 86_400_000;
      add('bankTransaction', {
        id: eid(ctx, 'bank-txn', `${e.key}-${code}`), tenantId, bankAccountId: bankIds[code]!, transactionDate: e.date, description: e.description.slice(0, 500),
        debitPaise: wd, creditPaise: dep, runningBalancePaise: running[code]!, reference: e.reference, isReconciled: reconciled,
        reconciledWithId: reconciled ? paymentIdByKey.get(e.key) ?? null : null, reconciledAt: reconciled ? minusMin(addDays(e.date, 2)) : null, createdAt: e.date,
      });
    }
  }
  bankDefs.forEach((b, n) => {
    add('bankAccount', {
      id: bankIds[b.code]!, tenantId, accountId: accId(b.code), bankName: b.code === '1010' ? 'HDFC Bank' : 'ICICI Bank', accountNumber: fakeBankAccount(bankRng),
      ifscCode: fakeIfsc(bankRng, b.code === '1010' ? 'HDFC' : 'ICIC'), branchName: b.branch, currencyCode: 'INR', currentBalancePaise: running[b.code]!, isDefault: b.isDefault,
      createdAt: daysAgoAt(now, 119, 10), createdBy: admin,
    });
    void n;
  });

  // ─── financial year, cost centres, budgets ───
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = new Date(startYear, 3, 1);
  const fyId = eid(ctx, 'fy', 1);
  add('financialYear', {
    id: fyId, tenantId, name: `FY ${startYear}-${String(startYear + 1).slice(2)}`, startDate: fyStart, endDate: new Date(startYear + 1, 2, 31), status: 'OPEN',
    createdAt: daysAgoAt(now, 119, 10), createdBy: admin,
  });
  const ccDefs = [['CC-SHOWROOM', 'Showroom', 'Retail showroom operations'], ['CC-WORKSHOP', 'Workshop', 'Karigar workshop and repairs'], ['CC-WAREHOUSE', 'Warehouse', 'Stock room and logistics']];
  ccDefs.forEach(([code, name, desc], i) => add('costCenter', {
    id: eid(ctx, 'cost-center', i + 1), tenantId, code, name, description: desc, isActive: true, createdAt: daysAgoAt(now, 119, 10), createdBy: admin,
  }));
  const budgetDefs: Array<[string, bigint]> = [['5100', rupees(150000)], ['5200', rupees(320000)], ['5300', rupees(42000)]];
  budgetDefs.forEach(([code, monthly], i) => {
    const actual = bsum(all.filter((e) => e.date >= fyStart).flatMap((e) => e.legs).filter((l) => l.code === code).map((l) => l.debit - l.credit));
    add('budget', {
      id: eid(ctx, 'budget', i + 1), tenantId, costCenterId: eid(ctx, 'cost-center', 1), accountId: accId(code), financialYearId: fyId,
      monthlyBudgets: Array.from({ length: 12 }, () => Number(monthly)), totalBudgetPaise: monthly * 12n, totalActualPaise: actual,
      createdAt: daysAgoAt(now, 119, 10), createdBy: admin,
    });
  });

  // ─── invoice rows ───
  for (const d of drafts) {
    const iss = issued(d);
    const lastEvent = d.payments.length > 0 ? d.payments[d.payments.length - 1]!.date : d.date;
    add('invoice', {
      id: eid(ctx, 'invoice', d.key), tenantId, invoiceNumber: d.number, invoiceType: d.type, customerId: d.customer ? d.customer.id : null, supplierId: null,
      locationId: ctx.showroom.id, status: d.status, subtotalPaise: d.subtotal, discountPaise: d.discount, taxPaise: d.tax, totalPaise: d.total, currencyCode: 'INR',
      dueDate: d.dueDate, paidPaise: d.paid, notes: d.notes, terms: `Payment within ${d.termDays} days of invoice date.`,
      journalEntryId: iss ? jeByKey.get(invJeKey(d))!.id : null, createdAt: d.date, updatedAt: lastEvent, createdBy: admin,
    });
    d.lines.forEach((l, k) => {
      add('invoiceLineItem', {
        id: l.id, tenantId, invoiceId: eid(ctx, 'invoice', d.key), productId: l.productId, description: l.description, quantity: l.quantity, unitPricePaise: l.unitPricePaise,
        discountPaise: l.discountPaise, taxableAmountPaise: l.taxablePaise, hsnCode: l.hsnCode, gstRate: l.gstRate, cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise,
        igstPaise: l.igstPaise, totalPaise: l.totalPaise, createdAt: new Date(d.date.getTime() + k),
      });
      const taxRows: Array<['CGST' | 'SGST' | 'IGST', number, bigint]> = [];
      if (l.cgstPaise > 0n) taxRows.push(['CGST', Math.floor(l.gstRate / 2), l.cgstPaise]);
      if (l.sgstPaise > 0n) taxRows.push(['SGST', l.gstRate - Math.floor(l.gstRate / 2), l.sgstPaise]);
      if (l.igstPaise > 0n) taxRows.push(['IGST', l.gstRate, l.igstPaise]);
      taxRows.forEach(([type, rate, amount]) => add('taxTransaction', {
        id: eid(ctx, 'tax-txn', `${d.key}-${k}-${type}`), tenantId, invoiceId: eid(ctx, 'invoice', d.key), taxType: type, taxRate: rate, taxableAmountPaise: l.taxablePaise,
        taxAmountPaise: amount, hsnCode: l.hsnCode, sourceState: d.sourceState, destState: d.destState, isReverseCharge: false, createdAt: d.date,
      }));
    });
  }

  // payments, numbered PAY-<yyyymm>-<NNNN> chronologically
  const paySeq = new Sequencer();
  [...payments].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id)).forEach((p) => {
    add('payment', {
      id: p.id, tenantId, paymentNumber: `PAY-${yyyymm(p.date)}-${pad(paySeq.next(yyyymm(p.date)))}`, paymentType: p.d.type === 'SALES' ? 'RECEIVED' : 'MADE', method: p.method,
      amountPaise: p.amount, currencyCode: 'INR', customerId: p.d.customer ? p.d.customer.id : null, supplierId: null, invoiceId: eid(ctx, 'invoice', p.d.key),
      reference: p.reference, status: 'COMPLETED', processedAt: p.date, journalEntryId: jeByKey.get(`pay-${p.d.key}-${p.idx}`)!.id, createdAt: p.date, createdBy: admin,
    });
  });

  // ─── Girvi ───
  const kycs = customers.filter((c) => c.kyc);
  const girviRng = new Rng(`${tenantId}:finance:girvi`);
  interface LoanCfg {
    daysAgo: number; tenure: number; rate: number; type: 'SIMPLE' | 'COMPOUND'; metal: 'GOLD' | 'SILVER'; purity: number; netG: number; ltv: number;
    pattern: 'none' | 'interest' | 'partial' | 'closed'; closedAgo?: number;
  }
  const loanCfgs: LoanCfg[] = [
    { daysAgo: 18, tenure: 180, rate: 1800, type: 'SIMPLE', metal: 'GOLD', purity: 916, netG: 24, ltv: 70, pattern: 'none' },
    { daysAgo: 45, tenure: 180, rate: 1800, type: 'SIMPLE', metal: 'GOLD', purity: 916, netG: 41, ltv: 75, pattern: 'interest' },
    { daysAgo: 75, tenure: 365, rate: 1500, type: 'SIMPLE', metal: 'SILVER', purity: 925, netG: 820, ltv: 60, pattern: 'interest' },
    { daysAgo: 95, tenure: 365, rate: 2400, type: 'COMPOUND', metal: 'GOLD', purity: 750, netG: 36, ltv: 70, pattern: 'partial' },
    { daysAgo: 110, tenure: 180, rate: 1800, type: 'SIMPLE', metal: 'GOLD', purity: 916, netG: 58, ltv: 75, pattern: 'closed', closedAgo: 35 },
    { daysAgo: 70, tenure: 120, rate: 1800, type: 'SIMPLE', metal: 'GOLD', purity: 916, netG: 19, ltv: 70, pattern: 'closed', closedAgo: 12 },
    { daysAgo: 100, tenure: 75, rate: 2400, type: 'SIMPLE', metal: 'GOLD', purity: 916, netG: 33, ltv: 70, pattern: 'none' },
    { daysAgo: 68, tenure: 60, rate: 1800, type: 'SIMPLE', metal: 'GOLD', purity: 750, netG: 27, ltv: 65, pattern: 'none' },
  ];
  const itemNames = { GOLD: ['Gold necklace', 'Gold bangles (pair)', 'Gold chain', 'Gold ring', 'Gold earrings'], SILVER: ['Silver utensil set', 'Silver anklets (pair)', 'Silver plate'] };
  const loanSeq = new Sequencer();
  const loanDrafts = loanCfgs.map((cfg, i) => ({ cfg, i, disbursed: daysAgoAt(now, cfg.daysAgo, 12) }))
    .sort((a, b) => a.disbursed.getTime() - b.disbursed.getTime());
  loanDrafts.forEach(({ cfg, i, disbursed }) => {
    const cust = kycs.length > 0 ? kycs[i % kycs.length]! : customers[i % customers.length]!;
    const number = `GRV-${yyyymm(disbursed)}-${pad(loanSeq.next(`GRV${yyyymm(disbursed)}`))}`;
    const id = eid(ctx, 'girvi-loan', i + 1);
    const netMg = BigInt(cfg.netG) * 1000n;
    const grossMg = netMg + netMg / 12n + 300n;
    const baseKey = cfg.metal === 'GOLD' ? 'GOLD_999' : 'SILVER_999';
    const ratePerGram = BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM[baseKey]! * 100 * rateFactor(cfg.daysAgo)));
    // appraisal = net weight (g) x rate of pure metal per gram x fineness / 999
    const appraised = roundDiv(netMg * ratePerGram * BigInt(cfg.purity), 1000n * 999n);
    const loanAmt = ((appraised * BigInt(cfg.ltv)) / 100n / 100n) * 100n;
    // collateral items summing exactly to the net weight
    const names = itemNames[cfg.metal];
    const nItems = cfg.metal === 'GOLD' ? girviRng.int(2, 3) : 2;
    let left = netMg;
    const items: string[] = [];
    for (let k = 0; k < nItems; k++) {
      const part = k === nItems - 1 ? left : (left * BigInt(girviRng.int(30, 55))) / 100n;
      left -= part;
      items.push(`${names[(i + k) % names.length]} ${Number(part) / 1000} g`);
    }
    let principal = Number(loanAmt);
    let interestOut = 0;
    let paidInt = 0;
    let paidPrin = 0;
    let prevAgo = cfg.daysAgo;
    let cumNote = 0;
    const accrue = (ago: number) => {
      const days = prevAgo - ago;
      if (days <= 0) return;
      const interest = girviInterest(principal, cfg.rate, days, cfg.type, cfg.type === 'COMPOUND' ? 'MONTHLY' : null);
      interestOut += interest;
      cumNote += 1;
      add('girviInterestAccrual', {
        id: eid(ctx, 'girvi-accrual', `${i}-${cumNote}`), tenantId, girviLoanId: id, accrualDate: daysAgoAt(now, ago, 9), daysCalculated: days, principalPaise: BigInt(principal),
        rateBps: cfg.rate, interestPaise: BigInt(interest), cumulativeInterestPaise: BigInt(interestOut), createdAt: daysAgoAt(now, ago, 9),
      });
      prevAgo = ago;
    };
    let payN = 0;
    const pay = (ago: number, kind: 'interest' | 'both' | 'closure') => {
      let interestPay = interestOut;
      let principalPay = 0;
      if (kind === 'both') principalPay = Math.floor((principal * 0.25) / 100) * 100;
      if (kind === 'closure') principalPay = principal;
      const total = interestPay + principalPay;
      const method = girviRng.pick(['CASH', 'UPI', 'BANK_TRANSFER']);
      payN += 1;
      add('girviPayment', {
        id: eid(ctx, 'girvi-payment', `${i}-${payN}`), tenantId, girviLoanId: id, paymentDate: daysAgoAt(now, ago, 15), paymentType: kind === 'interest' ? 'INTEREST_ONLY' : kind === 'both' ? 'BOTH' : 'CLOSURE',
        principalPaise: BigInt(principalPay), interestPaise: BigInt(interestPay), totalPaise: BigInt(total), method, reference: method === 'CASH' ? null : `${method === 'UPI' ? 'UPI' : 'NEFT'}${girviRng.int(100000000, 999999999)}`,
        receivedBy: 'Counter staff', createdAt: daysAgoAt(now, ago, 15), createdBy: admin,
      });
      principal -= principalPay;
      interestOut -= interestPay;
      paidInt += interestPay;
      paidPrin += principalPay;
      interestPay = 0;
    };
    const closeAgo = cfg.closedAgo ?? 0;
    let monthIdx = 0;
    for (let ago = cfg.daysAgo - 30; ago > Math.max(closeAgo + 3, 3); ago -= 30) {
      accrue(ago);
      monthIdx += 1;
      if (cfg.pattern === 'interest' || cfg.pattern === 'closed' || cfg.pattern === 'partial') {
        if (ago - 2 > Math.max(closeAgo + 1, 1)) pay(ago - 2, cfg.pattern === 'partial' && monthIdx === 2 ? 'both' : 'interest');
      }
    }
    if (cfg.pattern === 'closed') {
      accrue(closeAgo);
      pay(closeAgo, 'closure');
    } else if (prevAgo - 1 >= 5) accrue(1);
    const closed = cfg.pattern === 'closed';
    const status = closed ? 'CLOSED' : principal < Number(loanAmt) ? 'PARTIALLY_PAID' : 'ACTIVE';
    add('girviLoan', {
      id, tenantId, loanNumber: number, customerId: cust.id, locationId: ctx.showroom.id, status, collateralDescription: items.join('; '), collateralImages: [], metalType: cfg.metal,
      grossWeightMg: grossMg, netWeightMg: netMg, purityFineness: cfg.purity, appraisedValuePaise: appraised, loanAmountPaise: loanAmt, interestRate: cfg.rate, interestType: cfg.type,
      compoundingPeriod: cfg.type === 'COMPOUND' ? 'MONTHLY' : null, disbursedDate: disbursed, dueDate: addDays(disbursed, cfg.tenure), closedDate: closed ? daysAgoAt(now, closeAgo, 15) : null,
      totalInterestPaidPaise: BigInt(paidInt), totalPrincipalPaidPaise: BigInt(paidPrin), outstandingPrincipalPaise: BigInt(principal), outstandingInterestPaise: BigInt(interestOut),
      aadhaarVerified: cust.aadhaar !== null, panVerified: cust.pan !== null, notes: status === 'ACTIVE' && addDays(disbursed, cfg.tenure) < now ? 'Overdue: reminder sent to customer' : 'Demo girvi loan',
      createdAt: disbursed, createdBy: admin,
    });
  });

  // ─── Gold savings + kitty / chit ───
  const schemeRng = new Rng(`${tenantId}:finance:schemes`);
  const members = schemeRng.shuffle(retailers.length >= 8 ? retailers : customers);
  const methods = ['CASH', 'UPI', 'BANK_TRANSFER'] as const;
  const gsDefs = [
    { key: 1, name: 'Swarna Sanchay 11+1', monthly: rupees(5000), months: 12, bonusMonths: 1, bonusPct: 500, startAgo: 100, status: 'ACTIVE', count: 8, from: 0, terms: 'Pay 11 monthly instalments, the 12th is on us. Redeemable against jewellery only.' },
    { key: 2, name: 'Akshaya Gold Plan', monthly: rupees(2000), months: 6, bonusMonths: 0, bonusPct: 300, startAgo: 55, status: 'OPEN', count: 3, from: 8, terms: 'Six month plan with 3% maturity bonus.' },
  ];
  for (const g of gsDefs) {
    const schemeId = eid(ctx, 'gs-scheme', g.key);
    const start = daysAgoAt(now, g.startAgo, 11);
    add('goldSavingsScheme', {
      id: schemeId, tenantId, schemeName: g.name, monthlyAmountPaise: g.monthly, durationMonths: g.months, bonusMonths: g.bonusMonths, maturityBonusPercent: g.bonusPct,
      startDate: start, status: g.status, terms: g.terms, createdAt: start, createdBy: admin,
    });
    const paidMonths = g.months - g.bonusMonths;
    for (let m = 0; m < g.count; m++) {
      const cust = members[(g.from + m) % members.length]!;
      const joined = addDays(start, m * 2);
      const memberId = eid(ctx, 'gs-member', `${g.key}-${m}`);
      const basePaid = g.monthly * BigInt(paidMonths);
      const maturityValue = basePaid + g.monthly * BigInt(g.bonusMonths) + (basePaid * BigInt(g.bonusPct)) / 10000n;
      const missLast = m % 4 === 3;
      let totalPaid = 0n;
      for (let i = 1; i <= paidMonths; i++) {
        const due = addMonths(joined, i);
        const isPast = due.getTime() <= now.getTime();
        let status: 'PAID' | 'OVERDUE' | 'PENDING' = 'PENDING';
        let paidDate: Date | null = null;
        if (isPast) {
          const pastCount = Array.from({ length: paidMonths }, (_, x) => addMonths(joined, x + 1)).filter((x) => x.getTime() <= now.getTime()).length;
          if (missLast && i === pastCount) status = 'OVERDUE';
          else {
            status = 'PAID';
            paidDate = minusMin(addDays(due, -schemeRng.int(0, 3)));
            if (paidDate < joined) paidDate = joined;
          }
        }
        const method = schemeRng.pick(methods);
        if (status === 'PAID') totalPaid += g.monthly;
        add('goldSavingsInstallment', {
          id: eid(ctx, 'gs-inst', `${g.key}-${m}-${i}`), tenantId, goldSavingsMemberId: memberId, installmentNumber: i, dueDate: due, paidDate, amountPaise: g.monthly,
          method: status === 'PAID' ? method : null, reference: status === 'PAID' && method !== 'CASH' ? `${method === 'UPI' ? 'UPI' : 'NEFT'}${schemeRng.int(100000000, 999999999)}` : null,
          status, createdAt: joined, createdBy: admin,
        });
      }
      add('goldSavingsMember', {
        id: memberId, tenantId, goldSavingsSchemeId: schemeId, customerId: cust.id, memberNumber: `GS-${pad(m + 1)}`, joinedDate: joined, status: 'ACTIVE', totalPaidPaise: totalPaid,
        maturityDate: addMonths(joined, g.months), maturityValuePaise: maturityValue, createdAt: joined, createdBy: admin,
      });
    }
  }

  const kittyDefs = [
    { key: 1, name: 'Lakshmi Kitty', type: 'KITTY', monthly: rupees(2000), months: 12, bonus: 800, startAgo: 100, max: 8, count: 8, from: 3, status: 'ACTIVE', terms: 'Monthly kitty, lucky draw each month. Bonus credited on maturity.' },
    { key: 2, name: 'Mangal Chit Fund', type: 'CHIT', monthly: rupees(10000), months: 10, bonus: 500, startAgo: 75, max: 5, count: 5, from: 12, status: 'ACTIVE', terms: 'Chit scheme: auction in the last week of each month.' },
  ] as const;
  for (const k of kittyDefs) {
    const schemeId = eid(ctx, 'kitty-scheme', k.key);
    const start = daysAgoAt(now, k.startAgo, 11);
    add('kittyScheme', {
      id: schemeId, tenantId, schemeName: k.name, schemeType: k.type, monthlyAmountPaise: k.monthly, durationMonths: k.months, totalValuePaise: k.monthly * BigInt(k.months),
      bonusPercent: k.bonus, startDate: start, endDate: addMonths(start, k.months), status: k.status, maxMembers: k.max, currentMembers: k.count, terms: k.terms, createdAt: start, createdBy: admin,
    });
    for (let m = 0; m < k.count; m++) {
      const cust = members[(k.from + m) % members.length]!;
      const joined = addDays(start, Math.min(m, 3));
      const memberId = eid(ctx, 'kitty-member', `${k.key}-${m}`);
      const defaulted = k.key === 1 && m === 7;
      const missLast = m % 4 === 3;
      const pastDue = Array.from({ length: k.months }, (_, x) => x + 1).filter((i) => addMonths(start, i).getTime() <= now.getTime());
      let paidCount = 0;
      let totalPaid = 0n;
      for (let i = 1; i <= k.months; i++) {
        const due = addMonths(start, i);
        const isPast = due.getTime() <= now.getTime();
        let status: 'PAID' | 'OVERDUE' | 'PENDING' = 'PENDING';
        let paidDate: Date | null = null;
        let lateFee = 0n;
        if (isPast) {
          const missed = defaulted ? i > pastDue.length - 3 : missLast && i === pastDue.length;
          if (missed) status = 'OVERDUE';
          else {
            status = 'PAID';
            const late = schemeRng.chance(0.15) && addDays(due, 4).getTime() <= now.getTime() - 86_400_000;
            paidDate = late ? addDays(due, 4) : minusMin(addDays(due, -schemeRng.int(0, 3)));
            if (paidDate < joined) paidDate = joined;
            if (late) lateFee = rupees(100);
          }
        }
        const method = schemeRng.pick(methods);
        if (status === 'PAID') {
          paidCount += 1;
          totalPaid += k.monthly;
        }
        add('kittyInstallment', {
          id: eid(ctx, 'kitty-inst', `${k.key}-${m}-${i}`), tenantId, kittyMemberId: memberId, installmentNumber: i, dueDate: due, paidDate, amountPaise: k.monthly, lateFeePaise: lateFee,
          method: status === 'PAID' ? method : null, reference: status === 'PAID' && method !== 'CASH' ? `${method === 'UPI' ? 'UPI' : 'NEFT'}${schemeRng.int(100000000, 999999999)}` : null,
          status, createdAt: joined, createdBy: admin,
        });
      }
      add('kittyMember', {
        id: memberId, tenantId, kittySchemeId: schemeId, customerId: cust.id, memberNumber: `${k.name.slice(0, 3).toUpperCase()}-${pad(m + 1)}`, joinedDate: joined,
        status: defaulted ? 'DEFAULTED' : 'ACTIVE', paidInstallments: paidCount, totalPaidPaise: totalPaid, createdAt: joined, createdBy: admin,
      });
    }
  }

  // ─── BNPL ───
  const providerId = eid(ctx, 'bnpl-provider', 1);
  add('bnplProvider', {
    id: providerId, tenantId, providerName: 'CUSTOM', displayName: 'JewelPay Later (demo)', apiKey: null, apiSecret: null, webhookSecret: null, isActive: true,
    minOrderPaise: rupees(10000), maxOrderPaise: rupees(500000), supportedTenures: [3, 6, 12], processingFeePct: 0, settings: { sandbox: true, demo: true }, createdAt: daysAgoAt(now, 100, 10), createdBy: admin,
  });
  const plans = [
    { key: 1, tenure: 3, rate: 0, bank: null, fee: 0n, noCost: true, subvention: 300, card: null },
    { key: 2, tenure: 6, rate: 1200, bank: 'HDFC Bank', fee: rupees(999), noCost: false, subvention: 0, card: 'CREDIT' },
    { key: 3, tenure: 12, rate: 1400, bank: 'ICICI Bank', fee: rupees(1499), noCost: false, subvention: 0, card: 'BOTH' },
  ] as const;
  for (const p of plans) {
    add('emiPlan', {
      id: eid(ctx, 'emi-plan', p.key), tenantId, providerId, bankName: p.bank, tenure: p.tenure, interestRatePct: p.rate, processingFeePaise: p.fee, minAmountPaise: rupees(10000),
      maxAmountPaise: rupees(500000), isNoCostEmi: p.noCost, subventionPct: p.subvention, isActive: true, cardType: p.card, createdAt: daysAgoAt(now, 100, 10), createdBy: admin,
    });
  }
  const eligible = retail.sales.filter((s) => s.customerId && s.totals.totalPaise >= rupees(10000) && s.totals.totalPaise <= rupees(500000));
  const targets: Array<{ plan: (typeof plans)[number]; age: number }> = [{ plan: plans[0], age: 78 }, { plan: plans[1], age: 45 }, { plan: plans[2], age: 8 }];
  const usedSales = new Set<string>();
  targets.forEach((tg, n) => {
    const cand = eligible.filter((s) => !usedSales.has(s.id)).sort((a, b) => Math.abs((now.getTime() - a.date.getTime()) / 86_400_000 - tg.age) - Math.abs((now.getTime() - b.date.getTime()) / 86_400_000 - tg.age))[0];
    if (!cand) return;
    usedSales.add(cand.id);
    const amount = Number(cand.totals.totalPaise);
    const calc = emiOf(amount, tg.plan.tenure, tg.plan.rate);
    const start = cand.date;
    const sched = emiSchedule(amount, tg.plan.tenure, tg.plan.rate, start);
    const txId = eid(ctx, 'bnpl-txn', n + 1);
    let paidCount = 0;
    const firstUnpaid = sched.find((s) => s.due.getTime() > now.getTime());
    sched.forEach((s) => {
      const paid = s.due.getTime() <= now.getTime();
      if (paid) paidCount += 1;
      const soon = firstUnpaid && s.n === firstUnpaid.n && s.due.getTime() - now.getTime() <= 7 * 86_400_000;
      add('emiSchedule', {
        id: eid(ctx, 'emi-sched', `${n + 1}-${s.n}`), tenantId, transactionId: txId, installmentNumber: s.n, dueDate: s.due, amountPaise: BigInt(s.amount), principalPaise: BigInt(s.principal),
        interestPaise: BigInt(s.interest), status: paid ? 'PAID' : soon ? 'DUE' : 'UPCOMING', paidAt: paid ? s.due : null, paidAmountPaise: paid ? BigInt(s.amount) : null, lateFeePaise: 0n, createdAt: start,
      });
    });
    const allPaid = paidCount === sched.length;
    add('bnplTransaction', {
      id: txId, tenantId, orderId: cand.id, customerId: cand.customerId, providerName: 'CUSTOM', planId: eid(ctx, 'emi-plan', tg.plan.key), orderAmountPaise: BigInt(amount),
      emiAmountPaise: BigInt(calc.emi), tenure: tg.plan.tenure, interestPaise: BigInt(sched.reduce((a, x) => a + x.interest, 0)), processingFeePaise: tg.plan.fee, totalPayablePaise: BigInt(sched.reduce((a, x) => a + x.amount, 0)) + tg.plan.fee,
      status: allPaid ? 'COMPLETED' : paidCount > 0 ? 'ACTIVE' : 'APPROVED', externalTransactionId: `JPL${100000 + n * 7919}`, providerResponse: { status: 'APPROVED', sandbox: true },
      approvedAt: minusMin(new Date(start.getTime() + 3_600_000)), nextDueDate: firstUnpaid ? firstUnpaid.due : null, completedAt: allPaid ? sched[sched.length - 1]!.due : null,
      createdAt: start, createdBy: admin,
    });
  });

  // ─── assemble, FK (parent-first) order ───
  const order = [
    'account', 'financialYear', 'costCenter', 'budget', 'bankAccount', 'invoice', 'invoiceLineItem', 'taxTransaction', 'journalEntry', 'journalEntryLine', 'payment',
    'bankTransaction', 'girviLoan', 'girviPayment', 'girviInterestAccrual', 'kittyScheme', 'kittyMember', 'kittyInstallment', 'goldSavingsScheme', 'goldSavingsMember',
    'goldSavingsInstallment', 'bnplProvider', 'emiPlan', 'bnplTransaction', 'emiSchedule',
  ];
  const tables: TablePlan[] = order.filter((m) => t[m] && t[m]!.length > 0).map((m) => ({ model: m, rows: t[m]! }));
  return { name: 'finance', sentinel: { model: 'bankAccount', id: eid(ctx, 'bank-account', 1) }, tables, stockDeltas: [] };
}
