/** Manufacturing planner: karigars, BOMs (+items), job orders, QC, wastage, karigar metal ledger, attendance. */
import { planBomItems } from '../seed-demo-bom-items';
import { DEMO_RATE_RUPEES_PER_GRAM } from '../seed-demo-catalog-data';
import {
  CITIES, FIRST_NAMES, LAST_NAMES, PhoneBook, Rng, addDays, bsum, daysAgoAt, eid, fakeAadhaar, fakeBankAccount, fakeIfsc, fakePan, pad,
  rupees, startOfDay, type DemoContext, type ModulePlan, type Row, type TablePlan,
} from './common';
import type { StockMove } from './plan-retail';

export interface MfgResult {
  module: ModulePlan;
  moves: StockMove[];
}

const SPECS = ['Filigree', 'Kundan setting', 'Stone setting', 'Polish and finishing', 'Casting', 'Wax modelling', 'Chain making', 'Hallmark prep'];
const SKILLS = ['SENIOR', 'MASTER', 'SENIOR', 'JUNIOR', 'MASTER', 'JUNIOR', 'SENIOR', 'APPRENTICE'] as const;

const JOB_STATUSES = [
  'COMPLETED', 'COMPLETED', 'QC_PASSED', 'QC_FAILED', 'QC_PENDING', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'MATERIAL_ISSUED', 'MATERIAL_ISSUED',
  'PLANNED', 'PLANNED', 'DRAFT', 'CANCELLED',
] as const;

