import { beforeAll, describe, expect, it } from 'vitest';
import type { DemoContext, ModulePlan, Row } from '../../../../../../packages/db/src/demo-full/common';
import { planCustomers, type DemoCustomer } from '../../../../../../packages/db/src/demo-full/plan-crm';
import { FINANCE_COUNTS, planFinance } from '../../../../../../packages/db/src/demo-full/plan-finance';
import { planRetail, type RetailResult } from '../../../../../../packages/db/src/demo-full/plan-retail';
import { makeCtx } from './demo-full.fakedb';

const DAY = 86_400_000;
const big = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

describe('demo-full finance planner', () => {
  let ctx: DemoContext;
  let customers: DemoCustomer[];
  let retail: RetailResult;
  let plan: ModulePlan;
  const rows = (m: string): Row[] => plan.tables.find((t) => t.model === m)?.rows ?? [];
  const n = (v: unknown) => v as bigint;

  beforeAll(async () => {
    ctx = await makeCtx();
    customers = planCustomers(ctx);
    retail = planRetail(ctx, customers);
    plan = planFinance(ctx, customers, retail);
  });

  it('has the intended counts', () => {
    expect(rows('invoice').length).toBe(FINANCE_COUNTS.invoices);
    expect(rows('bankAccount').length).toBe(FINANCE_COUNTS.bankAccounts);
    expect(rows('girviLoan').length).toBe(FINANCE_COUNTS.girviLoans);
    expect(rows('goldSavingsMember').length).toBe(FINANCE_COUNTS.goldSavingsMembers);
    expect(rows('kittyMember').length).toBe(FINANCE_COUNTS.kittyMembers);
    expect(rows('emiPlan').length).toBe(3);
    expect(rows('bnplTransaction').length).toBeLessThanOrEqual(3);
    expect(rows('bnplTransaction').length).toBeGreaterThan(0);
  });

  it('is deterministic with unique ids and numbers', () => {
    expect(JSON.stringify(planFinance(ctx, customers, retail), big)).toBe(JSON.stringify(plan, big));
    for (const t of plan.tables) expect(new Set(t.rows.map((r) => r.id)).size, t.model).toBe(t.rows.length);
    for (const [m, k] of [['invoice', 'invoiceNumber'], ['payment', 'paymentNumber'], ['journalEntry', 'entryNumber'], ['girviLoan', 'loanNumber']] as const) {
      expect(new Set(rows(m).map((r) => r[k])).size, m).toBe(rows(m).length);
    }
  });

  it('balances every journal entry and posts every retail sale', () => {
    const byEntry = new Map<string, { d: bigint; c: bigint }>();
    for (const l of rows('journalEntryLine')) {
      const e = byEntry.get(l.journalEntryId as string) ?? { d: 0n, c: 0n };
      e.d += n(l.debitPaise);
      e.c += n(l.creditPaise);
      byEntry.set(l.journalEntryId as string, e);
    }
    expect(byEntry.size).toBe(rows('journalEntry').length);
    for (const e of byEntry.values()) {
      expect(e.d).toBe(e.c);
      expect(e.d > 0n).toBe(true);
    }
    const refs = new Set(rows('journalEntry').map((e) => e.reference));
    for (const s of retail.sales) expect(refs.has(s.number)).toBe(true);
    expect(rows('journalEntry').every((e) => e.status === 'POSTED')).toBe(true);
  });

  it('invoice totals, lines and tax rows are exact', () => {
    const lines = rows('invoiceLineItem');
    const taxRows = rows('taxTransaction');
    for (const inv of rows('invoice')) {
      const ls = lines.filter((l) => l.invoiceId === inv.id);
      expect(ls.length).toBeGreaterThan(0);
      let sub = 0n, disc = 0n, tax = 0n, tot = 0n;
      for (const l of ls) {
        const taxable = n(l.unitPricePaise) * BigInt(l.quantity as number) - n(l.discountPaise);
        expect(l.taxableAmountPaise).toBe(taxable);
        expect(l.totalPaise).toBe(taxable + n(l.cgstPaise) + n(l.sgstPaise) + n(l.igstPaise));
        const intra = n(l.cgstPaise) > 0n || n(l.sgstPaise) > 0n;
        if (intra) expect(n(l.igstPaise)).toBe(0n);
        else expect(n(l.cgstPaise) + n(l.sgstPaise)).toBe(0n);
        expect(n(l.cgstPaise)).toBe(n(l.sgstPaise));
        sub += n(l.unitPricePaise) * BigInt(l.quantity as number);
        disc += n(l.discountPaise);
        tax += n(l.cgstPaise) + n(l.sgstPaise) + n(l.igstPaise);
        tot += n(l.totalPaise);
      }
      expect(inv.subtotalPaise).toBe(sub);
      expect(inv.discountPaise).toBe(disc);
      expect(inv.taxPaise).toBe(tax);
      expect(inv.totalPaise).toBe(tot);
      const tr = taxRows.filter((t) => t.invoiceId === inv.id).reduce((s, t) => s + n(t.taxAmountPaise), 0n);
      expect(tr).toBe(tax);
    }
    const kinds = new Set(lines.map((l) => l.gstRate));
    expect(kinds.has(300) && kinds.has(500)).toBe(true);
    expect(taxRows.some((t) => t.taxType === 'IGST')).toBe(true);
    expect(taxRows.some((t) => t.taxType === 'CGST')).toBe(true);
  });

  it('covers all statuses and keeps status, paid amount and dates consistent', () => {
    const inv = rows('invoice');
    expect(new Set(inv.map((i) => i.status))).toEqual(new Set(['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']));
    const now = ctx.now.getTime();
    const pays = rows('payment');
    for (const i of inv) {
      const paid = pays.filter((p) => p.invoiceId === i.id).reduce((s, p) => s + n(p.amountPaise), 0n);
      expect(i.paidPaise).toBe(paid);
      const due = (i.dueDate as Date).getTime();
      if (i.status === 'PAID') expect(paid).toBe(n(i.totalPaise));
      if (i.status === 'PARTIALLY_PAID') expect(paid > 0n && paid < n(i.totalPaise)).toBe(true);
      if (['DRAFT', 'CANCELLED', 'SENT', 'OVERDUE'].includes(i.status as string)) expect(paid).toBe(0n);
      if (i.status === 'OVERDUE') expect(due).toBeLessThan(now);
      if (i.status === 'SENT') expect(due).toBeGreaterThanOrEqual(now);
      if (i.status === 'DRAFT' || i.status === 'CANCELLED') expect(i.journalEntryId).toBeNull();
      else expect(i.journalEntryId).toBeTruthy();
    }
  });

  it('payments hit two different ledger accounts', () => {
    const accounts = new Map(rows('account').map((a) => [a.id as string, a.accountCode as string]));
    const lines = rows('journalEntryLine');
    const inv = new Map(rows('invoice').map((i) => [i.id as string, i]));
    expect(rows('payment').length).toBeGreaterThan(8);
    for (const p of rows('payment')) {
      expect(p.status).toBe('COMPLETED');
      const ls = lines.filter((l) => l.journalEntryId === p.journalEntryId);
      expect(ls.length).toBe(2);
      expect(ls[0]!.accountId).not.toBe(ls[1]!.accountId);
      const codeOf = (l: Row) => accounts.get(l.accountId as string);
      const received = p.paymentType === 'RECEIVED';
      expect(inv.get(p.invoiceId as string)!.invoiceType).toBe(received ? 'SALES' : 'PURCHASE');
      const arOrAp = ls.find((l) => codeOf(l) === (received ? '1200' : '2000'));
      expect(arOrAp).toBeDefined();
      expect(n(received ? arOrAp!.creditPaise : arOrAp!.debitPaise)).toBe(n(p.amountPaise));
    }
  });

  it('bank running balances chain and end at the account balance', () => {
    const txns = rows('bankTransaction');
    for (const b of rows('bankAccount')) {
      const ts = txns.filter((t) => t.bankAccountId === b.id);
      let run = 0n;
      for (const t of ts) {
        run += n(t.creditPaise) - n(t.debitPaise);
        expect(t.runningBalancePaise).toBe(run);
        expect(run >= 0n).toBe(true);
      }
      expect(b.currentBalancePaise).toBe(run);
    }
  });

  it('girvi loans follow the appraisal formula and KYC rules', () => {
    const kyc = new Set(customers.filter((c) => c.kyc).map((c) => c.id));
    const loans = rows('girviLoan');
    expect(new Set(loans.map((l) => l.status))).toEqual(new Set(['ACTIVE', 'PARTIALLY_PAID', 'CLOSED']));
    expect(loans.some((l) => l.status === 'ACTIVE' && (l.dueDate as Date).getTime() < ctx.now.getTime())).toBe(true);
    for (const l of loans) {
      expect(kyc.has(l.customerId as string)).toBe(true);
      expect(n(l.loanAmountPaise) <= n(l.appraisedValuePaise)).toBe(true);
      expect(n(l.netWeightMg) <= n(l.grossWeightMg)).toBe(true);
      expect((l.dueDate as Date).getTime()).toBeGreaterThan((l.disbursedDate as Date).getTime());
      const pays = rows('girviPayment').filter((p) => p.girviLoanId === l.id);
      const pr = pays.reduce((s, p) => s + n(p.principalPaise), 0n);
      const it = pays.reduce((s, p) => s + n(p.interestPaise), 0n);
      expect(l.totalPrincipalPaidPaise).toBe(pr);
      expect(l.totalInterestPaidPaise).toBe(it);
      expect(n(l.outstandingPrincipalPaise)).toBe(n(l.loanAmountPaise) - pr);
      const acc = rows('girviInterestAccrual').filter((a) => a.girviLoanId === l.id);
      expect(n(l.outstandingInterestPaise)).toBe(acc.reduce((s, a) => s + n(a.interestPaise), 0n) - it);
      if (l.status === 'CLOSED') {
        expect(n(l.outstandingPrincipalPaise) + n(l.outstandingInterestPaise)).toBe(0n);
        expect(l.closedDate).toBeTruthy();
      }
    }
  });

  it('scheme member totals match their installments; emi schedules sum to the order', () => {
    for (const [mm, im, fk] of [['goldSavingsMember', 'goldSavingsInstallment', 'goldSavingsMemberId'], ['kittyMember', 'kittyInstallment', 'kittyMemberId']] as const) {
      for (const m of rows(mm)) {
        const paid = rows(im).filter((i) => i[fk] === m.id && i.status === 'PAID').reduce((s, i) => s + n(i.amountPaise), 0n);
        expect(m.totalPaidPaise).toBe(paid);
      }
    }
    for (const t of rows('bnplTransaction')) {
      const s = rows('emiSchedule').filter((x) => x.transactionId === t.id);
      expect(s.length).toBe(t.tenure);
      expect(s.reduce((a, x) => a + n(x.principalPaise), 0n)).toBe(n(t.orderAmountPaise));
      expect(s.reduce((a, x) => a + n(x.amountPaise), 0n) + n(t.processingFeePaise)).toBe(n(t.totalPayablePaise));
    }
  });

  it('keeps event dates <= now and within ~120 days', () => {
    const now = ctx.now.getTime();
    const re = /^(createdAt|paidDate|paymentDate|processedAt|disbursedDate|transactionDate|accrualDate|joinedDate|paidAt|approvedAt|closedDate)$/;
    for (const t of plan.tables) {
      for (const r of t.rows) {
        for (const [k, v] of Object.entries(r)) {
          if (v instanceof Date && re.test(k)) {
            expect(v.getTime(), `${t.model}.${k}`).toBeLessThanOrEqual(now);
            expect(now - v.getTime(), `${t.model}.${k}`).toBeLessThan(125 * DAY);
          }
        }
      }
    }
  });
});
