import { describe, it, expect } from 'vitest';
import {
  planInvoiceEntries,
  planSaleEntries,
  planLedger,
  isBalanced,
} from '../../../../../../packages/db/src/seed-demo-ledger';

const d = new Date('2026-11-01T00:00:00Z');

describe('demo ledger planner', () => {
  it('posts balanced invoice entries incl. receipt for the paid portion', () => {
    const entries = planInvoiceEntries({ number: 'INV-1', date: d, totalPaise: 10300n, taxPaise: 300n, paidPaise: 4000n });
    expect(entries.map((e) => e.entryNumber)).toEqual(['DEMO-INV-INV-1', 'DEMO-COGS-INV-INV-1', 'DEMO-RCPT-INV-1']);
    expect(entries.every(isBalanced)).toBe(true);
    const ar = entries[0].lines.find((l) => l.account === '1200');
    expect(ar?.debit).toBe(10300n);
  });
  it('posts balanced POS sale entries and skips zero-tax line', () => {
    const entries = planSaleEntries({ number: 'S-1', date: d, totalPaise: 5000n, taxPaise: 0n });
    expect(entries.every(isBalanced)).toBe(true);
    expect(entries[0].lines.some((l) => l.account === '2100')).toBe(false);
  });
  it('plans an opening entry and is deterministic (idempotent keys)', () => {
    const inv = [{ number: 'A', date: d, totalPaise: 1030n, taxPaise: 30n }];
    const a = planLedger(inv, []);
    const b = planLedger(inv, []);
    expect(a.map((e) => e.entryNumber)).toEqual(b.map((e) => e.entryNumber));
    expect(a[0].entryNumber).toBe('DEMO-OPENING');
    expect(a.every(isBalanced)).toBe(true);
    expect(planLedger([], [])).toEqual([]);
  });
});

import { pickBomId } from '../../../../../../packages/db/src/seed-demo-job-boms';

describe('demo job-bom backfill', () => {
  const boms = [{ id: 'b1', productId: 'p1' }, { id: 'b2', productId: 'p2' }];
  it('prefers the BOM of the same product, else cycles', () => {
    expect(pickBomId({ productId: 'p2' }, boms, 0)).toBe('b2');
    expect(pickBomId({ productId: 'zz' }, boms, 3)).toBe('b2');
    expect(pickBomId({ productId: 'p1' }, [], 0)).toBeNull();
  });
});