export function planManufacturing(ctx: DemoContext, customerIds: string[]): MfgResult {
  const rng = new Rng(`${ctx.tenantId}:mfg`);
  const phones = new PhoneBook(new Rng(`${ctx.tenantId}:phones-m`));
  const { now } = ctx;
  const admin = ctx.adminUserId;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const moves: StockMove[] = [];
  const goldRate = BigInt(DEMO_RATE_RUPEES_PER_GRAM['GOLD_916']! * 100);

  const karigarIds: string[] = [];
  const daily: bigint[] = [];
  SPECS.forEach((spec, i) => {
    const id = eid(ctx, 'karigar', i);
    karigarIds.push(id);
    const wage = rupees(rng.int(8, 22) * 100);
    daily.push(wage);
    const city = CITIES[i % 3]!;
    add('karigar', {
      id, tenantId: ctx.tenantId, employeeCode: `KAR-${pad(i + 1, 3)}`, firstName: rng.pick(FIRST_NAMES), lastName: rng.pick(LAST_NAMES), phone: phones.next(),
      email: `karigar${i + 1}@example.com`, specialization: spec, skillLevel: SKILLS[i], dailyWagePaise: wage, locationId: ctx.workshop.id, isActive: true,
      joiningDate: daysAgoAt(now, rng.int(200, 2500), 9), address: `${rng.int(1, 80)}, Workshop Lane, ${city.city}`, idProof: 'Aadhaar', bankAccountNumber: fakeBankAccount(rng),
      ifscCode: fakeIfsc(rng, city.ifscPrefix), panNumber: fakePan(rng, 'P', 'K'), aadhaarNumber: fakeAadhaar(rng), createdBy: admin,
    });
  });

  // BOMs for the first six gold products
  const gold = ctx.products.filter((p) => p.productType === 'GOLD').slice(0, 6);
  const bomRefs = gold.map((p, i) => {
    const id = eid(ctx, 'bom', i);
    const est = p.costPaise;
    add('billOfMaterials', {
      id, tenantId: ctx.tenantId, name: `BOM ${p.name}`, version: 1, productId: p.id, outputQuantity: 1, status: 'ACTIVE', notes: 'Demo bill of materials', estimatedCostPaise: est,
      estimatedTimeMins: rng.int(240, 900), createdAt: daysAgoAt(now, 120 - i * 5, 10), createdBy: admin,
    });
    const items = planBomItems(Number(est));
    for (const it of items) {
      add('bomItem', {
        id: eid(ctx, 'bom-item', `${id}-${it.sortOrder}`), tenantId: ctx.tenantId, bomId: id, itemType: it.itemType, description: it.description, quantityRequired: it.quantityRequired,
        unitOfMeasure: it.unitOfMeasure, weightMg: it.weightMg === null ? null : BigInt(it.weightMg), estimatedCostPaise: BigInt(it.estimatedCostPaise), wastagePercent: it.wastagePercent,
        sortOrder: it.sortOrder, createdBy: admin,
      });
    }
    const metal = items.find((x) => x.itemType === 'METAL');
    return { id, product: p, est, metal };
  });

  // jobs
  const bal = new Map<string, { issued: bigint; returned: bigint; wasted: bigint }>();
  const bump = (k: string, f: 'issued' | 'returned' | 'wasted', v: bigint) => {
    const cur = bal.get(k) ?? { issued: 0n, returned: 0n, wasted: 0n };
    cur[f] += v;
    bal.set(k, cur);
  };
  const jobIds: string[] = [];
  JOB_STATUSES.forEach((status, i) => {
    const bom = bomRefs[i % bomRefs.length]!;
    const id = eid(ctx, 'job', i);
    jobIds.push(id);
    const karigar = karigarIds[i % karigarIds.length]!;
    const created = daysAgoAt(now, 70 - i * 4, 10);
    const qty = rng.int(1, 3);
    const started = status === 'DRAFT' || status === 'PLANNED' || status === 'CANCELLED' ? null : addDays(created, 2);
    const done = status === 'COMPLETED';
    const ended = done ? addDays(created, 12) : null;
    const startStart = new Date(Math.min(now.getTime() - 60_000, (started ?? addDays(created, 2)).getTime()));
    add('jobOrder', {
      id, tenantId: ctx.tenantId, jobNumber: `JO-${pad(i + 1, 6)}`, bomId: bom.id, productId: bom.product.id, customerId: i === 4 || i === 9 ? customerIds[i] ?? null : null, locationId: ctx.workshop.id,
      status, priority: rng.pick(['LOW', 'MEDIUM', 'HIGH', 'URGENT']), quantity: qty, estimatedStartDate: addDays(created, 2), estimatedEndDate: addDays(created, 14),
      actualStartDate: started ? startStart : null, actualEndDate: ended && ended.getTime() < now.getTime() ? ended : done ? new Date(now.getTime() - 3600000) : null, assignedKarigarId: karigar,
      notes: status === 'CANCELLED' ? 'Cancelled: design revised by customer' : 'Demo job order', specialInstructions: 'Handle with care; hallmark before delivery.', createdAt: created, createdBy: admin,
    });
    const issuedStatuses = ['MATERIAL_ISSUED', 'IN_PROGRESS', 'QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COMPLETED'];
    if (issuedStatuses.includes(status) && bom.metal?.weightMg) {
      const required = BigInt(bom.metal.weightMg) * BigInt(qty);
      const wasted = status === 'COMPLETED' || status === 'QC_PASSED' ? (required * 2n) / 100n : 0n;
      const returned = status === 'COMPLETED' || status === 'QC_PASSED' ? required / 20n : 0n;
      const cost = (required * goldRate) / 1000n;
      const key = `${karigar}`;
      add('jobOrderItem', {
        id: eid(ctx, 'job-item', i), tenantId: ctx.tenantId, jobOrderId: id, productId: null, description: '22K Gold (916)', requiredWeightMg: required, issuedWeightMg: required,
        returnedWeightMg: returned, wastedWeightMg: wasted, costPaise: cost, createdBy: admin,
      });
      add('karigarTransaction', {
        id: eid(ctx, 'kar-tx', `${i}-issue`), tenantId: ctx.tenantId, karigarId: karigar, transactionType: 'ISSUE', jobOrderId: id, metalType: 'GOLD', purityFineness: 916, weightMg: required,
        notes: 'Metal issued for job', createdAt: addDays(created, 2), createdBy: admin,
      });
      bump(key, 'issued', required);
      if (returned > 0n) {
        add('karigarTransaction', { id: eid(ctx, 'kar-tx', `${i}-return`), tenantId: ctx.tenantId, karigarId: karigar, transactionType: 'RETURN', jobOrderId: id, metalType: 'GOLD', purityFineness: 916, weightMg: returned, notes: 'Balance metal returned', createdAt: addDays(created, 10), createdBy: admin });
        bump(key, 'returned', returned);
      }
      if (wasted > 0n) {
        add('karigarTransaction', { id: eid(ctx, 'kar-tx', `${i}-waste`), tenantId: ctx.tenantId, karigarId: karigar, transactionType: 'WASTAGE', jobOrderId: id, metalType: 'GOLD', purityFineness: 916, weightMg: wasted, notes: 'Process wastage', createdAt: addDays(created, 10), createdBy: admin });
        bump(key, 'wasted', wasted);
      }
      if (status === 'COMPLETED' || status === 'QC_PASSED') {
        const labor = rupees(rng.int(8, 25) * 100) * BigInt(qty);
        const costs: Array<[string, string, bigint, bigint | null]> = [
          ['MATERIAL_METAL', '22K gold issued', cost, required], ['LABOR', 'Karigar labour', labor, null], ['OVERHEAD', 'Workshop overhead', labor / 4n, null],
          ['WASTAGE', 'Metal wastage value', (wasted * goldRate) / 1000n, wasted],
        ];
        costs.forEach(([ct, d, amt, w], k) => add('jobCost', { id: eid(ctx, 'job-cost', `${i}-${k}`), tenantId: ctx.tenantId, jobOrderId: id, costType: ct, description: d, amountPaise: amt, weightMg: w, createdBy: admin }));
      }
    }
    const qcStatuses = ['QC_PENDING', 'QC_PASSED', 'QC_FAILED', 'COMPLETED'];
    if (qcStatuses.includes(status)) {
      add('qualityCheckpoint', {
        id: eid(ctx, 'qc', `${i}-a`), tenantId: ctx.tenantId, jobOrderId: id, checkpointType: 'IN_PROCESS', checkedBy: admin, status: 'PASSED', weightMg: bom.product.netWeightMg, purityFineness: 916,
        findings: 'Setting and soldering within tolerance.', checkedAt: addDays(created, 7), createdBy: admin,
      });
      if (status !== 'QC_PENDING') {
        const failed = status === 'QC_FAILED';
        add('qualityCheckpoint', {
          id: eid(ctx, 'qc', `${i}-b`), tenantId: ctx.tenantId, jobOrderId: id, checkpointType: failed ? 'FINAL' : 'HALLMARK', checkedBy: admin, status: failed ? 'REWORK' : 'PASSED',
          weightMg: bom.product.netWeightMg, purityFineness: 916, findings: failed ? 'Surface porosity near the clasp, send back for polish.' : 'Purity verified at 916.', checkedAt: addDays(created, 11), createdBy: admin,
        });
      }
    }
    if (done && started) {
      const when = new Date(Math.min(now.getTime() - 60_000, addDays(created, 13).getTime()));
      moves.push({ productId: bom.product.id, where: 'warehouse', delta: qty, movementType: 'IN', referenceType: 'MANUFACTURING_JOB', referenceId: id, date: when, notes: 'Finished goods from job order', unitCostPaise: bom.product.costPaise });
    }
  });
  let ki = 0;
  for (const [k, b] of bal) {
    add('karigarMetalBalance', {
      id: eid(ctx, 'kar-bal', ki++), tenantId: ctx.tenantId, karigarId: k, metalType: 'GOLD', purityFineness: 916, issuedWeightMg: b.issued, returnedWeightMg: b.returned, wastedWeightMg: b.wasted,
      balanceWeightMg: b.issued - b.returned - b.wasted, lastReconciledAt: daysAgoAt(now, 5, 18), createdBy: admin,
    });
  }

  // attendance: last 30 days, Sundays off
  karigarIds.forEach((kid, ki2) => {
    for (let d = 0; d < 30; d++) {
      const date = startOfDay(daysAgoAt(now, d, 0));
      if (date.getDay() === 0) continue;
      const r = (d * 7 + ki2 * 3) % 17;
      const status = r === 0 ? 'ABSENT' : r === 5 ? 'HALF_DAY' : r === 9 ? 'LEAVE' : 'PRESENT';
      const wage = status === 'PRESENT' ? daily[ki2]! : status === 'HALF_DAY' ? daily[ki2]! / 2n : 0n;
      add('karigarAttendance', {
        id: eid(ctx, 'kar-att', `${ki2}-${d}`), tenantId: ctx.tenantId, karigarId: kid, date, status,
        checkInTime: status === 'PRESENT' || status === 'HALF_DAY' ? new Date(date.getTime() + 9.5 * 3600000) : null,
        checkOutTime: status === 'PRESENT' ? new Date(date.getTime() + 18 * 3600000) : status === 'HALF_DAY' ? new Date(date.getTime() + 13.5 * 3600000) : null,
        overtimeMinutes: status === 'PRESENT' && r % 4 === 0 ? 60 : 0, wagePaidPaise: wage, createdBy: admin,
      });
    }
  });

  // metal recovery
  const recov = [['SCRAP', 'PENDING'], ['FILINGS', 'SENT_TO_REFINER'], ['POLISH_DUST', 'COMPLETED']] as const;
  recov.forEach(([src, status], i) => {
    const gross = BigInt(rng.int(20, 80)) * 1000n;
    const expected = (gross * 916n) / 1000n;
    const done = status === 'COMPLETED';
    const when = daysAgoAt(now, 30 - i * 10, 12);
    add('metalRecovery', {
      id: eid(ctx, 'recovery', i), tenantId: ctx.tenantId, locationId: ctx.workshop.id, recoveryNumber: `REC-${pad(i + 1, 6)}`, sourceType: src, metalType: 'GOLD', grossWeightMg: gross, purityFineness: 916,
      expectedFineMg: expected, recoveredFineMg: done ? expected - 400n : null, lossMg: done ? 400n : null, recoveredPurityFineness: done ? 995 : null, refinerName: status === 'PENDING' ? null : 'Zaveri Gold Refinery',
      karigarId: karigarIds[i], status, sentAt: status === 'PENDING' ? null : addDays(when, 1), completedAt: done ? addDays(when, 4) : null, createdAt: when, createdBy: admin,
    });
  });

  // production plan
  const planId = eid(ctx, 'plan', 0);
  add('productionPlan', { id: planId, tenantId: ctx.tenantId, name: 'Wedding season production', locationId: ctx.workshop.id, startDate: daysAgoAt(now, 20, 9), endDate: addDays(now, 25), status: 'ACTIVE', notes: 'Demo plan', createdBy: admin });
  [5, 6, 8].forEach((ji, k) => add('productionPlanItem', {
    id: eid(ctx, 'plan-item', k), tenantId: ctx.tenantId, planId, productId: bomRefs[ji % bomRefs.length]!.product.id, quantity: 2 + k, bomId: bomRefs[ji % bomRefs.length]!.id, priority: 'HIGH',
    estimatedStartDate: daysAgoAt(now, 15 - k * 3, 9), estimatedEndDate: addDays(now, 10 + k * 4), jobOrderId: jobIds[ji], createdBy: admin,
  }));

  void bsum;
  const order = ['karigar', 'billOfMaterials', 'bomItem', 'jobOrder', 'jobOrderItem', 'jobCost', 'karigarTransaction', 'karigarMetalBalance', 'qualityCheckpoint', 'karigarAttendance',
    'metalRecovery', 'productionPlan', 'productionPlanItem'];
  const tables: TablePlan[] = order.filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
  return { module: { name: 'manufacturing', sentinel: { model: 'karigar', id: karigarIds[0]! }, tables, stockDeltas: [] }, moves };
}
