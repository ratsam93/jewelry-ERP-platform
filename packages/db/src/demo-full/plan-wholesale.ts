/** Wholesale planner: suppliers, purchase orders + goods receipts, agents, consignments, credit limits, rate contracts. */
import { DEMO_RATE_RUPEES_PER_GRAM } from '../seed-demo-catalog-data';
import {
  FIRST_NAMES, LAST_NAMES, PhoneBook, Rng, Sequencer, addDays, bsum, daysAgoAt, eid, fakeBankAccount, fakeGstin, fakeIfsc, fakePan,
  pad, rateFactor, rupees, yymm, CITIES, type DemoContext, type ModulePlan, type Row, type TablePlan,
} from './common';
import type { DemoCustomer } from './plan-crm';
import type { SaleInfo, StockMove } from './plan-retail';

export interface SupplierRef {
  id: string;
  name: string;
  state: string;
}

export interface PoInfo {
  id: string;
  number: string;
  supplierId: string;
  date: Date;
  status: string;
  subtotalPaise: bigint;
  taxPaise: bigint;
  totalPaise: bigint;
}

export interface WholesaleResult {
  module: ModulePlan;
  suppliers: SupplierRef[];
  pos: PoInfo[];
  moves: StockMove[];
  agentIds: string[];
}

const SUPPLIERS: Array<[string, string, string, number]> = [
  ['Rajhans Bullion Traders', 'BULLION', 'Mumbai', 0], ['Zaveri Gold Refinery', 'BULLION', 'Mumbai', 0], ['Surat Diamond House', 'STONE', 'Surat', 9],
  ['Jaipur Kundan Crafts', 'MANUFACTURER', 'Jaipur', 3], ['Rajkot Gold Works', 'MANUFACTURER', 'Ahmedabad', 4], ['Coimbatore Chain Makers', 'MANUFACTURER', 'Chennai', 8],
  ['Kolkata Filigree Studio', 'MANUFACTURER', 'Kolkata', 7], ['Hyderabad Pearl Imports', 'WHOLESALER', 'Hyderabad', 6],
];

