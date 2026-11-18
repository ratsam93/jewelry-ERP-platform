/**
 * Retail planner: POS sales (line items, GST, payments), returns, repairs, custom orders,
 * gift cards, old-gold purchases, appraisals and discounts. Pricing and GST reuse the exact
 * rules of RetailPricingService (3% on metal, 5% on making, CGST+SGST intra-state, IGST inter-state,
 * total rounded to the rupee) and the sale/repair/return numbers use the API's number formats.
 */
import { DEMO_RATE_RUPEES_PER_GRAM } from '../seed-demo-catalog-data';
import {
  Rng, Sequencer, addDays, businessTime, bsum, daysAgoAt, eid, pad, pickWeighted, rateFactor, rateKey, roundDiv,
  roundToRupee, rupees, spreadDayOffsets, yymm, type DemoContext, type ModulePlan, type ProductInfo, type Row, type TablePlan,
} from './common';
import type { DemoCustomer, SaleRef } from './plan-crm';

export const SALE_COUNT = 72;
export const HIGH_VALUE_PAISE = 20_000_000n; // Rs 2,00,000 needs a KYC-verified buyer

export interface PricedLine {
  product: ProductInfo;
  quantity: number;
  unitPricePaise: bigint;
  makingPaise: bigint;
  wastagePaise: bigint;
  ratePaisePerGram: bigint;
  metalWeightMg: bigint;
  discountPaise: bigint;
  discountType: 'PERCENTAGE' | 'FIXED' | null;
}

export interface TaxedLine extends PricedLine {
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  lineTotalPaise: bigint;
  taxablePaise: bigint;
}

/** Price one catalog line the way the POS does (metal rate x weight + making + wastage). */
export function priceLine(product: ProductInfo, factor: number, quantity: number, discount: { pct: number } | null): PricedLine {
  let unit: bigint;
  let making = 0n;
  let wastage = 0n;
  let ratePerGram = 0n;
  let weight = 0n;
  const rupeeRate = DEMO_RATE_RUPEES_PER_GRAM[rateKey(product.productType, product.purity)];
  if (!product.fixedPrice && rupeeRate !== undefined) {
    ratePerGram = BigInt(Math.round(rupeeRate * 100 * factor));
    weight = product.metalWeightMg;
    const metal = roundDiv(ratePerGram * weight, 1000n);
    wastage = roundDiv(metal * BigInt(product.wastageBps), 10000n);
    making = product.makingPaise;
    unit = metal + making + wastage;
  } else {
    unit = roundDiv(product.sellingPaise * 100n, 103n);
  }
  const base = unit * BigInt(quantity);
  let discountPaise = 0n;
  if (discount) discountPaise = roundToRupee((base * BigInt(discount.pct)) / 100n);
  return {
    product, quantity, unitPricePaise: unit, makingPaise: making, wastagePaise: wastage, ratePaisePerGram: ratePerGram,
    metalWeightMg: weight, discountPaise, discountType: discount ? 'PERCENTAGE' : null,
  };
}

/** Mirrors RetailPricingService.calculateTax for one line (BigInt, 3% metal / 5% making). */
export function taxLine(line: PricedLine, interState: boolean): TaxedLine {
  const q = BigInt(line.quantity);
  const base = line.unitPricePaise * q;
  const taxable = base - line.discountPaise;
  let makingTaxable = 0n;
  const makingGross = line.makingPaise * q;
  if (makingGross > 0n && base > 0n) {
    const capped = makingGross > base ? base : makingGross;
    makingTaxable = capped - (line.discountPaise * capped) / base;
    if (makingTaxable > taxable) makingTaxable = taxable;
    if (makingTaxable < 0n) makingTaxable = 0n;
  }
  const metalTaxable = taxable - makingTaxable;
  const makingRate = makingTaxable > 0n ? 500n : 300n;
  const numerator = metalTaxable * 300n + makingTaxable * makingRate;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  if (interState) igst = roundDiv(numerator, 10000n);
  else {
    cgst = roundDiv(numerator, 20000n);
    sgst = cgst;
  }
  return { ...line, cgstPaise: cgst, sgstPaise: sgst, igstPaise: igst, taxablePaise: taxable, lineTotalPaise: taxable + cgst + sgst + igst };
}

export interface SaleTotals {
  subtotalPaise: bigint;
  taxPaise: bigint;
  roundOffPaise: bigint;
  totalPaise: bigint;
}

