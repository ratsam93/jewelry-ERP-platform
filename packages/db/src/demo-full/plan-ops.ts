/**
 * Operations planner: inventory extras + composition of the manufacturing and wholesale planners.
 *
 *  - INVENTORY (planned here): warehouse stock items, metal stock, loose stones / certified diamonds,
 *    4 stock transfers, 2 stock takes, and EVERY stock_movement row of the demo. The stock movement rows are
 *    derived from the StockMove lists of all planners (retail sales/returns, manufacturing finished goods,
 *    wholesale receipts and consignments) plus this planner's own opening stock, transfer and stock-take
 *    adjustment moves, so each move becomes exactly one row (nothing is duplicated).
 *  - MANUFACTURING: karigars, BOMs, job orders, QC, karigar ledger ... come from planManufacturing (plan-mfg.ts).
 *  - WHOLESALE: suppliers, purchase orders, goods receipts, agents, consignments ... come from planWholesale (plan-wholesale.ts).
 *
 * Stock accounting: showroom quantities live in EXISTING stock_items rows, so showroom moves are carried by
 * `stockDeltas`; warehouse stock_items are created here with their final quantity (sum of all warehouse moves,
 * opening stock included, never negative). Numbers produced here: none are count-based generators
 * (transfers / stock takes have no number column); REC-/JO-/PO/GR/CO/CI numbers come from the composed planners and
 * are contiguous from 1 per prefix/month so the API's count()+1 generators continue without collisions.
 *
 * Natural-key note: warehouse stock_items are unique on (tenant, product, location); the demo catalog only
 * seeded showroom rows, so nothing else owns the warehouse rows and ids are deterministic (eid).
 */
import { DEMO_RATE_RUPEES_PER_GRAM } from '../seed-demo-catalog-data';
import {
  Rng, daysAgoAt, eid, pickWeighted, randDigits, roundDiv, rupees, type DemoContext, type ModulePlan, type ProductInfo, type Row,
  type TablePlan,
} from './common';
import type { DemoCustomer } from './plan-crm';
import { planManufacturing } from './plan-mfg';
import type { RetailResult } from './plan-retail';
import { planWholesale } from './plan-wholesale';

/** Intended row counts. Exact for tables planned here; minimums for the composed planners' tables. */
export const OPS_COUNTS = {
  metalStock: 10,
  stoneStock: 12,
  stockTransfer: 4,
  stockTransferItem: 16,
  stockTake: 2,
  stockTakeItem: 26,
  // minimums contributed by the composed planners
  karigar: 8,
  billOfMaterials: 6,
  jobOrder: 14,
  supplier: 8,
  purchaseOrder: 10,
  agentBroker: 5,
  consignmentOut: 4,
  consignmentIn: 4,
} as const;

interface Move {
  productId: string;
  where: 'showroom' | 'warehouse';
  delta: number;
  movementType: string;
  referenceType: string;
  referenceId: string | null;
  date: Date;
  notes: string;
  unitCostPaise: bigint | null;
}

interface TransferSpec {
  key: number;
  status: 'RECEIVED' | 'IN_TRANSIT' | 'DRAFT';
  createdAgo: number;
  shipAgo: number | null;
  receiveAgo: number | null;
  lines: number;
  qtyMin: number;
  qtyMax: number;
  notes: string;
}

const TRANSFERS: TransferSpec[] = [
  { key: 0, status: 'RECEIVED', createdAgo: 60, shipAgo: 59, receiveAgo: 57, lines: 5, qtyMin: 2, qtyMax: 5, notes: 'Festive collection replenishment for the showroom' },
  { key: 1, status: 'RECEIVED', createdAgo: 33, shipAgo: 32, receiveAgo: 30, lines: 4, qtyMin: 2, qtyMax: 4, notes: 'Bangles and chains top-up' },
  { key: 2, status: 'IN_TRANSIT', createdAgo: 4, shipAgo: 3, receiveAgo: null, lines: 4, qtyMin: 2, qtyMax: 4, notes: 'Wedding-season stock, courier in transit' },
  { key: 3, status: 'DRAFT', createdAgo: 1, shipAgo: null, receiveAgo: null, lines: 3, qtyMin: 1, qtyMax: 2, notes: 'Requested by the showroom manager, awaiting approval' },
];

