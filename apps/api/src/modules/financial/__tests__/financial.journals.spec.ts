import { describe, it, expect, beforeEach } from 'vitest';
import { FinancialService } from '../financial.service';
import { createMockPrismaService, TEST_TENANT_ID, TEST_USER_ID, resetAllMocks } from '../../../__tests__/setup';

type Acc = { id: string; accountCode: string; name: string; accountType: string };
const CHART: Acc[] = [
  { id: 'a-cash', accountCode: '1000', name: 'Cash / Bank', accountType: 'ASSET' },
  { id: 'a-ar', accountCode: '1200', name: 'Accounts Receivable', accountType: 'ASSET' },
  { id: 'a-inv', accountCode: '1400', name: 'Inventory', accountType: 'ASSET' },
  { id: 'a-gstin', accountCode: '1500', name: 'GST Input Credit', accountType: 'ASSET' },
  { id: 'a-ap', accountCode: '2000', name: 'Accounts Payable', accountType: 'LIABILITY' },
  { id: 'a-gstout', accountCode: '2100', name: 'GST Output Payable', accountType: 'LIABILITY' },
  { id: 'a-rev', accountCode: '4000', name: 'Sales Revenue', accountType: 'REVENUE' },
];

function sums(call: any) {
  const lines = call.data.lines.create as Array<{ accountId: string; debitPaise: bigint; creditPaise: bigint }>;
  const d = lines.reduce((s, l) => s + l.debitPaise, 0n);
  const c = lines.reduce((s, l) => s + l.creditPaise, 0n);
  return { lines, d, c };
}