/** Mirrors RetailPricingService.calculateTotal with no sale-level discount. */
export function totalsOf(lines: TaxedLine[]): SaleTotals {
  const subtotal = bsum(lines.map((l) => l.unitPricePaise * BigInt(l.quantity) - l.discountPaise));
  const tax = bsum(lines.map((l) => l.cgstPaise + l.sgstPaise + l.igstPaise));
  const before = subtotal + tax;
  const total = roundDiv(before, 100n) * 100n;
  return { subtotalPaise: subtotal, taxPaise: tax, roundOffPaise: total - before, totalPaise: total };
}

export interface SalePayment {
  method: string;
  amountPaise: bigint;
  reference: string | null;
}

export interface SaleInfo {
  id: string;
  number: string;
  date: Date;
  customerId: string | null;
  status: 'COMPLETED' | 'PARTIALLY_RETURNED';
  lines: Array<TaxedLine & { id: string }>;
  totals: SaleTotals;
  payments: SalePayment[];
}

export interface StockMove {
  productId: string;
  where: 'showroom' | 'warehouse';
  delta: number;
  movementType: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST' | 'RETURN';
  referenceType: string;
  referenceId: string;
  date: Date;
  notes: string;
  unitCostPaise: bigint | null;
}

export interface ReturnInfo {
  id: string;
  date: Date;
  saleId: string;
  status: string;
  refundPaise: bigint;
  taxPaise: bigint;
  costPaise: bigint;
}

export interface RetailResult {
  module: ModulePlan;
  sales: SaleInfo[];
  returns: ReturnInfo[];
  stockMoves: StockMove[];
  salesByCustomer: Map<string, SaleRef[]>;
  oldGoldIds: string[];
  giftCards: Array<{ issued: Date; initialPaise: bigint }>;
  /** Old gold bought for cash (not exchanged against a sale). */
  oldGoldPurchased: Array<{ date: Date; amountPaise: bigint }>;
}

function locCode(city: string): string {
  return city.substring(0, 3).toUpperCase();
}