export function planWholesale(ctx: DemoContext, customers: DemoCustomer[], sales: SaleInfo[]): WholesaleResult {
  const rng = new Rng(`${ctx.tenantId}:wholesale`);
  const phones = new PhoneBook(new Rng(`${ctx.tenantId}:phones-w`));
  const { now } = ctx;
  const admin = ctx.adminUserId;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const moves: StockMove[] = [];

  const suppliers: SupplierRef[] = SUPPLIERS.map(([name, type, cityName, ci], i) => {
    const city = CITIES.find((c) => c.city === cityName) ?? CITIES[ci]!;
    const pan = fakePan(rng, i % 2 === 0 ? 'C' : 'F', name[0]!);
    const id = eid(ctx, 'supplier', i);
    add('supplier', {
      id, tenantId: ctx.tenantId, name, contactPerson: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      email: `accounts${i + 1}@${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.example.com`, phone: phones.next(),
      address: `${rng.int(1, 90)}, Jewellers Lane`, city: city.city, state: city.state, country: 'IN', postalCode: city.pin,
      gstinNumber: fakeGstin(city.stateCode, pan, 1), panNumber: pan, supplierType: type, rating: rng.int(3, 5), isActive: true,
      createdAt: daysAgoAt(now, 200 + i * 10, 10), createdBy: admin,
    });
    return { id, name, state: city.state };
  });

  // purchase orders
  const prefix = ctx.slug.substring(0, 4).toUpperCase();
  const poSeq = new Sequencer();
  const grSeq = new Sequencer();
  const statuses = ['RECEIVED', 'RECEIVED', 'RECEIVED', 'RECEIVED', 'PARTIALLY_RECEIVED', 'PARTIALLY_RECEIVED', 'SENT', 'SENT', 'DRAFT', 'CANCELLED'] as const;
  const dayOffsets = [78, 64, 50, 36, 27, 15, 9, 4, 2, 21].sort((a, b) => b - a);
  const jewellery = ctx.products.filter((p) => !p.fixedPrice);
  const pos: PoInfo[] = [];
  statuses.forEach((status, i) => {
    const date = daysAgoAt(now, dayOffsets[i]!, 11);
    const bullion = i % 3 === 0;
    const supplier = bullion ? suppliers[i % 2]! : suppliers[2 + (i % 6)]!;
    const poId = eid(ctx, 'po', i);
    const items: Row[] = [];
    const itemQty: Array<{ productId: string | null; qty: number; recv: number; weightMg: bigint }> = [];
    if (bullion) {
      const grams = [100, 250, 500][i % 3]!;
      const rate = BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM['GOLD_916']! * 100 * rateFactor(dayOffsets[i]!)));
      const unit = rate * BigInt(grams);
      const recv = status === 'RECEIVED' ? 1 : status === 'PARTIALLY_RECEIVED' ? 0 : 0;
      items.push({
        id: eid(ctx, 'po-item', `${i}-0`), tenantId: ctx.tenantId, purchaseOrderId: poId, productId: null, description: `Gold bar 22K (916), ${grams} g`,
        quantity: 1, unitPricePaise: unit, weightMg: BigInt(grams) * 1000n, purityFineness: 916, receivedQuantity: recv, totalPaise: unit, createdBy: admin,
      });
    } else {
      const n = rng.int(1, 3);
      const chosen = rng.shuffle(jewellery).slice(0, n);
      chosen.forEach((p, k) => {
        const qty = rng.int(3, 8);
        const recv = status === 'RECEIVED' ? qty : status === 'PARTIALLY_RECEIVED' ? Math.floor(qty / 2) : 0;
        items.push({
          id: eid(ctx, 'po-item', `${i}-${k}`), tenantId: ctx.tenantId, purchaseOrderId: poId, productId: p.id, description: p.name, quantity: qty,
          unitPricePaise: p.costPaise, weightMg: p.netWeightMg * BigInt(qty), purityFineness: p.purity, receivedQuantity: recv, totalPaise: p.costPaise * BigInt(qty), createdBy: admin,
        });
        itemQty.push({ productId: p.id, qty, recv, weightMg: p.netWeightMg * BigInt(recv) });
      });
    }
    const subtotal = bsum(items.map((r) => r['totalPaise'] as bigint));
    const tax = (subtotal * 3n) / 100n;
    const total = subtotal + tax;
    const number = `PO/${prefix}/${yymm(date)}/${pad(poSeq.next(yymm(date)))}`;
    const sent = status !== 'DRAFT';
    add('purchaseOrder', {
      id: poId, tenantId: ctx.tenantId, poNumber: number, supplierId: supplier.id, locationId: ctx.warehouse.id, status, subtotalPaise: subtotal, taxPaise: tax, totalPaise: total,
      currencyCode: 'INR', expectedDate: addDays(date, 10), notes: 'Demo purchase order', approvedBy: sent ? admin : null, approvedAt: sent ? addDays(date, 0) : null,
      createdAt: date, createdBy: admin,
    });
    for (const it of items) add('purchaseOrderItem', it);
    pos.push({ id: poId, number, supplierId: supplier.id, date, status, subtotalPaise: subtotal, taxPaise: tax, totalPaise: total });
    const jewelRecv = itemQty.filter((q) => q.productId && q.recv > 0);
    if (jewelRecv.length > 0) {
      const rd = new Date(Math.min(now.getTime() - 60_000, addDays(date, 6).getTime()));
      const grId = eid(ctx, 'gr', i);
      add('goodsReceipt', {
        id: grId, tenantId: ctx.tenantId, receiptNumber: `GR/${yymm(rd)}/${pad(grSeq.next(yymm(rd)))}`, purchaseOrderId: poId, supplierId: supplier.id, locationId: ctx.warehouse.id,
        status: 'ACCEPTED', receivedDate: rd, notes: status === 'PARTIALLY_RECEIVED' ? 'Balance to follow' : null, createdAt: rd, createdBy: admin,
      });
      jewelRecv.forEach((q, k) => {
        add('goodsReceiptItem', {
          id: eid(ctx, 'gr-item', `${i}-${k}`), tenantId: ctx.tenantId, goodsReceiptId: grId, productId: q.productId, receivedQuantity: q.recv, acceptedQuantity: q.recv,
          rejectedQuantity: 0, weightMg: q.weightMg, createdBy: admin,
        });
        const p = ctx.products.find((x) => x.id === q.productId)!;
        moves.push({ productId: q.productId!, where: 'warehouse', delta: q.recv, movementType: 'IN', referenceType: 'GOODS_RECEIPT', referenceId: grId, date: rd, notes: `Received against ${number}`, unitCostPaise: p.costPaise });
      });
    }
  });

  // agents and commissions
  const agents = ['Ramesh Agency', 'Sunita Brokers', 'Gold Link Associates', 'Mahesh Dalal', 'Karim Brothers'];
  const agentIds: string[] = [];
  agents.forEach((name, i) => {
    const id = eid(ctx, 'agent', i);
    agentIds.push(id);
    add('agentBroker', {
      id, tenantId: ctx.tenantId, name, phone: phones.next(), email: `agent${i + 1}@example.com`, commissionType: i === 3 ? 'FIXED_PER_PIECE' : 'PERCENTAGE',
      commissionRate: i === 3 ? 50000 : [150, 100, 200, 0, 125][i]!, isActive: i !== 4, bankAccountNumber: fakeBankAccount(rng), ifscCode: fakeIfsc(rng, ['HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK'][i]!),
      panNumber: fakePan(rng, 'P', name[0]!), createdBy: admin,
    });
  });
  const commSales = sales.filter((s) => s.customerId).slice(0, 12);
  commSales.forEach((s, k) => {
    const agentIdx = k % 4;
    const amount = agentIdx === 3 ? 50000n : (s.totals.subtotalPaise * BigInt([150, 100, 200][agentIdx]!)) / 10000n;
    const status = k < 5 ? 'PAID' : k < 9 ? 'APPROVED' : 'PENDING';
    add('agentCommission', {
      id: eid(ctx, 'commission', k), tenantId: ctx.tenantId, agentBrokerId: agentIds[agentIdx], referenceType: 'SALE', referenceId: s.id, amountPaise: amount, status,
      paidAt: status === 'PAID' ? new Date(Math.min(now.getTime() - 60_000, addDays(s.date, 10).getTime())) : null,
      paymentReference: status === 'PAID' ? `NEFT${rng.int(100000000, 999999999)}` : null, createdAt: s.date, createdBy: admin,
    });
  });

  // consignments out (to wholesale/corporate customers) and in (from suppliers)
  const trade = customers.filter((c) => c.type !== 'RETAIL');
  const coSeq = new Sequencer();
  const ciSeq = new Sequencer();
  const stockable = ctx.products.filter((p) => p.qty0 >= 4);
  const coStatus = ['ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CONVERTED_TO_SALE'] as const;
  coStatus.forEach((status, i) => {
    const date = daysAgoAt(now, [50, 33, 20, 8][i]!, 12);
    const id = eid(ctx, 'consign-out', i);
    const picks = stockable.slice(i * 2, i * 2 + 2);
    let totalW = 0n;
    let totalV = 0n;
    picks.forEach((p, k) => {
      const qty = 1;
      const returned = status === 'RETURNED' || (status === 'PARTIALLY_RETURNED' && k === 0) ? 1 : 0;
      const sold = status === 'CONVERTED_TO_SALE' ? 1 : 0;
      totalW += p.netWeightMg;
      totalV += p.sellingPaise;
      add('consignmentOutItem', {
        id: eid(ctx, 'consign-out-item', `${i}-${k}`), tenantId: ctx.tenantId, consignmentOutId: id, productId: p.id, quantity: qty, weightMg: p.netWeightMg, valuePaise: p.sellingPaise,
        returnedQuantity: returned, soldQuantity: sold, status: returned ? 'RETURNED' : sold ? 'SOLD' : 'ISSUED', createdBy: admin,
      });
      moves.push({ productId: p.id, where: 'showroom', delta: -qty, movementType: 'OUT', referenceType: 'CONSIGNMENT_OUT', referenceId: id, date, notes: 'Issued on consignment', unitCostPaise: p.costPaise });
      if (returned) moves.push({ productId: p.id, where: 'showroom', delta: 1, movementType: 'RETURN', referenceType: 'CONSIGNMENT_RETURN', referenceId: id, date: addDays(date, 10), notes: 'Returned from consignment', unitCostPaise: p.costPaise });
    });
    add('consignmentOut', {
      id, tenantId: ctx.tenantId, consignmentNumber: `CO/${yymm(date)}/${pad(coSeq.next(yymm(date)))}`, customerId: trade[i % trade.length]!.id, locationId: ctx.showroom.id, status,
      issuedDate: date, dueDate: addDays(date, 30), totalWeightMg: totalW, totalValuePaise: totalV, notes: 'Demo consignment', createdAt: date, createdBy: admin,
    });
  });
  const ciStatus = ['RECEIVED', 'PARTIALLY_RETURNED', 'RETURNED', 'PURCHASED'] as const;
  ciStatus.forEach((status, i) => {
    const date = daysAgoAt(now, [44, 29, 17, 6][i]!, 12);
    const id = eid(ctx, 'consign-in', i);
    const picks = stockable.slice(10 + i * 2, 12 + i * 2);
    let totalW = 0n;
    let totalV = 0n;
    picks.forEach((p, k) => {
      const returned = status === 'RETURNED' || (status === 'PARTIALLY_RETURNED' && k === 0) ? 1 : 0;
      const purchased = status === 'PURCHASED' ? 1 : 0;
      totalW += p.netWeightMg;
      totalV += p.costPaise;
      add('consignmentInItem', {
        id: eid(ctx, 'consign-in-item', `${i}-${k}`), tenantId: ctx.tenantId, consignmentInId: id, productId: p.id, quantity: 1, weightMg: p.netWeightMg, valuePaise: p.costPaise,
        returnedQuantity: returned, purchasedQuantity: purchased, status: returned ? 'RETURNED' : purchased ? 'PURCHASED' : 'RECEIVED', createdBy: admin,
      });
      moves.push({ productId: p.id, where: 'warehouse', delta: 1, movementType: 'IN', referenceType: 'CONSIGNMENT_IN', referenceId: id, date, notes: 'Received on consignment', unitCostPaise: p.costPaise });
      if (returned) moves.push({ productId: p.id, where: 'warehouse', delta: -1, movementType: 'OUT', referenceType: 'CONSIGNMENT_RETURN', referenceId: id, date: addDays(date, 9), notes: 'Returned to supplier', unitCostPaise: p.costPaise });
    });
    add('consignmentIn', {
      id, tenantId: ctx.tenantId, consignmentNumber: `CI/${yymm(date)}/${pad(ciSeq.next(yymm(date)))}`, supplierId: suppliers[3 + i]!.id, locationId: ctx.warehouse.id, status,
      receivedDate: date, dueDate: addDays(date, 30), totalWeightMg: totalW, totalValuePaise: totalV, notes: 'Demo consignment', createdAt: date, createdBy: admin,
    });
  });

  // credit limits and rate contracts
  trade.slice(0, 4).forEach((c, i) => {
    const limit = rupees(500000 * (i + 1));
    const used = rupees(80000 * (i + 1));
    add('creditLimit', { id: eid(ctx, 'credit-limit', `c${i}`), tenantId: ctx.tenantId, entityType: 'CUSTOMER', entityId: c.id, creditLimitPaise: limit, usedPaise: used, availablePaise: limit - used, createdBy: admin });
  });
  suppliers.slice(0, 3).forEach((s, i) => {
    const limit = rupees(2000000);
    const used = rupees(350000 * (i + 1));
    add('creditLimit', { id: eid(ctx, 'credit-limit', `s${i}`), tenantId: ctx.tenantId, entityType: 'SUPPLIER', entityId: s.id, creditLimitPaise: limit, usedPaise: used, availablePaise: limit - used, createdBy: admin });
  });
  [[0, 'GOLD', 916, null], [1, 'GOLD', 750, null], [4, null, null, 1200]].forEach(([si, metal, purity, mk], i) => {
    add('rateContract', {
      id: eid(ctx, 'rate-contract', i), tenantId: ctx.tenantId, supplierId: suppliers[si as number]!.id, metalType: metal, ratePerGramPaise: metal ? rupees(DEMO_RATE_RUPEES_PER_GRAM[`GOLD_${purity}`]! - 40) : null,
      makingChargesPercent: mk, validFrom: daysAgoAt(now, 60, 9), validTo: addDays(now, 120), isActive: true, terms: 'Rate fixed for the contract period, payment within 15 days.', createdBy: admin,
    });
  });

  const order = ['supplier', 'purchaseOrder', 'purchaseOrderItem', 'goodsReceipt', 'goodsReceiptItem', 'agentBroker', 'agentCommission', 'consignmentOut', 'consignmentOutItem',
    'consignmentIn', 'consignmentInItem', 'creditLimit', 'rateContract'];
  const tables: TablePlan[] = order.filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
  return { module: { name: 'wholesale', sentinel: { model: 'supplier', id: suppliers[0]!.id }, tables, stockDeltas: [] }, suppliers, pos, moves, agentIds };
}