const METAL_STOCK: Array<{ metal: 'GOLD' | 'SILVER' | 'PLATINUM'; fineness: number; whGrams: number; srGrams: number }> = [
  { metal: 'GOLD', fineness: 916, whGrams: 2450, srGrams: 620 },
  { metal: 'GOLD', fineness: 750, whGrams: 880, srGrams: 240 },
  { metal: 'GOLD', fineness: 999, whGrams: 1500, srGrams: 310 },
  { metal: 'SILVER', fineness: 999, whGrams: 18500, srGrams: 4200 },
  { metal: 'PLATINUM', fineness: 950, whGrams: 260, srGrams: 55 },
];

interface StoneSpec {
  where: 'showroom' | 'warehouse';
  stoneType: string;
  shape: string;
  sizeRange: string;
  color: string | null;
  clarity: string | null;
  cutGrade: string | null;
  polish: string | null;
  symmetry: string | null;
  fluorescence: string | null;
  origin: 'NATURAL' | 'LAB_GROWN';
  growthMethod: 'NONE' | 'HPHT' | 'CVD';
  treatment: string;
  lab: 'GIA' | 'IGI' | null;
  /** weight in milligrams (1 ct = 200 mg) */
  mg: number;
  pieces: number;
  valueRupees: number;
}

const STONES: StoneSpec[] = [
  { where: 'showroom', stoneType: 'Diamond', shape: 'Round Brilliant', sizeRange: '1.02 ct', color: 'F', clarity: 'VS1', cutGrade: 'Excellent', polish: 'Excellent', symmetry: 'Excellent', fluorescence: 'None', origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: 'GIA', mg: 204, pieces: 1, valueRupees: 340000 },
  { where: 'warehouse', stoneType: 'Diamond', shape: 'Round Brilliant', sizeRange: '0.70 ct', color: 'G', clarity: 'VS2', cutGrade: 'Excellent', polish: 'Excellent', symmetry: 'Very Good', fluorescence: 'Faint', origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: 'GIA', mg: 140, pieces: 1, valueRupees: 145000 },
  { where: 'warehouse', stoneType: 'Diamond', shape: 'Oval', sizeRange: '1.51 ct', color: 'H', clarity: 'SI1', cutGrade: 'Very Good', polish: 'Excellent', symmetry: 'Very Good', fluorescence: 'None', origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: 'GIA', mg: 302, pieces: 1, valueRupees: 310000 },
  { where: 'showroom', stoneType: 'Diamond', shape: 'Princess', sizeRange: '0.55 ct', color: 'E', clarity: 'VVS2', cutGrade: 'Very Good', polish: 'Excellent', symmetry: 'Very Good', fluorescence: 'None', origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: 'GIA', mg: 110, pieces: 1, valueRupees: 110000 },
  { where: 'warehouse', stoneType: 'Diamond', shape: 'Round Brilliant', sizeRange: '1.20 ct', color: 'G', clarity: 'VS1', cutGrade: 'Excellent', polish: 'Excellent', symmetry: 'Excellent', fluorescence: 'None', origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: 'IGI', mg: 240, pieces: 1, valueRupees: 265000 },
  { where: 'showroom', stoneType: 'Diamond', shape: 'Round Brilliant', sizeRange: '1.00 ct', color: 'F', clarity: 'VS1', cutGrade: 'Excellent', polish: 'Excellent', symmetry: 'Excellent', fluorescence: 'None', origin: 'LAB_GROWN', growthMethod: 'CVD', treatment: 'NONE', lab: 'IGI', mg: 200, pieces: 1, valueRupees: 52000 },
  { where: 'warehouse', stoneType: 'Diamond', shape: 'Round Brilliant', sizeRange: '2.05 ct', color: 'G', clarity: 'VS2', cutGrade: 'Excellent', polish: 'Excellent', symmetry: 'Very Good', fluorescence: 'None', origin: 'LAB_GROWN', growthMethod: 'HPHT', treatment: 'HPHT_TREATED', lab: 'IGI', mg: 410, pieces: 1, valueRupees: 148000 },
  { where: 'warehouse', stoneType: 'Diamond', shape: 'Round Brilliant', sizeRange: '1.0-1.5 mm (melee)', color: 'G-H', clarity: 'VS-SI', cutGrade: 'Good', polish: null, symmetry: null, fluorescence: null, origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: null, mg: 1200, pieces: 600, valueRupees: 105000 },
  { where: 'warehouse', stoneType: 'Ruby', shape: 'Oval', sizeRange: '4x3 mm', color: 'Pigeon blood red', clarity: 'Eye clean', cutGrade: null, polish: null, symmetry: null, fluorescence: null, origin: 'NATURAL', growthMethod: 'NONE', treatment: 'HEATED', lab: null, mg: 2480, pieces: 24, valueRupees: 186000 },
  { where: 'showroom', stoneType: 'Emerald', shape: 'Octagon', sizeRange: '5x4 mm', color: 'Vivid green', clarity: 'Included', cutGrade: null, polish: null, symmetry: null, fluorescence: null, origin: 'NATURAL', growthMethod: 'NONE', treatment: 'OILED', lab: null, mg: 1900, pieces: 18, valueRupees: 142000 },
  { where: 'warehouse', stoneType: 'Blue Sapphire', shape: 'Cushion', sizeRange: '5 mm', color: 'Royal blue', clarity: 'Eye clean', cutGrade: null, polish: null, symmetry: null, fluorescence: null, origin: 'NATURAL', growthMethod: 'NONE', treatment: 'HEATED', lab: null, mg: 1600, pieces: 8, valueRupees: 128000 },
  { where: 'showroom', stoneType: 'Pearl', shape: 'Round', sizeRange: '3-4 mm freshwater', color: 'White', clarity: null, cutGrade: null, polish: null, symmetry: null, fluorescence: null, origin: 'NATURAL', growthMethod: 'NONE', treatment: 'NONE', lab: null, mg: 80000, pieces: 40, valueRupees: 36000 },
];

