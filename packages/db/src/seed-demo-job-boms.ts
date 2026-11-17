/**
 * Backfill: link demo job orders that have no BOM to a bill of materials so the
 * manufacturing report (jobSummary) can compute an estimated cost. Prefers the
 * BOM of the job's own product, otherwise cycles through the tenant's ACTIVE
 * BOMs. Only touches rows where bom_id IS NULL; idempotent.
 *
 * Usage:  pnpm --filter @caratflow/db exec tsx src/seed-demo-job-boms.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export function pickBomId(
  job: { productId: string },
  boms: Array<{ id: string; productId: string }>,
  index: number,
): string | null {
  if (boms.length === 0) return null;
  return (boms.find((b) => b.productId === job.productId) ?? boms[index % boms.length]!).id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    for (const p of [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')]) {
      if (!fs.existsSync(p)) continue;
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"]*)"?\s*$/);
        if (m) process.env.DATABASE_URL = m[1];
      }
      if (process.env.DATABASE_URL) break;
    }
  }
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    for (const t of tenants) {
      const boms = await prisma.billOfMaterials.findMany({
        where: { tenantId: t.id, status: 'ACTIVE' },
        select: { id: true, productId: true },
        orderBy: { id: 'asc' },
      });
      const jobs = await prisma.jobOrder.findMany({
        where: { tenantId: t.id, bomId: null },
        select: { id: true, productId: true },
        orderBy: { id: 'asc' },
      });
      let linked = 0;
      for (const [i, job] of jobs.entries()) {
        const bomId = pickBomId(job, boms, i);
        if (!bomId) continue;
        await prisma.jobOrder.update({ where: { id: job.id }, data: { bomId } });
        linked++;
      }
      console.warn(`job-bom backfill [${t.slug}]: ${linked} of ${jobs.length} unlinked jobs linked`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('Job-BOM backfill failed:', e); process.exit(1); });
}
