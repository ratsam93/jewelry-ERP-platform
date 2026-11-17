/**
 * Demo ledger seed.
 * ------------------------------------------------------------
 * The demo seeds create invoices and POS sales but never post any accounting
 * entries, so the finance reports (trial balance / P&L / balance sheet), which
 * read POSTED journal_entry_lines, are empty. This script is INSERT-only and
 * idempotent: it ensures a minimal chart of accounts and posts balanced journal
 * entries (deterministic entry numbers) for the existing documents:
 *
 *   SALES invoice (SENT / PARTIALLY_PAID / PAID / OVERDUE):
 *     Dr 1200 Accounts Receivable   total
 *       Cr 4000 Sales Revenue        total - tax
 *       Cr 2100 GST Output Payable   tax
 *     + receipt for the paid portion: Dr 1000 Cash/Bank, Cr 1200 AR
 *   POS sale (COMPLETED):
 *     Dr 1000 Cash/Bank  total
 *       Cr 4000 Sales Revenue       total - tax
 *       Cr 2100 GST Output Payable  tax
 *   Cost of goods (both): Dr 5000 COGS / Cr 1400 Inventory at 72% of net.
 *   One opening entry: Dr 1400 Inventory / Cr 3000 Owner Capital.
 *
 * Usage:  pnpm --filter @caratflow/db exec tsx src/seed-demo-ledger.ts
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const COGS_PERCENT = 72n;

export const CHART = [
  { code: '1000', name: 'Cash / Bank', type: 'ASSET' },
  { code: '1200', name: 'Accounts Receivable', type: 'ASSET' },
  { code: '1400', name: 'Inventory', type: 'ASSET' },
  { code: '2100', name: 'GST Output Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Owner Capital', type: 'EQUITY' },
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
] as const;
export type AccountCode = (typeof CHART)[number]['code'];

export interface PlannedLine { account: AccountCode; debit: bigint; credit: bigint; description: string }
export interface PlannedEntry { entryNumber: string; date: Date; description: string; reference: string; lines: PlannedLine[] }
export interface DocInput { number: string; date: Date; totalPaise: bigint; taxPaise: bigint; paidPaise?: bigint }

const L = (account: AccountCode, debit: bigint, credit: bigint, description: string): PlannedLine => ({ account, debit, credit, description });
export const cogsOf = (net: bigint): bigint => (net * COGS_PERCENT) / 100n;

export function planInvoiceEntries(inv: DocInput): PlannedEntry[] {
  const net = inv.totalPaise - inv.taxPaise;
  const entries: PlannedEntry[] = [
    {
      entryNumber: `DEMO-INV-${inv.number}`, date: inv.date, reference: inv.number,
      description: `Sales invoice ${inv.number}`,
      lines: [
        L('1200', inv.totalPaise, 0n, 'Receivable'),
        L('4000', 0n, net, 'Sales revenue'),
        ...(inv.taxPaise > 0n ? [L('2100', 0n, inv.taxPaise, 'GST output')] : []),
      ],
    },
    {
      entryNumber: `DEMO-COGS-INV-${inv.number}`, date: inv.date, reference: inv.number,
      description: `Cost of goods for invoice ${inv.number}`,
      lines: [L('5000', cogsOf(net), 0n, 'COGS'), L('1400', 0n, cogsOf(net), 'Inventory relief')],
    },
  ];
  const paid = inv.paidPaise ?? 0n;
  if (paid > 0n) {
    entries.push({
      entryNumber: `DEMO-RCPT-${inv.number}`, date: inv.date, reference: inv.number,
      description: `Receipt against invoice ${inv.number}`,
      lines: [L('1000', paid, 0n, 'Cash / bank receipt'), L('1200', 0n, paid, 'Receivable settled')],
    });
  }
  return entries;
}

export function planSaleEntries(sale: DocInput): PlannedEntry[] {
  const net = sale.totalPaise - sale.taxPaise;
  return [
    {
      entryNumber: `DEMO-SALE-${sale.number}`, date: sale.date, reference: sale.number,
      description: `POS sale ${sale.number}`,
      lines: [
        L('1000', sale.totalPaise, 0n, 'Cash / bank'),
        L('4000', 0n, net, 'Sales revenue'),
        ...(sale.taxPaise > 0n ? [L('2100', 0n, sale.taxPaise, 'GST output')] : []),
      ],
    },
    {
      entryNumber: `DEMO-COGS-SALE-${sale.number}`, date: sale.date, reference: sale.number,
      description: `Cost of goods for sale ${sale.number}`,
      lines: [L('5000', cogsOf(net), 0n, 'COGS'), L('1400', 0n, cogsOf(net), 'Inventory relief')],
    },
  ];
}

export function isBalanced(e: PlannedEntry): boolean {
  const d = e.lines.reduce((s, l) => s + l.debit, 0n);
  const c = e.lines.reduce((s, l) => s + l.credit, 0n);
  return d === c && d > 0n;
}

/** Plan all entries for a tenant's documents, including the opening-capital entry. */
export function planLedger(invoices: DocInput[], sales: DocInput[]): PlannedEntry[] {
  const planned: PlannedEntry[] = [];
  let totalCogs = 0n;
  for (const inv of invoices) {
    planned.push(...planInvoiceEntries(inv));
    totalCogs += cogsOf(inv.totalPaise - inv.taxPaise);
  }
  for (const s of sales) {
    planned.push(...planSaleEntries(s));
    totalCogs += cogsOf(s.totalPaise - s.taxPaise);
  }
  if (planned.length > 0) {
    const opening = totalCogs + totalCogs / 4n; // covers relieved stock plus 25% on hand
    const earliest = planned.reduce((m, e) => (e.date < m ? e.date : m), planned[0].date);
    planned.unshift({
      entryNumber: 'DEMO-OPENING', date: new Date(earliest.getTime() - 86400000), reference: 'OPENING',
      description: 'Opening inventory funded by owner capital',
      lines: [L('1400', opening, 0n, 'Opening inventory'), L('3000', 0n, opening, 'Owner capital')],
    });
  }
  return planned;
}

