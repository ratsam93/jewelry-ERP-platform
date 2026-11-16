import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { FinancialTrpcRouter } from '../financial.trpc';

describe('FinancialTrpcRouter (procedure coverage)', () => {
  const trpc = new TrpcService();

  const financialService = {
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    createJournalEntry: vi.fn(),
    postJournalEntry: vi.fn(),
    voidJournalEntry: vi.fn(),
    getJournalEntry: vi.fn(),
    listJournalEntries: vi.fn(),
    createInvoice: vi.fn(),
    updateInvoiceStatus: vi.fn(),
    getInvoice: vi.fn(),
    listInvoices: vi.fn(),
    generateInvoicePdf: vi.fn(),
    recordPayment: vi.fn(),
    recordCollection: vi.fn(),
    getPayment: vi.fn(),
    listPayments: vi.fn(),
    listOutstandingForAgent: vi.fn(),
    getLedger: vi.fn(),
    getAccountBalance: vi.fn(),
  };
  const taxService = {
    computeGst: vi.fn(),
    generateGstr1Data: vi.fn(),
    generateGstr3bData: vi.fn(),
    getTaxLiability: vi.fn(),
  };
  const reportingService = {
    getDashboard: vi.fn(),
    profitAndLoss: vi.fn(),
    balanceSheet: vi.fn(),
    trialBalance: vi.fn(),
    cashFlow: vi.fn(),
    agingReport: vi.fn(),
    dayBook: vi.fn(),
  };
  const bankService = {
    createBankAccount: vi.fn(),
    listBankAccounts: vi.fn(),
    getBankAccount: vi.fn(),
    importStatement: vi.fn(),
    autoReconcile: vi.fn(),
    manualReconcile: vi.fn(),
    listBankTransactions: vi.fn(),
  };
  const einvoiceService = {
    submitToIrp: vi.fn(),
    cancelEInvoice: vi.fn(),
    getEInvoiceStatus: vi.fn(),
    prepareInvoicePayload: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'accountant',
    userPermissions: ['*'],
  };

  const routerInstance = new FinancialTrpcRouter(
    trpc,
    financialService as never,
    taxService as never,
    reportingService as never,
    bankService as never,
    einvoiceService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
  const ACCOUNT_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const ACCOUNT_ID_2 = '3f1e2d4c-5b6a-4789-9abc-def012345679';
  const CUSTOMER_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const ENTRY_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const INVOICE_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
  const PAYMENT_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
  const AGENT_ID = '3e4f5a6b-7c8d-4e9f-9a0b-2c3d4e5f6a7b';
  const COST_CENTER_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';
  const LOCATION_ID = '5a6b7c8d-9e0f-4a1b-9c2d-4e5f6a7b8c9d';
  const BANK_ACCOUNT_ID = '6b7c8d9e-0f1a-4b2c-8d3e-5f6a7b8c9d0e';
  const BANK_TXN_ID = '7c8d9e0f-1a2b-4c3d-9e4f-6a7b8c9d0e1f';
  const MATCH_ID = '8d9e0f1a-2b3c-4d4e-8f5a-7b8c9d0e1f2a';
  const SUPPLIER_ID = '9e0f1a2b-3c4d-4e5f-9a6b-8c9d0e1f2a3b';

  const journalInput = {
    date: '2026-11-01',
    description: 'Gold sale',
    reference: 'INV-1',
    lines: [
      { accountId: ACCOUNT_ID, debitPaise: 100000 },
      { accountId: ACCOUNT_ID_2, creditPaise: 100000 },
    ],
  };

  const dateRange = { from: '2026-04-01', to: '2027-03-31' };
  const dateRangeParsed = { from: new Date('2026-04-01'), to: new Date('2027-03-31') };

  // ─── Dashboard ─────────────────────────────────────────
  describe('dashboard', () => {
    it('delegates to reportingService.getDashboard', async () => {
      reportingService.getDashboard.mockResolvedValue({ totalRevenue: 0 });
      const result = await caller.dashboard();
      expect(reportingService.getDashboard).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ totalRevenue: 0 });
    });
  });

  // ─── Accounts ──────────────────────────────────────────
  describe('accounts.list', () => {
    it('passes filters to listAccounts', async () => {
      financialService.listAccounts.mockResolvedValue([{ id: ACCOUNT_ID }]);
      const result = await caller.accounts.list({ type: 'ASSET', search: 'cash', includeInactive: false });
      expect(financialService.listAccounts).toHaveBeenCalledWith('tenant-1', {
        type: 'ASSET',
        search: 'cash',
        includeInactive: false,
      });
      expect(result).toEqual([{ id: ACCOUNT_ID }]);
    });

    it('defaults to an empty filter object when no input is given', async () => {
      financialService.listAccounts.mockResolvedValue([]);
      await caller.accounts.list();
      expect(financialService.listAccounts).toHaveBeenCalledWith('tenant-1', {});
    });

    it('rejects an unknown account type', async () => {
      await expect(caller.accounts.list({ type: 'BOGUS' as never })).rejects.toThrow();
    });
  });

  describe('accounts.create', () => {
    it('trims and forwards the account to createAccount', async () => {
      financialService.createAccount.mockResolvedValue({ id: ACCOUNT_ID });
      const result = await caller.accounts.create({
        code: ' 1100 ',
        name: ' Cash in hand ',
        type: 'ASSET',
      });
      expect(financialService.createAccount).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ code: '1100', name: 'Cash in hand', type: 'ASSET' }),
      );
      expect(result).toEqual({ id: ACCOUNT_ID });
    });

    it('rejects an empty account name', async () => {
      await expect(
        caller.accounts.create({ code: '1100', name: '   ', type: 'ASSET' }),
      ).rejects.toThrow();
    });
  });

  // ─── Journal ───────────────────────────────────────────
  describe('journal.create', () => {
    it('applies line defaults and forwards to createJournalEntry', async () => {
      financialService.createJournalEntry.mockResolvedValue({ id: ENTRY_ID });
      const result = await caller.journal.create(journalInput);
      expect(financialService.createJournalEntry).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          description: 'Gold sale',
          lines: [
            expect.objectContaining({ accountId: ACCOUNT_ID, debitPaise: 100000, creditPaise: 0, currencyCode: 'INR' }),
            expect.objectContaining({ accountId: ACCOUNT_ID_2, debitPaise: 0, creditPaise: 100000 }),
          ],
        }),
      );
      expect(result).toEqual({ id: ENTRY_ID });
    });

    it('rejects unbalanced entries', async () => {
      await expect(
        caller.journal.create({
          ...journalInput,
          lines: [
            { accountId: ACCOUNT_ID, debitPaise: 100 },
            { accountId: ACCOUNT_ID_2, creditPaise: 50 },
          ],
        }),
      ).rejects.toThrow();
    });
  });

  describe('journal.post', () => {
    it('posts the entry by id', async () => {
      financialService.postJournalEntry.mockResolvedValue({ status: 'POSTED' });
      const result = await caller.journal.post({ id: ENTRY_ID });
      expect(financialService.postJournalEntry).toHaveBeenCalledWith('tenant-1', 'user-1', ENTRY_ID);
      expect(result).toEqual({ status: 'POSTED' });
    });

    it('rejects a non-uuid id', async () => {
      await expect(caller.journal.post({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  describe('journal.void', () => {
    it('voids the entry with a reason', async () => {
      financialService.voidJournalEntry.mockResolvedValue({ status: 'VOIDED' });
      const result = await caller.journal.void({ id: ENTRY_ID, reason: 'Duplicate' });
      expect(financialService.voidJournalEntry).toHaveBeenCalledWith('tenant-1', 'user-1', ENTRY_ID, 'Duplicate');
      expect(result).toEqual({ status: 'VOIDED' });
    });

    it('rejects an empty reason', async () => {
      await expect(caller.journal.void({ id: ENTRY_ID, reason: '' })).rejects.toThrow();
    });
  });

  describe('journal.getById', () => {
    it('fetches the entry for the tenant', async () => {
      financialService.getJournalEntry.mockResolvedValue({ id: ENTRY_ID });
      const result = await caller.journal.getById({ id: ENTRY_ID });
      expect(financialService.getJournalEntry).toHaveBeenCalledWith('tenant-1', ENTRY_ID);
      expect(result).toEqual({ id: ENTRY_ID });
    });
  });

  describe('journal.list', () => {
    it('applies pagination defaults and forwards the filter', async () => {
      financialService.listJournalEntries.mockResolvedValue({ items: [] });
      const result = await caller.journal.list({ status: 'POSTED', dateRange });
      expect(financialService.listJournalEntries).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1, limit: 20, status: 'POSTED', dateRange: dateRangeParsed }),
      );
      expect(result).toEqual({ items: [] });
    });
  });

  // ─── Invoices ──────────────────────────────────────────
  describe('invoices.create', () => {
    it('applies line defaults and forwards to createInvoice', async () => {
      financialService.createInvoice.mockResolvedValue({ id: INVOICE_ID });
      const result = await caller.invoices.create({
        invoiceType: 'SALES',
        customerId: CUSTOMER_ID,
        locationId: LOCATION_ID,
        sourceState: 'MH',
        destState: 'KA',
        lineItems: [{ description: 'Gold chain', unitPricePaise: 500000 }],
      });
      expect(financialService.createInvoice).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          invoiceType: 'SALES',
          currencyCode: 'INR',
          lineItems: [
            expect.objectContaining({ quantity: 1, discountPaise: 0, hsnCode: '7113', gstRate: 300 }),
          ],
        }),
      );
      expect(result).toEqual({ id: INVOICE_ID });
    });

    it('rejects an invoice without line items', async () => {
      await expect(
        caller.invoices.create({
          invoiceType: 'SALES',
          locationId: LOCATION_ID,
          sourceState: 'MH',
          destState: 'MH',
          lineItems: [],
        }),
      ).rejects.toThrow();
    });
  });

  describe('invoices.updateStatus', () => {
    it('updates the invoice status', async () => {
      financialService.updateInvoiceStatus.mockResolvedValue({ status: 'SENT' });
      const result = await caller.invoices.updateStatus({ id: INVOICE_ID, status: 'SENT' });
      expect(financialService.updateInvoiceStatus).toHaveBeenCalledWith('tenant-1', 'user-1', INVOICE_ID, 'SENT');
      expect(result).toEqual({ status: 'SENT' });
    });

    it('rejects a status that cannot be set manually', async () => {
      await expect(
        caller.invoices.updateStatus({ id: INVOICE_ID, status: 'PAID' as never }),
      ).rejects.toThrow();
    });
  });

  describe('invoices.getById', () => {
    it('fetches the invoice', async () => {
      financialService.getInvoice.mockResolvedValue({ id: INVOICE_ID });
      const result = await caller.invoices.getById({ id: INVOICE_ID });
      expect(financialService.getInvoice).toHaveBeenCalledWith('tenant-1', INVOICE_ID);
      expect(result).toEqual({ id: INVOICE_ID });
    });
  });

  describe('invoices.list', () => {
    it('forwards filters with pagination defaults', async () => {
      financialService.listInvoices.mockResolvedValue({ items: [] });
      await caller.invoices.list({ invoiceType: 'PURCHASE', supplierId: SUPPLIER_ID, search: 'INV' });
      expect(financialService.listInvoices).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1, limit: 20, invoiceType: 'PURCHASE', supplierId: SUPPLIER_ID, search: 'INV' }),
      );
    });
  });

  describe('invoices.downloadPdf', () => {
    it('returns the PDF as base64 with metadata', async () => {
      const pdf = Buffer.from('%PDF-1.4 test');
      financialService.generateInvoicePdf.mockResolvedValue(pdf);
      const result = await caller.invoices.downloadPdf({ invoiceId: INVOICE_ID });
      expect(financialService.generateInvoicePdf).toHaveBeenCalledWith('tenant-1', INVOICE_ID);
      expect(result).toEqual({
        filename: `invoice-${INVOICE_ID}.pdf`,
        mimeType: 'application/pdf',
        base64: pdf.toString('base64'),
        size: pdf.length,
      });
    });
  });

  // ─── Payments ──────────────────────────────────────────
  describe('payments.record', () => {
    it('records the payment with currency default', async () => {
      financialService.recordPayment.mockResolvedValue({ id: PAYMENT_ID });
      const result = await caller.payments.record({
        paymentType: 'RECEIVED',
        method: 'UPI',
        amountPaise: 25000,
        customerId: CUSTOMER_ID,
      });
      expect(financialService.recordPayment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ amountPaise: 25000, currencyCode: 'INR', method: 'UPI' }),
      );
      expect(result).toEqual({ id: PAYMENT_ID });
    });

    it('rejects a zero amount', async () => {
      await expect(
        caller.payments.record({ paymentType: 'RECEIVED', method: 'CASH', amountPaise: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('payments.recordCollection', () => {
    it('forwards the agent collection', async () => {
      financialService.recordCollection.mockResolvedValue({ id: PAYMENT_ID });
      const input = {
        customerId: CUSTOMER_ID,
        amountPaise: 100000,
        method: 'CASH' as const,
        agentId: AGENT_ID,
        notes: 'Weekly collection',
      };
      const result = await caller.payments.recordCollection(input);
      expect(financialService.recordCollection).toHaveBeenCalledWith('tenant-1', 'user-1', input);
      expect(result).toEqual({ id: PAYMENT_ID });
    });

    it('rejects a non-positive collection amount', async () => {
      await expect(
        caller.payments.recordCollection({
          customerId: CUSTOMER_ID,
          amountPaise: -5,
          method: 'CASH',
          agentId: AGENT_ID,
        }),
      ).rejects.toThrow();
    });
  });

  describe('payments.getById', () => {
    it('fetches the payment', async () => {
      financialService.getPayment.mockResolvedValue({ id: PAYMENT_ID });
      const result = await caller.payments.getById({ id: PAYMENT_ID });
      expect(financialService.getPayment).toHaveBeenCalledWith('tenant-1', PAYMENT_ID);
      expect(result).toEqual({ id: PAYMENT_ID });
    });
  });

  describe('payments.list', () => {
    it('forwards filters with defaults', async () => {
      financialService.listPayments.mockResolvedValue({ items: [] });
      await caller.payments.list({ paymentType: 'MADE', status: 'COMPLETED' });
      expect(financialService.listPayments).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1, limit: 20, paymentType: 'MADE', status: 'COMPLETED' }),
      );
    });
  });

  // ─── Outstanding balances ──────────────────────────────
  describe('outstandingBalances.list', () => {
    it('lists outstanding balances for the agent with default paging', async () => {
      financialService.listOutstandingForAgent.mockResolvedValue({ items: [] });
      const result = await caller.outstandingBalances.list({ agentId: AGENT_ID });
      expect(financialService.listOutstandingForAgent).toHaveBeenCalledWith(
        'tenant-1',
        AGENT_ID,
        { page: 1, limit: 50 },
      );
      expect(result).toEqual({ items: [] });
    });

    it('rejects a page size above 100', async () => {
      await expect(
        caller.outstandingBalances.list({ agentId: AGENT_ID, limit: 101 }),
      ).rejects.toThrow();
    });
  });

  // ─── Tax ───────────────────────────────────────────────
  describe('tax.computeGst', () => {
    it('computes GST using the default HSN and rate', async () => {
      taxService.computeGst.mockReturnValue({ totalTaxPaise: 3000 });
      const result = await caller.tax.computeGst({
        taxableAmountPaise: 100000,
        sourceState: 'MH',
        destState: 'MH',
      });
      expect(taxService.computeGst).toHaveBeenCalledWith({
        taxableAmountPaise: 100000,
        hsnCode: '7113',
        gstRate: 300,
        sourceState: 'MH',
        destState: 'MH',
      });
      expect(result).toEqual({ totalTaxPaise: 3000 });
    });

    it('rejects a negative taxable amount', async () => {
      await expect(
        caller.tax.computeGst({ taxableAmountPaise: -1, sourceState: 'MH', destState: 'KA' }),
      ).rejects.toThrow();
    });
  });

  describe('tax.gstr1', () => {
    it('generates GSTR-1 data for the period', async () => {
      taxService.generateGstr1Data.mockResolvedValue({ period: '2026-04' });
      const result = await caller.tax.gstr1({ period: { month: 4, year: 2026 } });
      expect(taxService.generateGstr1Data).toHaveBeenCalledWith('tenant-1', { period: { month: 4, year: 2026 } });
      expect(result).toEqual({ period: '2026-04' });
    });

    it('rejects an out-of-range month', async () => {
      await expect(caller.tax.gstr1({ period: { month: 13, year: 2026 } })).rejects.toThrow();
    });
  });

  describe('tax.gstr3b', () => {
    it('generates GSTR-3B data for the period', async () => {
      taxService.generateGstr3bData.mockResolvedValue({ period: '2026-04' });
      const result = await caller.tax.gstr3b({ period: { month: 4, year: 2026 } });
      expect(taxService.generateGstr3bData).toHaveBeenCalledWith('tenant-1', { period: { month: 4, year: 2026 } });
      expect(result).toEqual({ period: '2026-04' });
    });
  });

  describe('tax.liability', () => {
    it('returns the tax liability for the period', async () => {
      taxService.getTaxLiability.mockResolvedValue({ payable: 0 });
      const result = await caller.tax.liability({ period: { month: 3, year: 2027 } });
      expect(taxService.getTaxLiability).toHaveBeenCalledWith('tenant-1', { month: 3, year: 2027 });
      expect(result).toEqual({ payable: 0 });
    });
  });

  // ─── Reports ───────────────────────────────────────────
  describe('reports.profitAndLoss', () => {
    it('forwards the date range and optional cost center', async () => {
      reportingService.profitAndLoss.mockResolvedValue({ netProfit: 1 });
      const result = await caller.reports.profitAndLoss({ dateRange, costCenterId: COST_CENTER_ID });
      expect(reportingService.profitAndLoss).toHaveBeenCalledWith('tenant-1', dateRangeParsed, COST_CENTER_ID);
      expect(result).toEqual({ netProfit: 1 });
    });

    it('rejects a date range missing its end', async () => {
      await expect(
        caller.reports.profitAndLoss({ dateRange: { from: '2026-04-01' } as never }),
      ).rejects.toThrow();
    });
  });

  describe('reports.balanceSheet', () => {
    it('coerces asOfDate and returns the sheet', async () => {
      reportingService.balanceSheet.mockResolvedValue({ totalAssets: 5 });
      const result = await caller.reports.balanceSheet({ asOfDate: '2026-03-31' });
      expect(reportingService.balanceSheet).toHaveBeenCalledWith('tenant-1', new Date('2026-03-31'));
      expect(result).toEqual({ totalAssets: 5 });
    });
  });

  describe('reports.trialBalance', () => {
    it('forwards the date range', async () => {
      reportingService.trialBalance.mockResolvedValue({ totalDebits: 0 });
      const result = await caller.reports.trialBalance({ dateRange });
      expect(reportingService.trialBalance).toHaveBeenCalledWith('tenant-1', dateRangeParsed);
      expect(result).toEqual({ totalDebits: 0 });
    });
  });

  describe('reports.cashFlow', () => {
    it('forwards the date range', async () => {
      reportingService.cashFlow.mockResolvedValue({ netCashFlow: 0 });
      const result = await caller.reports.cashFlow({ dateRange });
      expect(reportingService.cashFlow).toHaveBeenCalledWith('tenant-1', dateRangeParsed);
      expect(result).toEqual({ netCashFlow: 0 });
    });
  });

  describe('reports.aging', () => {
    it('produces the receivables aging report', async () => {
      reportingService.agingReport.mockResolvedValue({ type: 'AR' });
      const result = await caller.reports.aging({ type: 'AR' });
      expect(reportingService.agingReport).toHaveBeenCalledWith('tenant-1', 'AR');
      expect(result).toEqual({ type: 'AR' });
    });

    it('rejects an unknown aging type', async () => {
      await expect(caller.reports.aging({ type: 'XX' as never })).rejects.toThrow();
    });
  });

  describe('reports.dayBook', () => {
    it('coerces the date and returns the day book', async () => {
      reportingService.dayBook.mockResolvedValue({ entries: [] });
      const result = await caller.reports.dayBook({ date: '2026-11-01' });
      expect(reportingService.dayBook).toHaveBeenCalledWith('tenant-1', new Date('2026-11-01'));
      expect(result).toEqual({ entries: [] });
    });
  });

  // ─── Bank ──────────────────────────────────────────────
  describe('bank.createAccount', () => {
    it('creates the bank account', async () => {
      bankService.createBankAccount.mockResolvedValue({ id: BANK_ACCOUNT_ID });
      const result = await caller.bank.createAccount({
        accountId: ACCOUNT_ID,
        bankName: 'HDFC',
        accountNumber: '50100000000001',
        ifscCode: 'HDFC0000001',
      });
      expect(bankService.createBankAccount).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ bankName: 'HDFC', currencyCode: 'INR', isDefault: false }),
      );
      expect(result).toEqual({ id: BANK_ACCOUNT_ID });
    });
  });

  describe('bank.listAccounts', () => {
    it('lists bank accounts for the tenant', async () => {
      bankService.listBankAccounts.mockResolvedValue([]);
      const result = await caller.bank.listAccounts();
      expect(bankService.listBankAccounts).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([]);
    });
  });

  describe('bank.getAccount', () => {
    it('fetches a bank account', async () => {
      bankService.getBankAccount.mockResolvedValue({ id: BANK_ACCOUNT_ID });
      const result = await caller.bank.getAccount({ id: BANK_ACCOUNT_ID });
      expect(bankService.getBankAccount).toHaveBeenCalledWith('tenant-1', BANK_ACCOUNT_ID);
      expect(result).toEqual({ id: BANK_ACCOUNT_ID });
    });
  });

  describe('bank.importStatement', () => {
    it('imports the statement transactions', async () => {
      bankService.importStatement.mockResolvedValue({ imported: 1 });
      const result = await caller.bank.importStatement({
        bankAccountId: BANK_ACCOUNT_ID,
        transactions: [
          { transactionDate: '2026-11-01', description: 'NEFT credit', creditPaise: 5000 },
        ],
      });
      expect(bankService.importStatement).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          bankAccountId: BANK_ACCOUNT_ID,
          transactions: [expect.objectContaining({ creditPaise: 5000, debitPaise: 0 })],
        }),
      );
      expect(result).toEqual({ imported: 1 });
    });

    it('rejects a statement with no transactions', async () => {
      await expect(
        caller.bank.importStatement({ bankAccountId: BANK_ACCOUNT_ID, transactions: [] }),
      ).rejects.toThrow();
    });
  });

  describe('bank.autoReconcile', () => {
    it('runs auto reconciliation for the account', async () => {
      bankService.autoReconcile.mockResolvedValue({ matched: 2 });
      const result = await caller.bank.autoReconcile({ bankAccountId: BANK_ACCOUNT_ID });
      expect(bankService.autoReconcile).toHaveBeenCalledWith('tenant-1', BANK_ACCOUNT_ID);
      expect(result).toEqual({ matched: 2 });
    });
  });

  describe('bank.manualReconcile', () => {
    it('matches a bank transaction manually', async () => {
      bankService.manualReconcile.mockResolvedValue({ reconciled: true });
      const result = await caller.bank.manualReconcile({
        bankTransactionId: BANK_TXN_ID,
        matchWithId: MATCH_ID,
      });
      expect(bankService.manualReconcile).toHaveBeenCalledWith('tenant-1', {
        bankTransactionId: BANK_TXN_ID,
        matchWithId: MATCH_ID,
      });
      expect(result).toEqual({ reconciled: true });
    });
  });

  describe('bank.listTransactions', () => {
    it('lists transactions with paging defaults', async () => {
      bankService.listBankTransactions.mockResolvedValue({ items: [] });
      const result = await caller.bank.listTransactions({
        bankAccountId: BANK_ACCOUNT_ID,
        isReconciled: false,
      });
      expect(bankService.listBankTransactions).toHaveBeenCalledWith(
        'tenant-1',
        BANK_ACCOUNT_ID,
        expect.objectContaining({ page: 1, limit: 20, isReconciled: false }),
      );
      expect(result).toEqual({ items: [] });
    });
  });

  // ─── E-Invoice ─────────────────────────────────────────
  describe('einvoice.submit', () => {
    it('submits the invoice to IRP', async () => {
      einvoiceService.submitToIrp.mockResolvedValue({ status: 'ACT' });
      const result = await caller.einvoice.submit({ invoiceId: INVOICE_ID });
      expect(einvoiceService.submitToIrp).toHaveBeenCalledWith('tenant-1', INVOICE_ID);
      expect(result).toEqual({ status: 'ACT' });
    });
  });

  describe('einvoice.cancel', () => {
    it('cancels the e-invoice with reason and remarks', async () => {
      einvoiceService.cancelEInvoice.mockResolvedValue({ status: 'CNL' });
      const result = await caller.einvoice.cancel({
        invoiceId: INVOICE_ID,
        reason: '2',
        remarks: 'Wrong buyer',
      });
      expect(einvoiceService.cancelEInvoice).toHaveBeenCalledWith('tenant-1', INVOICE_ID, '2', 'Wrong buyer');
      expect(result).toEqual({ status: 'CNL' });
    });

    it('rejects a cancel reason longer than 10 characters', async () => {
      await expect(
        caller.einvoice.cancel({ invoiceId: INVOICE_ID, reason: '12345678901', remarks: 'x' }),
      ).rejects.toThrow();
    });
  });

  describe('einvoice.status', () => {
    it('returns the IRN status', async () => {
      einvoiceService.getEInvoiceStatus.mockResolvedValue({ status: 'ACT' });
      const result = await caller.einvoice.status({ invoiceId: INVOICE_ID });
      expect(einvoiceService.getEInvoiceStatus).toHaveBeenCalledWith('tenant-1', INVOICE_ID);
      expect(result).toEqual({ status: 'ACT' });
    });
  });

  describe('einvoice.previewPayload', () => {
    it('prepares the NIC payload preview', async () => {
      einvoiceService.prepareInvoicePayload.mockResolvedValue({ Version: '1.1' });
      const result = await caller.einvoice.previewPayload({ invoiceId: INVOICE_ID });
      expect(einvoiceService.prepareInvoicePayload).toHaveBeenCalledWith('tenant-1', INVOICE_ID);
      expect(result).toEqual({ Version: '1.1' });
    });
  });

  // ─── Ledger ────────────────────────────────────────────
  describe('ledger', () => {
    it('returns the ledger for the account and range', async () => {
      financialService.getLedger.mockResolvedValue({ entries: [] });
      const result = await caller.ledger({ accountId: ACCOUNT_ID, dateRange });
      expect(financialService.getLedger).toHaveBeenCalledWith('tenant-1', ACCOUNT_ID, dateRangeParsed);
      expect(result).toEqual({ entries: [] });
    });

    it('rejects a non-uuid account id', async () => {
      await expect(caller.ledger({ accountId: 'x', dateRange })).rejects.toThrow();
    });
  });

  describe('accountBalance', () => {
    it('returns the balance with a date range', async () => {
      financialService.getAccountBalance.mockResolvedValue({ balance: 100 });
      const result = await caller.accountBalance({ accountId: ACCOUNT_ID, dateRange });
      expect(financialService.getAccountBalance).toHaveBeenCalledWith('tenant-1', ACCOUNT_ID, dateRangeParsed);
      expect(result).toEqual({ balance: 100 });
    });

    it('passes undefined range when none is supplied', async () => {
      financialService.getAccountBalance.mockResolvedValue({ balance: 0 });
      await caller.accountBalance({ accountId: ACCOUNT_ID });
      expect(financialService.getAccountBalance).toHaveBeenCalledWith('tenant-1', ACCOUNT_ID, undefined);
    });
  });

  // ─── Authorization negatives ───────────────────────────
  describe('authorization', () => {
    it('rejects unauthenticated callers', async () => {
      const anon = routerInstance.router.createCaller({});
      await expect(anon.dashboard()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    // Mounted under the key the app uses (trpc.router.ts: `financial`) so RBAC
    // sees real `financial.*` procedure paths.
    const mountedAs = (permissions: string[]) =>
      trpc.router({ financial: routerInstance.router }).createCaller({ ...ctx, userPermissions: permissions });

    it('denies write procedures to a read-only financial user', async () => {
      const readOnly = mountedAs(['financial.*.read']);
      await expect(readOnly.financial.journal.post({ id: ENTRY_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(financialService.postJournalEntry).not.toHaveBeenCalled();
    });

    it('allows read procedures to a read-only financial user', async () => {
      reportingService.getDashboard.mockResolvedValue({ totalRevenue: 0 });
      const readOnly = mountedAs(['financial.*.read']);
      await expect(readOnly.financial.dashboard()).resolves.toEqual({ totalRevenue: 0 });
    });

    it('denies a user with no financial permission', async () => {
      const noAccess = mountedAs(['retail.sale.read']);
      await expect(noAccess.financial.dashboard()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
