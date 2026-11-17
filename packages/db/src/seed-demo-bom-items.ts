/**
 * Backfill: demo bills of materials were created with an estimated cost but no
 * component rows, so the BOM page showed a cost next to "No components".
 * For every BOM that has ZERO items this inserts 4 plausible components
 * (metal, finding, labour, overhead) whose cost sums EXACTLY to the BOM's
 * estimatedCostPaise (the overhead line absorbs rounding).
 *
 * INSERT-only and idempotent: BOMs that already have items are never touched,
 * so a second run inserts 0 rows. Also used by demo-seed.ts.
 *
 * Usage:  pnpm --filter @caratflow/db exec tsx src/seed-demo-bom-items.ts
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface PlannedBomItem {
  itemType: 'METAL' | 'FINDING' | 'LABOR' | 'OVERHEAD';
  description: string;
  quantityRequired: number;
  unitOfMeasure: string;
  weightMg: number | null;
  estimatedCostPaise: number;
  wastagePercent: number;
  sortOrder: number;
}

/** 22K gold demo rate: Rs 6,500 per gram, in paise per gram. */
const METAL_RATE_PAISE_PER_GRAM = 650_000;

/**
 * Split a BOM estimate into components. Pure; the costs always sum to
 * `totalPaise` exactly. Returns [] when there is nothing to split.
 */
export function planBomItems(totalPaise: number): PlannedBomItem[] {
  if (!Number.isFinite(totalPaise) || totalPaise <= 0) return [];
  const targetMetal = Math.round(totalPaise * 0.58);
  // weight (mg) x rate (paise/g) / 1000 = metal cost
  const weightMg = Math.max(1, Math.round((targetMetal * 1000) / METAL_RATE_PAISE_PER_GRAM));
  const metal = Math.min(totalPaise, Math.round((weightMg * METAL_RATE_PAISE_PER_GRAM) / 1000));
  const finding = Math.min(totalPaise - metal, Math.round(totalPaise * 0.05));
  const labour = Math.min(totalPaise - metal - finding, Math.round(totalPaise * 0.22));
  const overhead = totalPaise - metal - finding - labour; // absorbs rounding

  const items: PlannedBomItem[] = [
    { itemType: 'METAL', description: '22K Gold (916)', quantityRequired: weightMg / 1000, unitOfMeasure: 'g', weightMg, estimatedCostPaise: metal, wastagePercent: 200, sortOrder: 1 },
    { itemType: 'FINDING', description: 'Findings and clasps', quantityRequired: 1, unitOfMeasure: 'lot', weightMg: null, estimatedCostPaise: finding, wastagePercent: 0, sortOrder: 2 },
    { itemType: 'LABOR', description: 'Karigar making labour', quantityRequired: 1, unitOfMeasure: 'lot', weightMg: null, estimatedCostPaise: labour, wastagePercent: 0, sortOrder: 3 },
    { itemType: 'OVERHEAD', description: 'Workshop overhead and finishing', quantityRequired: 1, unitOfMeasure: 'lot', weightMg: null, estimatedCostPaise: overhead, wastagePercent: 0, sortOrder: 4 },
  ];
  return items.filter((i) => i.estimatedCostPaise > 0 || i.itemType === 'OVERHEAD');
}

function itemId(bomId: string, sortOrder: number): string {
  const h = crypto.createHash('sha1').update(`bom-item:${bomId}:${sortOrder}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Insert components for every BOM of the tenant that has none. Returns counts. */
export async function seedBomItems(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ boms: number; withoutItems: number; inserted: number; skippedZeroCost: number }> {
  const boms = await prisma.billOfMaterials.findMany({
    where: { tenantId },
    select: { id: true, estimatedCostPaise: true, _count: { select: { items: true } } },
    orderBy: { id: 'asc' },
  });
  let withoutItems = 0;
  let inserted = 0;
  let skippedZeroCost = 0;
  for (const bom of boms) {
    if (bom._count.items > 0) continue;
    withoutItems++;
    const plan = planBomItems(Number(bom.estimatedCostPaise));
    if (plan.length === 0) { skippedZeroCost++; continue; }
    const res = await prisma.bomItem.createMany({
      data: plan.map((p) => ({
        id: itemId(bom.id, p.sortOrder),
        tenantId,
        bomId: bom.id,
        itemType: p.itemType,
        description: p.description,
        quantityRequired: p.quantityRequired,
        unitOfMeasure: p.unitOfMeasure,
        weightMg: p.weightMg === null ? null : BigInt(p.weightMg),
        estimatedCostPaise: BigInt(p.estimatedCostPaise),
        wastagePercent: p.wastagePercent,
        sortOrder: p.sortOrder,
      })),
      skipDuplicates: true,
    });
    inserted += res.count;
  }
  return { boms: boms.length, withoutItems, inserted, skippedZeroCost };
}

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  for (const p of [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"]*)"?\s*$/);
      if (m) process.env.DATABASE_URL = m[1];
    }
    if (process.env.DATABASE_URL) return;
  }
}

async function main() {
  loadDatabaseUrl();
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const slug = process.env.DEMO_TENANT_SLUG ?? 'sharma-jewellers';
    const tenants = await prisma.tenant.findMany({ where: { slug }, select: { id: true, slug: true } });
    for (const t of tenants) {
      const r = await seedBomItems(prisma, t.id);
      console.warn(
        `bom-items backfill [${t.slug}]: ${r.boms} BOMs, ${r.withoutItems} without items, ${r.inserted} items inserted, ${r.skippedZeroCost} skipped (zero cost)`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('BOM items backfill failed:', e instanceof Error ? e.message : 'error'); process.exit(1); });
}