describe('Financial journals post to the right ledger accounts', () => {
  let service: FinancialService;
  let p: ReturnType<typeof createMockPrismaService>;
  let chart: Acc[];

  beforeEach(() => {
    p = createMockPrismaService();
    resetAllMocks(p);
    chart = [...CHART];
    service = new FinancialService(p as any);
    p.journalEntry.count.mockResolvedValue(0);
    p.journalEntry.findFirst.mockResolvedValue(null);
    p.journalEntry.create.mockImplementation(async (a: any) => ({ id: 'je-1', ...a.data }));
    p.payment.count.mockResolvedValue(0);
    p.payment.create.mockResolvedValue({ id: 'pay-1', status: 'COMPLETED', customer: null, supplier: null, invoice: null });
    p.account.findFirst.mockImplementation(async ({ where }: any) => {
      return (
        chart.find(
          (a) =>
            (where.accountCode === undefined || a.accountCode === where.accountCode) &&
            (where.accountType === undefined || a.accountType === where.accountType) &&
            (where.name === undefined || a.name === where.name) &&
            !(where.id?.notIn ?? []).includes(a.id),
        ) ?? null
      );
    });
  });

  it('customer receipt: Dr Cash/Bank, Cr Accounts Receivable (different accounts)', async () => {
    await service.recordPayment(TEST_TENANT_ID, TEST_USER_ID, { paymentType: 'RECEIVED', method: 'UPI', amountPaise: 2500000 } as any);
    const { lines, d, c } = sums(p.journalEntry.create.mock.calls[0][0]);
    expect(lines[0]).toMatchObject({ accountId: 'a-cash', debitPaise: 2500000n, creditPaise: 0n });
    expect(lines[1]).toMatchObject({ accountId: 'a-ar', debitPaise: 0n, creditPaise: 2500000n });
    expect(lines[0].accountId).not.toBe(lines[1].accountId);
    expect(d).toBe(c);
  });

  it('supplier payment: Dr Accounts Payable, Cr Cash/Bank', async () => {
    await service.recordPayment(TEST_TENANT_ID, TEST_USER_ID, { paymentType: 'MADE', method: 'CASH', amountPaise: 700000 } as any);
    const { lines, d, c } = sums(p.journalEntry.create.mock.calls[0][0]);
    expect(lines[0]).toMatchObject({ accountId: 'a-cash', debitPaise: 0n, creditPaise: 700000n });
    expect(lines[1]).toMatchObject({ accountId: 'a-ap', debitPaise: 700000n, creditPaise: 0n });
    expect(d).toBe(c);
  });

  it('uses the ledger account of the given bank account for the cash leg', async () => {
    p.bankAccount.findFirst.mockResolvedValue({ accountId: 'a-hdfc' });
    await service.recordPayment(TEST_TENANT_ID, TEST_USER_ID, {
      paymentType: 'RECEIVED', method: 'BANK_TRANSFER', amountPaise: 100, bankAccountId: 'b-1',
    } as any);
    const { lines } = sums(p.journalEntry.create.mock.calls[0][0]);
    expect(lines[0].accountId).toBe('a-hdfc');
    expect(lines[1].accountId).toBe('a-ar');
  });

  it('never resolves both legs to the same account when the chart has only one asset account', async () => {
    chart = [CHART[0]]; // only Cash/Bank exists; AR must be provisioned separately
    p.account.create.mockImplementation(async ({ data }: any) => {
      const a = { id: `new-${data.accountCode}`, ...data };
      chart.push(a);
      return a;
    });
    await service.recordPayment(TEST_TENANT_ID, TEST_USER_ID, { paymentType: 'RECEIVED', method: 'UPI', amountPaise: 500 } as any);
    const { lines } = sums(p.journalEntry.create.mock.calls[0][0]);
    expect(lines[0].accountId).toBe('a-cash');
    expect(lines[1].accountId).toBe('new-1200');
  });

  it('fails clearly when ledger accounts cannot be set up', async () => {
    chart = [];
    p.account.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.recordPayment(TEST_TENANT_ID, TEST_USER_ID, { paymentType: 'RECEIVED', method: 'UPI', amountPaise: 500 } as any),
    ).rejects.toThrow(/not set up/);
    expect(p.journalEntry.create).not.toHaveBeenCalled();
  });

  const draft = (over: Record<string, unknown>) => ({
    id: 'inv-1', tenantId: TEST_TENANT_ID, status: 'DRAFT', invoiceNumber: 'INV-1',
    invoiceType: 'SALES', totalPaise: 10300n, taxPaise: 300n, ...over,
  });

  it('issuing a sales invoice: Dr AR total, Cr Revenue net, Cr GST Output tax', async () => {
    p.invoice.findFirst.mockResolvedValue(draft({}));
    p.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'SENT' });
    await service.updateInvoiceStatus(TEST_TENANT_ID, TEST_USER_ID, 'inv-1', 'SENT');
    const { lines, d, c } = sums(p.journalEntry.create.mock.calls[0][0]);
    expect(lines.map((l) => [l.accountId, l.debitPaise, l.creditPaise])).toEqual([
      ['a-ar', 10300n, 0n],
      ['a-rev', 0n, 10000n],
      ['a-gstout', 0n, 300n],
    ]);
    expect(d).toBe(c);
  });

  it('issuing a purchase invoice: Dr Inventory, Dr GST Input, Cr AP', async () => {
    p.invoice.findFirst.mockResolvedValue(draft({ invoiceType: 'PURCHASE' }));
    p.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'SENT' });
    await service.updateInvoiceStatus(TEST_TENANT_ID, TEST_USER_ID, 'inv-1', 'SENT');
    const { lines, d, c } = sums(p.journalEntry.create.mock.calls[0][0]);
    expect(lines.map((l) => [l.accountId, l.debitPaise, l.creditPaise])).toEqual([
      ['a-inv', 10000n, 0n],
      ['a-gstin', 300n, 0n],
      ['a-ap', 0n, 10300n],
    ]);
    expect(d).toBe(c);
  });

  it('does not double-post when the invoice journal already exists', async () => {
    p.invoice.findFirst.mockResolvedValue(draft({}));
    p.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'SENT' });
    p.journalEntry.findFirst.mockResolvedValue({ id: 'je-existing' });
    await service.updateInvoiceStatus(TEST_TENANT_ID, TEST_USER_ID, 'inv-1', 'SENT');
    expect(p.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects disallowed transitions and leaves the invoice untouched', async () => {
    p.invoice.findFirst.mockResolvedValue(draft({ status: 'CANCELLED' }));
    await expect(service.updateInvoiceStatus(TEST_TENANT_ID, TEST_USER_ID, 'inv-1', 'SENT')).rejects.toThrow(/Cannot change invoice/);
    expect(p.invoice.update).not.toHaveBeenCalled();
  });

  it('cancelling a DRAFT does not post a journal', async () => {
    p.invoice.findFirst.mockResolvedValue(draft({}));
    p.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'CANCELLED' });
    await service.updateInvoiceStatus(TEST_TENANT_ID, TEST_USER_ID, 'inv-1', 'CANCELLED');
    expect(p.journalEntry.create).not.toHaveBeenCalled();
  });
});
