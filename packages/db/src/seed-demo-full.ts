/**
 * CLI for the planner/runner pipeline: `tsx src/seed-demo-full.ts`
 * Env: TENANT_SLUG | TENANT_ID, DRY_RUN, ONLY, SKIP, DEMO_STAFF_PASSWORD, IMAGE_BASE_URL, DOMAIN.
 * WARNING: fills the live database of the tenant with fictional data; back up first.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { DemoSeedRefusal } from './demo-full/load-context';
import { formatReport, runDemoFull } from './demo-full/runner';

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

export async function main(): Promise<void> {
  loadDatabaseUrl();
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const r = await runDemoFull(prisma, process.env);
    for (const line of formatReport(r.report, r.slug)) console.warn(line);
    if (!r.staffUsers) console.warn('Staff demo users skipped (set DEMO_STAFF_PASSWORD, min 8 chars, to create them).');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Demo full seed failed:', e instanceof Error ? e.message : 'error');
    process.exit(e instanceof DemoSeedRefusal ? 2 : 1);
  });
}