function id(key: string): string {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function seedTenant(prisma: PrismaClient, tenantId: string) {
  const counts = { accounts: 0, entries: 0, lines: 0, skipped: 0 };
  const accountIds = {} as Record<AccountCode, string>;
  for (const a of CHART) {
    let acc = await prisma.account.findFirst({ where: { tenantId, accountCode: a.code } });
    if (!acc) {
      acc = await prisma.account.create({
        data: { id: id(`ledger-acc-${tenantId}-${a.code}`), tenantId, accountCode: a.code, name: a.name, accountType: a.type },
      });
      counts.accounts++;
    }
    accountIds[a.code] = acc.id;
  }

  const [invoices, sales] = await Promise.all([
    prisma.invoice.findMany({ where: { tenantId, invoiceType: 'SALES', status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } } }),
    prisma.sale.findMany({ where: { tenantId, status: 'COMPLETED' } }),
  ]);
  const planned = planLedger(
    invoices.map((i) => ({ number: i.invoiceNumber, date: i.createdAt, totalPaise: i.totalPaise, taxPaise: i.taxPaise, paidPaise: i.paidPaise })),
    sales.map((s) => ({ number: s.saleNumber, date: s.createdAt, totalPaise: s.totalPaise, taxPaise: s.taxPaise })),
  );

  for (const e of planned) {
    if (!isBalanced(e)) { counts.skipped++; continue; }
    const exists = await prisma.journalEntry.findFirst({ where: { tenantId, entryNumber: e.entryNumber }, select: { id: true } });
    if (exists) { counts.skipped++; continue; }
    await prisma.journalEntry.create({
      data: {
        id: id(`ledger-je-${tenantId}-${e.entryNumber}`), tenantId, entryNumber: e.entryNumber, date: e.date,
        description: e.description, reference: e.reference, status: 'POSTED', postedAt: e.date,
        lines: {
          create: e.lines.map((l, i) => ({
            id: id(`ledger-jl-${tenantId}-${e.entryNumber}-${i}`), tenantId, accountId: accountIds[l.account],
            debitPaise: l.debit, creditPaise: l.credit, description: l.description,
          })),
        },
      },
    });
    counts.entries++;
    counts.lines += e.lines.length;
  }
  return counts;
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
      const c = await seedTenant(prisma, t.id);
      console.warn(`ledger seed [${t.slug}]: +${c.accounts} accounts, +${c.entries} entries, +${c.lines} lines, ${c.skipped} skipped (already present)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('Demo ledger seed failed:', e); process.exit(1); });
}