export function planRetail(ctx: DemoContext, customers: DemoCustomer[]): RetailResult {
  const rng = new Rng(`${ctx.tenantId}:retail`);
  const { now } = ctx;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const admin = ctx.adminUserId;
  const lc = locCode(ctx.showroom.city);
  const seq = new Sequencer();

  const buyers = [
    ...customers.map((c) => ({ id: c.id, state: c.city.state, kyc: c.kyc })),
    ...ctx.existingCustomers.map((c) => ({ id: c.id, state: c.state || ctx.showroom.state, kyc: true })),
  ];
  const kycBuyers = buyers.filter((b) => b.kyc);
  const cap = new Map<string, number>();
  const sellable = ctx.products.filter((p) => p.qty0 >= 2);
  for (const p of sellable) cap.set(p.id, Math.floor(p.qty0 / 2));
  const takeProduct = (): ProductInfo | null => {
    const avail = sellable.filter((p) => (cap.get(p.id) ?? 0) > 0);
    if (avail.length === 0) return null;
    // lighter items sell more often
    const p = pickWeighted(rng, avail.map((x) => [x, x.sellingPaise < 20_000_000n ? 3 : 1] as const));
    cap.set(p.id, cap.get(p.id)! - 1);
    return p;
  };

  // gift cards, issued before the sales that redeem them
  const giftCards = Array.from({ length: 8 }, (_, i) => {
    const initial = rupees([5000, 10000, 25000, 50000, 2000, 15000, 10000, 5000][i]!);
    return { id: eid(ctx, 'giftcard', i), number: `${rng.int(4000, 4999)}${rng.int(1000, 9999)}${rng.int(1000, 9999)}${rng.int(1000, 9999)}`, initial, balance: initial, redeemed: 0n, issued: daysAgoAt(now, rng.int(20, 85), 13) };
  });

  const offsets = spreadDayOffsets(rng, now, SALE_COUNT);
  const drafts: SaleInfo[] = [];
  let gcCursor = 0;
  for (let i = 0; i < SALE_COUNT; i++) {
    const daysBack = offsets[i]!;
    const { hour, minute } = businessTime(rng);
    const date = daysAgoAt(now, daysBack, hour, minute);
    const lineCount = pickWeighted(rng, [[1, 5], [2, 3], [3, 1]] as const);
    const products: ProductInfo[] = [];
    for (let k = 0; k < lineCount; k++) {
      const p = takeProduct();
      if (p) products.push(p);
    }
    if (products.length === 0) continue;
    const factor = rateFactor(daysBack);
    const build = (state: string | null) => {
      const interState = state !== null && state.toLowerCase() !== ctx.showroom.state.toLowerCase();
      const lines = products.map((p, k) => {
        const disc = rng.chance(0.22) ? { pct: rng.pick([2, 3, 5]) } : null;
        return { ...taxLine(priceLine(p, factor, 1, disc), interState), id: eid(ctx, 'sale-line', `${i}-${k}`) };
      });
      return { lines, totals: totalsOf(lines) };
    };
    let buyer: { id: string; state: string; kyc: boolean } | null = rng.chance(0.68) ? rng.pick(buyers) : null;
    let built = build(buyer ? buyer.state : null);
    if (built.totals.totalPaise >= HIGH_VALUE_PAISE && !(buyer && buyer.kyc)) {
      buyer = rng.pick(kycBuyers);
      built = build(buyer.state);
    }
    const total = built.totals.totalPaise;
    const payments: SalePayment[] = [];
    let remaining = total;
    // stored-value instruments on a few sales
    if (buyer && i % 9 === 4 && gcCursor < 4) {
      const gc = giftCards[gcCursor++]!;
      const part = roundToRupee(total / 3n);
      const amount = part > gc.balance ? gc.balance : part;
      if (amount >= 50_000n) {
        gc.balance -= amount;
        gc.redeemed += amount;
        payments.push({ method: 'GIFT_CARD', amountPaise: amount, reference: gc.number });
        remaining -= amount;
      }
    }
    const mode = pickWeighted(rng, [['UPI', 35], ['CARD', 25], ['CASH', 20], ['BANK_TRANSFER', 10], ['MIXED', 10]] as const);
    if (mode === 'MIXED' && remaining > 0n) {
      const cash = roundToRupee(remaining / 3n);
      payments.push({ method: 'CASH', amountPaise: cash, reference: null }, { method: 'UPI', amountPaise: remaining - cash, reference: `UPI${rng.int(100000000, 999999999)}` });
    } else if (remaining > 0n) {
      const ref = mode === 'CASH' ? null : `${mode === 'UPI' ? 'UPI' : mode === 'CARD' ? 'POS' : 'NEFT'}${rng.int(100000000, 999999999)}`;
      payments.push({ method: mode === 'MIXED' ? 'UPI' : mode, amountPaise: remaining, reference: ref });
    }
    drafts.push({ id: eid(ctx, 'sale', i), number: '', date, customerId: buyer?.id ?? null, status: 'COMPLETED', lines: built.lines, totals: built.totals, payments });
  }
  drafts.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const s of drafts) s.number = `SL/${lc}/${yymm(s.date)}/${pad(seq.next(`SL${yymm(s.date)}`))}`;

  // old gold exchanged against three sales (credit must not exceed the purchase value)
  const oldGold: Row[] = [];
  const oldGoldIds: string[] = [];
  const exchSales = drafts.filter((s) => s.customerId && s.totals.totalPaise > 3_000_000n && !s.payments.some((p) => p.method === 'GIFT_CARD')).slice(0, 3);
  const ogSeq = new Sequencer();
  const ogRows: Array<{ date: Date; row: (n: string) => Row }> = [];
  exchSales.forEach((s, k) => {
    const net = BigInt(rng.int(8, 20)) * 1000n;
    const purity = 916;
    const rate10g = BigInt(DEMO_RATE_RUPEES_PER_GRAM['GOLD_999']! * 1000 * 100);
    const value = roundDiv(net * rate10g * BigInt(purity), 10000n * 999n);
    const deduction = roundToRupee(value / 50n);
    const final = value - deduction;
    const lastPay = s.payments[s.payments.length - 1]!;
    let credit = final > s.totals.totalPaise / 2n ? roundToRupee(s.totals.totalPaise / 2n) : final;
    if (credit > lastPay.amountPaise) credit = lastPay.amountPaise;
    if (credit > final) credit = final;
    const id = eid(ctx, 'old-gold', k);
    oldGoldIds.push(id);
    const od = addDays(s.date, 0);
    ogRows.push({ date: od, row: (n) => ({
      id, tenantId: ctx.tenantId, purchaseNumber: n, customerId: s.customerId, locationId: ctx.showroom.id, metalType: 'GOLD', grossWeightMg: net + 400n, netWeightMg: net,
      purityFineness: purity, ratePaisePer10g: rate10g, totalValuePaise: value, deductions: [{ reason: 'Melting loss', amountPaise: Number(deduction) }], finalAmountPaise: final,
      paymentMethod: 'EXCHANGE', status: 'EXCHANGED', usedAgainstSaleId: s.id, createdAt: od, createdBy: admin,
    }) });
    // swap the last payment for old gold credit: sale remains fully covered
    const last = s.payments[s.payments.length - 1]!;
    last.amountPaise -= credit;
    s.payments.push({ method: 'OLD_GOLD', amountPaise: credit, reference: id });
    if (last.amountPaise <= 0n) s.payments.splice(s.payments.indexOf(last), 1);
  });
  for (let k = 0; k < 2; k++) {
    const net = BigInt(rng.int(5, 12)) * 1000n;
    const rate10g = BigInt(DEMO_RATE_RUPEES_PER_GRAM['GOLD_999']! * 1000 * 100);
    const value = roundDiv(net * rate10g * 916n, 10000n * 999n);
    const cust = rng.pick(buyers);
    const od = daysAgoAt(now, rng.int(3, 40), 14);
    const id = eid(ctx, 'old-gold', 10 + k);
    ogRows.push({ date: od, row: (n) => ({
      id, tenantId: ctx.tenantId, purchaseNumber: n, customerId: cust.id, locationId: ctx.showroom.id, metalType: 'GOLD', grossWeightMg: net + 300n, netWeightMg: net,
      purityFineness: 916, ratePaisePer10g: rate10g, totalValuePaise: value, deductions: [], finalAmountPaise: value, paymentMethod: 'CASH', status: 'PURCHASED',
      usedAgainstSaleId: null, createdAt: od, createdBy: admin,
    }) });
  }
  ogRows.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const o of ogRows) oldGold.push(o.row(`OG/${yymm(o.date)}/${pad(ogSeq.next(yymm(o.date)))}`));

  // returns: pick multi-line sales with a customer
  const returns: ReturnInfo[] = [];
  const stockMoves: StockMove[] = [];
  const retSeq = new Sequencer();
  const retCands = drafts.filter((s) => s.customerId && s.lines.length >= 2 && now.getTime() - s.date.getTime() > 5 * 86_400_000).slice(0, 4);
  const retStatuses = ['DRAFT', 'APPROVED', 'COMPLETED', 'COMPLETED'];
  retCands.forEach((s, k) => {
    const status = retStatuses[k]!;
    const line = s.lines[0]!;
    const date = new Date(Math.min(now.getTime() - 60_000, s.date.getTime() + (3 + k) * 86_400_000));
    const refund = line.lineTotalPaise;
    const id = eid(ctx, 'return', k);
    add('saleReturn', {
      id, tenantId: ctx.tenantId, returnNumber: `RT/${lc}/${yymm(date)}/${pad(retSeq.next(yymm(date)))}`, originalSaleId: s.id, customerId: s.customerId,
      locationId: ctx.showroom.id, reason: rng.pick(['Size does not fit', 'Design changed mind', 'Gift duplicate']), status, subtotalPaise: refund, refundAmountPaise: refund,
      refundMethod: status === 'COMPLETED' ? 'CASH' : null, metalRateDifferencePaise: 0n, createdAt: date, createdBy: admin,
    });
    add('saleReturnItem', {
      id: eid(ctx, 'return-item', k), tenantId: ctx.tenantId, returnId: id, originalLineItemId: line.id, productId: line.product.id, quantity: 1,
      returnPricePaise: refund, reason: 'Customer return',
    });
    if (status === 'COMPLETED') {
      s.status = 'PARTIALLY_RETURNED';
      returns.push({ id, date, saleId: s.id, status, refundPaise: refund, taxPaise: line.cgstPaise + line.sgstPaise + line.igstPaise, costPaise: line.product.costPaise });
      stockMoves.push({ productId: line.product.id, where: 'showroom', delta: 1, movementType: 'RETURN', referenceType: 'SALE_RETURN', referenceId: id, date, notes: 'Customer return restocked', unitCostPaise: line.product.costPaise });
    }
  });

  // sale rows + stock OUT moves
  const salesByCustomer = new Map<string, SaleRef[]>();
  for (const s of drafts) {
    add('sale', {
      id: s.id, tenantId: ctx.tenantId, saleNumber: s.number, customerId: s.customerId, locationId: ctx.showroom.id, userId: admin, status: s.status,
      subtotalPaise: s.totals.subtotalPaise, discountPaise: 0n, taxPaise: s.totals.taxPaise, totalPaise: s.totals.totalPaise, currencyCode: 'INR',
      roundOffPaise: s.totals.roundOffPaise, notes: 'Demo sale', createdAt: s.date, updatedAt: s.date, createdBy: admin,
    });
    for (const l of s.lines) {
      add('saleLineItem', {
        id: l.id, tenantId: ctx.tenantId, saleId: s.id, productId: l.product.id, description: l.product.name, quantity: l.quantity, unitPricePaise: l.unitPricePaise,
        discountPaise: l.discountPaise, discountType: l.discountType, makingChargesPaise: l.makingPaise, wastageChargesPaise: l.wastagePaise,
        metalRatePaise: l.ratePaisePerGram, metalWeightMg: l.metalWeightMg, hsnCode: '7113', gstRate: 300, cgstPaise: l.cgstPaise, sgstPaise: l.sgstPaise,
        igstPaise: l.igstPaise, lineTotalPaise: l.lineTotalPaise, createdAt: s.date,
      });
      stockMoves.push({ productId: l.product.id, where: 'showroom', delta: -l.quantity, movementType: 'OUT', referenceType: 'RETAIL_SALE', referenceId: s.id, date: s.date, notes: `Sold via retail sale ${s.number}`, unitCostPaise: l.product.costPaise });
    }
    s.payments.forEach((p, k) => add('salePayment', {
      id: eid(ctx, 'sale-payment', `${s.id}-${k}`), tenantId: ctx.tenantId, saleId: s.id, method: p.method, amountPaise: p.amountPaise, reference: p.reference,
      status: 'COMPLETED', processedAt: s.date, createdAt: s.date,
    }));
    if (s.customerId) {
      const list = salesByCustomer.get(s.customerId) ?? [];
      list.push({ saleId: s.id, totalPaise: s.totals.totalPaise, date: s.date });
      salesByCustomer.set(s.customerId, list);
    }
  }
  for (const r of oldGold) add('oldGoldPurchase', r);

  giftCards.forEach((g, i) => add('giftCard', {
    id: g.id, tenantId: ctx.tenantId, cardNumber: g.number, balancePaise: g.balance, initialValuePaise: g.initial, customerId: i % 2 === 0 ? buyers[i]!.id : null,
    status: g.balance === 0n ? 'USED' : 'ACTIVE', expiresAt: addDays(g.issued, 365), createdAt: g.issued, createdBy: admin,
  }));

  // repairs
  const repairStatuses = ['RECEIVED', 'IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED', 'DELIVERED', 'DELIVERED'] as const;
  const repSeq = new Sequencer();
  const repairDays = [2, 9, 14, 20, 38, 55];
  repairStatuses.forEach((status, i) => {
    const date = daysAgoAt(now, repairDays[i]!, 12);
    const cust = buyers[i * 3 + 1]!;
    const est = rupees(rng.int(8, 60) * 100);
    const done = status === 'COMPLETED' || status === 'DELIVERED';
    const labor = done ? est - rupees(rng.int(1, 3) * 100) : null;
    const material = done ? rupees(rng.int(1, 5) * 100) : null;
    add('repairOrder', {
      id: eid(ctx, 'repair', i), tenantId: ctx.tenantId, repairNumber: `RP/${lc}/${yymm(date)}/${pad(repSeq.next(yymm(date)))}`, customerId: cust.id, locationId: ctx.showroom.id,
      staffUserId: admin, status, itemDescription: ['Gold chain clasp broken', 'Ring resize from 14 to 16', 'Earring post replacement', 'Bangle soldering', 'Pendant polish', 'Necklace re-stringing'][i],
      itemWeightMg: BigInt(rng.int(3, 25)) * 1000n, diagnosticNotes: status === 'RECEIVED' ? null : 'Inspected under loupe, repair feasible.',
      estimatePaise: status === 'RECEIVED' ? null : est, actualCostPaise: done ? (labor! + material!) : null, laborPaise: labor, materialPaise: material,
      promisedDate: addDays(date, 7), completedDate: done ? addDays(date, 5) : null, deliveredDate: status === 'DELIVERED' ? addDays(date, 6) : null, createdAt: date, createdBy: admin,
    });
  });

  // custom orders
  const coStatuses = ['INQUIRY', 'QUOTED', 'DEPOSIT_PAID', 'IN_PRODUCTION', 'DELIVERED'] as const;
  const coSeq = new Sequencer();
  coStatuses.forEach((status, i) => {
    const date = daysAgoAt(now, [3, 11, 24, 33, 62][i]!, 15);
    const cust = buyers[i * 4 + 2]!;
    const est = rupees(rng.int(40, 400) * 1000);
    const priced = status !== 'INQUIRY';
    const final = priced ? est : null;
    const deposit = status === 'DEPOSIT_PAID' || status === 'IN_PRODUCTION' ? roundToRupee(est / 2n) : status === 'DELIVERED' ? est : 0n;
    add('customOrder', {
      id: eid(ctx, 'custom-order', i), tenantId: ctx.tenantId, orderNumber: `CO/${lc}/${yymm(date)}/${pad(coSeq.next(yymm(date)))}`, customerId: cust.id, locationId: ctx.showroom.id, status,
      description: ['Bridal necklace set with matching earrings', 'Custom name pendant in 18K gold', 'Couple rings with engraving', 'Temple jewellery haram', 'Diamond bracelet redesign'][i],
      designNotes: 'Design shared on WhatsApp; approval pending final sketch.', estimatePaise: est, finalPricePaise: final, depositPaise: deposit, balancePaise: final ? final - deposit : 0n,
      expectedDate: addDays(date, 30), createdAt: date, createdBy: admin,
    });
  });

  // appraisals
  for (let i = 0; i < 3; i++) {
    const date = daysAgoAt(now, 5 + i * 17, 13);
    add('appraisal', {
      id: eid(ctx, 'appraisal', i), tenantId: ctx.tenantId, appraisalNumber: `AP/${yymm(date)}/${pad(i + 1)}`, customerId: buyers[i + 5]!.id, locationId: ctx.showroom.id,
      itemDescription: ['Heirloom gold necklace', 'Diamond solitaire ring', 'Antique bangles pair'][i], metalType: 'GOLD', weightMg: BigInt(20 + i * 15) * 1000n, purityFineness: 916,
      appraisedValuePaise: rupees(150000 + i * 90000), appraisedBy: admin, appraisedAt: date, validUntil: addDays(date, 90), createdAt: date, createdBy: admin,
    });
  }
  // fix appraisal numbers so they are contiguous per month
  const apSeq = new Sequencer();
  (t['appraisal'] ?? []).sort((a, b) => (a['createdAt'] as Date).getTime() - (b['createdAt'] as Date).getTime())
    .forEach((r) => { r['appraisalNumber'] = `AP/${yymm(r['createdAt'] as Date)}/${pad(apSeq.next(yymm(r['createdAt'] as Date)))}`; });

  // discounts
  const discs = [
    ['Making charge offer 10%', 'PERCENTAGE', 1000, 5000000n], ['Festive flat Rs 2,000 off', 'FIXED', 200000, 10000000n], ['Wedding season 5%', 'PERCENTAGE', 500, 20000000n],
    ['Silver jewellery 15%', 'PERCENTAGE', 1500, null], ['Loyalty member 3%', 'PERCENTAGE', 300, 3000000n],
  ] as const;
  discs.forEach(([name, type, value, min], i) => add('discount', {
    id: eid(ctx, 'discount', i), tenantId: ctx.tenantId, name, discountType: type, value, minPurchasePaise: min, startDate: daysAgoAt(now, 30, 9), endDate: addDays(now, 60 + i * 10),
    isActive: i !== 3, usageLimit: 200, usedCount: 4 + i * 3, createdBy: admin,
  }));

  const order = ['sale', 'saleLineItem', 'salePayment', 'saleReturn', 'saleReturnItem', 'giftCard', 'oldGoldPurchase', 'repairOrder', 'customOrder', 'appraisal', 'discount'];
  const tables: TablePlan[] = order.filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
  return {
    module: { name: 'retail', sentinel: { model: 'giftCard', id: eid(ctx, 'giftcard', 0) }, tables, stockDeltas: [] },
    sales: drafts, returns, stockMoves, salesByCustomer, oldGoldIds,
    giftCards: giftCards.map((g) => ({ issued: g.issued, initialPaise: g.initial })),
    oldGoldPurchased: oldGold.filter((r) => r['status'] === 'PURCHASED').map((r) => ({ date: r['createdAt'] as Date, amountPaise: r['finalAmountPaise'] as bigint })),
  };
}