/** Fake but format-valid certificate numbers: GIA = 10 digits, IGI natural = 9 digits, IGI lab-grown = "LG" + 9 digits. */
export function fakeCertificate(rng: Rng, lab: 'GIA' | 'IGI', labGrown: boolean): string {
  if (lab === 'GIA') return `${rng.int(1, 2)}${randDigits(rng, 9)}`;
  return labGrown ? `LG${randDigits(rng, 9)}` : `${rng.int(5, 6)}${randDigits(rng, 8)}`;
}

function ratePaisePerGram(key: string): bigint {
  return BigInt(Math.round(DEMO_RATE_RUPEES_PER_GRAM[key]! * 100));
}

export function planOps(ctx: DemoContext, customers: DemoCustomer[], retail: RetailResult): ModulePlan {
  const rng = new Rng(`${ctx.tenantId}:ops`);
  const { now } = ctx;
  const admin = ctx.adminUserId;

  const mfg = planManufacturing(ctx, customers.map((c) => c.id));
  const wholesale = planWholesale(ctx, customers, retail.sales);
  const productById = new Map<string, ProductInfo>(ctx.products.map((p) => [p.id, p]));

  const moves: Move[] = [...retail.stockMoves, ...mfg.moves, ...wholesale.moves].map((m) => ({ ...m }));

  const baseline = (p: ProductInfo, where: 'showroom' | 'warehouse'): number =>
    where === 'showroom' && p.showroomStockId ? p.qty0 : 0;
  const qtyAt = (productId: string, where: 'showroom' | 'warehouse', at: Date): number => {
    const p = productById.get(productId)!;
    let q = baseline(p, where);
    for (const m of moves) if (m.productId === productId && m.where === where && m.date.getTime() <= at.getTime()) q += m.delta;
    return q;
  };

  // ─── stock transfers (warehouse -> showroom) ──────────────────────
  const transferable = ctx.products.filter((p) => p.showroomStockId !== null);
  const pool = rng.shuffle(transferable);
  let poolAt = 0;
  const transferRows: Row[] = [];
  const transferItemRows: Row[] = [];
  for (const spec of TRANSFERS) {
    const id = eid(ctx, 'transfer', spec.key);
    const created = daysAgoAt(now, spec.createdAgo, 10);
    const ship = spec.shipAgo === null ? null : daysAgoAt(now, spec.shipAgo, 15);
    const recv = spec.receiveAgo === null ? null : daysAgoAt(now, spec.receiveAgo, 12);
    const picks = pool.slice(poolAt, poolAt + spec.lines);
    poolAt += spec.lines;
    picks.forEach((p, k) => {
      const qty = rng.int(spec.qtyMin, spec.qtyMax);
      const sent = ship ? qty : 0;
      transferItemRows.push({
        id: eid(ctx, 'transfer-item', `${spec.key}-${k}`), tenantId: ctx.tenantId, stockTransferId: id, productId: p.id,
        quantityRequested: qty, quantityShipped: sent, quantitySent: sent, quantityReceived: recv ? qty : 0,
        createdAt: created, updatedAt: recv ?? ship ?? created, createdBy: admin,
      });
      if (ship) {
        moves.push({ productId: p.id, where: 'warehouse', delta: -qty, movementType: 'TRANSFER', referenceType: 'STOCK_TRANSFER', referenceId: id, date: ship, notes: `Transfer to ${ctx.showroom.name}`, unitCostPaise: null });
      }
      if (recv) {
        moves.push({ productId: p.id, where: 'showroom', delta: qty, movementType: 'TRANSFER', referenceType: 'STOCK_TRANSFER', referenceId: id, date: recv, notes: `Transfer from ${ctx.warehouse.name}`, unitCostPaise: null });
      }
    });
    transferRows.push({
      id, tenantId: ctx.tenantId, fromLocationId: ctx.warehouse.id, toLocationId: ctx.showroom.id, status: spec.status, requestedBy: admin,
      approvedBy: spec.status === 'DRAFT' ? null : admin, notes: spec.notes, createdAt: created, updatedAt: recv ?? ship ?? created, createdBy: admin,
    });
  }

  // ─── warehouse opening stock (covers every later outflow, always keeps a buffer of >= 3) ──
  const whProducts = new Set<string>();
  for (const m of moves) if (m.where === 'warehouse') whProducts.add(m.productId);
  for (const p of rng.shuffle(ctx.products).slice(0, 14)) whProducts.add(p.id);
  const whOrdered = ctx.products.filter((p) => whProducts.has(p.id)); // stable, sorted by sku
  let earliest = daysAgoAt(now, 88, 10);
  for (const m of moves) if (m.where === 'warehouse' && m.date.getTime() < earliest.getTime()) earliest = m.date;
  const openingDate = new Date(Math.min(daysAgoAt(now, 88, 10).getTime(), earliest.getTime() - 3_600_000));
  for (const p of whOrdered) {
    const own = moves.filter((m) => m.productId === p.id && m.where === 'warehouse').sort((a, b) => a.date.getTime() - b.date.getTime());
    let run = 0;
    let min = 0;
    for (const m of own) {
      run += m.delta;
      if (run < min) min = run;
    }
    const opening = Math.max(0, -min) + rng.int(3, 8);
    moves.push({
      productId: p.id, where: 'warehouse', delta: opening, movementType: 'IN', referenceType: 'OPENING_STOCK', referenceId: null,
      date: openingDate, notes: 'Opening stock at the warehouse', unitCostPaise: p.costPaise,
    });
  }

  // ─── stock take 1: warehouse cycle count, COMPLETED (variances posted as ADJUST moves) ──
  const st1Id = eid(ctx, 'stocktake', 0);
  const st1Start = daysAgoAt(now, 20, 10);
  const st1End = daysAgoAt(now, 20, 18);
  const stakeRows: Row[] = [];
  const stakeItemRows: Row[] = [];
  const st1Products = rng.shuffle(whOrdered).slice(0, 12);
  const st1Variance = [-1, -1, 1, -2, 0, 0, 0, 0, 1, 0, 0, -1];
  st1Products.forEach((p, k) => {
    const system = qtyAt(p.id, 'warehouse', new Date(st1End.getTime() - 1));
    const v = st1Variance[k]!;
    stakeItemRows.push({
      id: eid(ctx, 'stocktake-item', `0-${k}`), tenantId: ctx.tenantId, stockTakeId: st1Id, productId: p.id, systemQuantity: system, countedQuantity: system + v,
      varianceQuantity: v, notes: v === 0 ? null : v < 0 ? 'Short on count, recounted twice' : 'Surplus found in the vault tray',
      createdAt: st1Start, updatedAt: st1End, createdBy: admin,
    });
    if (v !== 0) {
      moves.push({
        productId: p.id, where: 'warehouse', delta: v, movementType: 'ADJUST', referenceType: 'STOCK_TAKE', referenceId: st1Id, date: st1End,
        notes: `Stock take adjustment: variance of ${v}`, unitCostPaise: null,
      });
    }
  });
  stakeRows.push({
    id: st1Id, tenantId: ctx.tenantId, locationId: ctx.warehouse.id, status: 'COMPLETED', startedAt: st1Start, completedAt: st1End,
    notes: 'Quarterly cycle count of the main warehouse', createdAt: st1Start, updatedAt: st1End, createdBy: admin,
  });

  // ─── stock take 2: showroom count, IN_PROGRESS (counted lines have variances, nothing posted yet) ──
  const st2Id = eid(ctx, 'stocktake', 1);
  const st2Start = daysAgoAt(now, 2, 11);
  const st2Products = rng.shuffle(transferable).slice(0, 14);
  const st2Variance = [0, 0, -1, 0, 1, 0, 0, -1];
  st2Products.forEach((p, k) => {
    const system = Math.max(0, qtyAt(p.id, 'showroom', st2Start));
    let counted: number | null = null;
    let variance: number | null = null;
    if (k < st2Variance.length) {
      const v = system === 0 && st2Variance[k]! < 0 ? 0 : st2Variance[k]!;
      counted = system + v;
      variance = v;
    }
    stakeItemRows.push({
      id: eid(ctx, 'stocktake-item', `1-${k}`), tenantId: ctx.tenantId, stockTakeId: st2Id, productId: p.id, systemQuantity: system, countedQuantity: counted,
      varianceQuantity: variance, notes: variance ? (variance < 0 ? 'One piece missing from the tray, checking CCTV log' : 'Extra piece found, check the sale entry') : null,
      createdAt: st2Start, updatedAt: st2Start, createdBy: admin,
    });
  });
  stakeRows.push({
    id: st2Id, tenantId: ctx.tenantId, locationId: ctx.showroom.id, status: 'IN_PROGRESS', startedAt: st2Start, completedAt: null,
    notes: 'Showroom counter-wise count in progress', createdAt: st2Start, updatedAt: st2Start, createdBy: admin,
  });

  // ─── stock items + movements + deltas ─────────────────────────────
  const whItemId = (productId: string) => eid(ctx, 'stockitem-wh', productId);
  const srExtraId = (productId: string) => eid(ctx, 'stockitem-sr', productId);
  const showroomItemId = (p: ProductInfo) => p.showroomStockId ?? srExtraId(p.id);

  const sorted = moves
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.date.getTime() - b.m.date.getTime() || a.i - b.i)
    .map((x) => x.m);

  const whQty = new Map<string, number>();
  const srDelta = new Map<string, number>();
  const lastMoveAt = new Map<string, Date>();
  const occurrence = new Map<string, number>();
  const movementRows: Row[] = [];
  for (const m of sorted) {
    const p = productById.get(m.productId);
    if (!p) throw new Error(`Stock move references unknown product ${m.productId}`);
    const stockItemId = m.where === 'warehouse' ? whItemId(p.id) : showroomItemId(p);
    if (m.where === 'warehouse') whQty.set(p.id, (whQty.get(p.id) ?? 0) + m.delta);
    else srDelta.set(p.id, (srDelta.get(p.id) ?? 0) + m.delta);
    lastMoveAt.set(stockItemId, m.date);
    const base = `${m.referenceType}:${m.referenceId ?? 'none'}:${p.id}:${m.movementType}:${m.where}`;
    const n = (occurrence.get(base) ?? 0) + 1;
    occurrence.set(base, n);
    movementRows.push({
      id: eid(ctx, 'stockmove', `${base}:${n}`), tenantId: ctx.tenantId, stockItemId, movementType: m.movementType, quantityChange: m.delta,
      unitCostPaise: m.unitCostPaise, referenceType: m.referenceType, referenceId: m.referenceId, notes: m.notes, movedAt: m.date,
      createdAt: m.date, updatedAt: m.date, createdBy: admin,
    });
  }

  const stockItemRows: Row[] = [];
  whOrdered.forEach((p, k) => {
    const qty = whQty.get(p.id) ?? 0;
    stockItemRows.push({
      id: whItemId(p.id), tenantId: ctx.tenantId, productId: p.id, locationId: ctx.warehouse.id, quantityOnHand: qty, quantityReserved: 0, quantityOnOrder: 0,
      reorderLevel: 4, reorderQuantity: 12, lastCountedAt: st1End, binLocation: `WH-${String.fromCharCode(65 + (k % 4))}${Math.floor(k / 4) + 1}`,
      createdAt: openingDate, updatedAt: lastMoveAt.get(whItemId(p.id)) ?? openingDate, createdBy: admin,
    });
  });

  const stockDeltas: ModulePlan['stockDeltas'] = [];
  for (const p of ctx.products) {
    const d = srDelta.get(p.id) ?? 0;
    if (p.showroomStockId === null) {
      // no catalog row at the showroom: create one that carries the net quantity
      if (srDelta.has(p.id)) {
        stockItemRows.push({
          id: srExtraId(p.id), tenantId: ctx.tenantId, productId: p.id, locationId: ctx.showroom.id, quantityOnHand: Math.max(0, d), quantityReserved: 0,
          quantityOnOrder: 0, reorderLevel: 2, reorderQuantity: 6, createdAt: openingDate, createdBy: admin,
        });
      }
    } else if (d !== 0) {
      stockDeltas.push({ stockItemId: p.showroomStockId, delta: d });
    }
  }

  // ─── metal stock (valuation = current ctx metal rate x weight) ────
  const metalRows: Row[] = [];
  let mi = 0;
  const addMetal = (locationId: string, spec: (typeof METAL_STOCK)[number], grams: number) => {
    const weightMg = BigInt(grams) * 1000n + BigInt(rng.int(0, 900));
    const key = `${spec.metal}_${spec.fineness}`;
    metalRows.push({
      id: eid(ctx, 'metalstock', mi), tenantId: ctx.tenantId, locationId, metalType: spec.metal, purityFineness: spec.fineness, weightMg,
      valuePaise: roundDiv(ratePaisePerGram(key) * weightMg, 1000n), createdAt: daysAgoAt(now, 85, 10), createdBy: admin,
    });
    mi++;
  };
  for (const spec of METAL_STOCK) {
    addMetal(ctx.warehouse.id, spec, spec.whGrams);
    addMetal(ctx.showroom.id, spec, spec.srGrams);
  }

  // ─── loose stones and certified diamonds ──────────────────────────
  const stoneRows: Row[] = STONES.map((s, i) => {
    const cert = s.lab ? fakeCertificate(rng, s.lab, s.origin === 'LAB_GROWN') : null;
    return {
      id: eid(ctx, 'stonestock', i), tenantId: ctx.tenantId, locationId: s.where === 'warehouse' ? ctx.warehouse.id : ctx.showroom.id, stoneType: s.stoneType,
      shape: s.shape, sizeRange: s.sizeRange, color: s.color, clarity: s.clarity, cutGrade: s.cutGrade, polish: s.polish, symmetry: s.symmetry,
      fluorescence: s.fluorescence, origin: s.origin, growthMethod: s.growthMethod, treatment: s.treatment, reportLab: s.lab,
      totalWeightCt: Math.floor(s.mg / 200), totalWeightMg: BigInt(s.mg), totalPieces: s.pieces, valuePaise: rupees(s.valueRupees),
      certificationNumber: cert, createdAt: daysAgoAt(now, 70 - i, 11), createdBy: admin,
    };
  });
  void pickWeighted;

  const own: Record<string, Row[]> = {
    stockMovement: movementRows,
    stockTransfer: transferRows,
    stockTransferItem: transferItemRows,
    stockTake: stakeRows,
    stockTakeItem: stakeItemRows,
    metalStock: metalRows,
    stoneStock: stoneRows,
  };
  const tables: TablePlan[] = [
    { model: 'stockItem', rows: stockItemRows },
    ...wholesale.module.tables,
    ...mfg.module.tables,
    ...Object.entries(own).map(([model, rows]) => ({ model, rows })),
  ];

  return {
    name: 'ops',
    sentinel: { model: 'metalStock', id: eid(ctx, 'metalstock', 0) },
    tables,
    stockDeltas: [...stockDeltas, ...wholesale.module.stockDeltas, ...mfg.module.stockDeltas],
  };
}
