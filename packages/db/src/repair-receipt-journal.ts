/**
 * Repair for receipt journals posted before HK-FIN-01 was fixed.
 * ------------------------------------------------------------
 * recordPayment used to resolve BOTH legs of "Payment received via X" to the same
 * first ASSET account (1000 Cash / Bank), producing Dr 1000 / Cr 1000. A customer
 * receipt must be Dr Cash/Bank, Cr Accounts Receivable (1200).
 *
 * This script touches ONLY journal entries whose description starts with
 * "Payment received", that have a debit line and a credit line sharing one
 * account. The CREDIT line is re-pointed to the tenant's Accounts Receivable
 * account (code 1200, else name "Accounts Receivable"). No amounts change.
 * Idempotent: once repaired the lines no longer share an account, so a re-run
 * finds nothing. Tenants without an AR account are skipped with a warning.
 *
 * Usage (dry run by default, prints what would change):
 *   pnpm --filter @caratflow/db exec tsx src/repair-receipt-journal.ts
 * Apply:
 *   pnpm --filter @caratflow/db exec tsx src/repair-receipt-journal.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

interface Line { id: string; accountId: string; debitPaise: bigint; creditPaise: bigint }

/** Pure: the credit line to re-point when debit and credit legs share an account, else null. */
export function findBrokenCreditLine(lines: Line[]): Line | null {
  const debit = lines.find((l) => l.debitPaise > 0n && l.creditPaise === 0n);
  const credit = lines.find((l) => l.creditPaise > 0n && l.debitPaise === 0n);
  if (!debit || !credit || lines.length !== 2) return null;
  return debit.accountId === credit.accountId ? credit : null;
}

export async function repairReceiptJournals(prisma: PrismaClient, apply: boolean) {
  const result = { checked: 0, repaired: 0, skippedNoAr: 0 };
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const t of tenants) {
    const entries = await prisma.journalEntry.findMany({
      where: { tenantId: t.id, description: { startsWith: 'Payment received' } },
      include: { lines: true },
    });
    const ar =
      (await prisma.account.findFirst({ where: { tenantId: t.id, accountCode: '1200' } })) ??
      (await prisma.account.findFirst({ where: { tenantId: t.id, name: 'Accounts Receivable' } }));
    for (const e of entries) {
      result.checked++;
      const bad = findBrokenCreditLine(e.lines);
      if (!bad) continue;
      if (!ar || ar.id === bad.accountId) { result.skippedNoAr++; console.warn(`[${t.slug}] ${e.entryNumber}: no usable AR account, skipped`); continue; }
      console.warn(`[${t.slug}] ${e.entryNumber}: credit line ${bad.id} account ${bad.accountId} -> AR ${ar.id}${apply ? '' : ' (dry run)'}`);
      if (apply) {
        await prisma.journalEntryLine.update({ where: { id: bad.id }, data: { accountId: ar.id } });
      }
      result.repaired++;
    }
  }
  return result;
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
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const r = await repairReceiptJournals(prisma, apply);
    console.warn(`receipt journal repair (${apply ? 'APPLIED' : 'dry run'}): ${JSON.stringify(r)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('Receipt journal repair failed:', e); process.exit(1); });
}
