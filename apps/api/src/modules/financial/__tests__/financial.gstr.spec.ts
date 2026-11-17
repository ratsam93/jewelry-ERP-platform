import { describe, it, expect, beforeEach } from 'vitest';
import { FinancialTaxService } from '../financial.tax.service';
import { splitInvoiceGst, isInterStatePlace } from '../financial.gst-split';
import { createMockPrismaService, TEST_TENANT_ID, resetAllMocks } from '../../../__tests__/setup';

// Real shape of the seeded invoices: tax recorded on the invoice only,
// no line items and no tax transactions.
const seeded = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  invoiceNumber: 'FIN-INV-00001',
  invoiceType: 'SALES',
  status: 'PAID',
  subtotalPaise: BigInt(7890500),
  discountPaise: BigInt(0),
  taxPaise: BigInt(236715),
  totalPaise: BigInt(8127215),
  createdAt: new Date('2026-11-16T16:15:43.523Z'),
  customer: { gstinNumber: null, state: 'Maharashtra' },
  supplier: null,
  location: { state: 'Maharashtra' },
  lineItems: [],
  taxTransactions: [],
  ...over,
});

describe('splitInvoiceGst', () => {
  it('derives an intra-state CGST/SGST split from the invoice tax when no breakdown is stored', () => {
    const r = splitInvoiceGst({
      subtotalPaise: BigInt(7890500),
      discountPaise: BigInt(0),
      taxPaise: BigInt(236715),
      partyState: 'Maharashtra',
      locationState: 'maharashtra',
    });
    expect(r.taxableAmountPaise).toBe(7890500);
    expect(r.cgstPaise + r.sgstPaise).toBe(236715);
    expect(r.cgstPaise).toBe(118358);
    expect(r.sgstPaise).toBe(118357);
    expect(r.igstPaise).toBe(0);
    expect(r.source).toBe('derived');
  });

  it('derives IGST when the party state differs from the location state', () => {
    const r = splitInvoiceGst({
      subtotalPaise: 100000,
      discountPaise: 0,
      taxPaise: 3000,
      partyState: 'Gujarat',
      locationState: 'Maharashtra',
    });
    expect(r).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 3000 });
  });

  it('prefers stored tax transactions, then stored line amounts', () => {
    const tx = splitInvoiceGst({
      subtotalPaise: 95000,
      discountPaise: 0,
      taxPaise: 2950,
      taxTransactions: [
        { taxType: 'CGST', taxAmountPaise: BigInt(1475) },
        { taxType: 'SGST', taxAmountPaise: BigInt(1475) },
      ],
    });
    expect(tx).toMatchObject({ cgstPaise: 1475, sgstPaise: 1475, igstPaise: 0, source: 'transactions' });

    const lines = splitInvoiceGst({
      subtotalPaise: 95000,
      discountPaise: 0,
      taxPaise: 2950,
      lineItems: [{ cgstPaise: 1000, sgstPaise: 1000, igstPaise: 0 }, { cgstPaise: 475, sgstPaise: 475, igstPaise: 0 }],
    });
    expect(lines).toMatchObject({ cgstPaise: 1475, sgstPaise: 1475, source: 'lines' });
  });

  it('returns zero split for a zero-tax invoice and treats unknown states as intra-state', () => {
    expect(splitInvoiceGst({ subtotalPaise: 100, discountPaise: 0, taxPaise: 0 }).cgstPaise).toBe(0);
    expect(isInterStatePlace(null, 'MH')).toBe(false);
    expect(isInterStatePlace('GJ', 'MH')).toBe(true);
  });
});

describe('FinancialTaxService GSTR reports', () => {
  let service: FinancialTaxService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new FinancialTaxService(mockPrisma as any);
    resetAllMocks(mockPrisma);
  });

  it('GSTR-1 reports a non-zero CGST/SGST split for invoices without stored tax breakdown', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([seeded()]);
    const r = await service.generateGstr1Data(TEST_TENANT_ID, { period: { month: 11, year: 2026 } });
    expect(r.b2c).toHaveLength(1);
    expect(r.b2c[0]!.cgstPaise + r.b2c[0]!.sgstPaise).toBe(236715);
    expect(r.totalCgst + r.totalSgst).toBe(236715);
    expect(r.totalTaxableAmount).toBe(7890500);
    expect(r.hsnSummary[0]!.hsnCode).toBe('7113');
    expect(r.hsnSummary[0]!.totalTaxPaise).toBe(236715);
  });

  it('GSTR-1 month window is half-open so the last day of the month is included', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    await service.generateGstr1Data(TEST_TENANT_ID, { period: { month: 11, year: 2026 } });
    const where = mockPrisma.invoice.findMany.mock.calls[0]![0].where;
    expect(where.createdAt.gte).toEqual(new Date(2026, 10, 1));
    expect(where.createdAt.lt).toEqual(new Date(2026, 11, 1));
    expect(where.createdAt.lte).toBeUndefined();
  });

  it('GSTR-3B totals outward tax, ITC and payable from invoices lacking tax transactions', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      seeded(),
      seeded({
        id: 'inv-2',
        invoiceType: 'PURCHASE',
        subtotalPaise: BigInt(100000),
        taxPaise: BigInt(3000),
        customer: null,
        supplier: { state: 'Gujarat' },
      }),
    ]);
    const r = await service.generateGstr3bData(TEST_TENANT_ID, { period: { month: 11, year: 2026 } });
    expect(r.outwardSupplies.taxableAmountPaise).toBe(7890500);
    expect(r.outwardSupplies.cgstPaise + r.outwardSupplies.sgstPaise).toBe(236715);
    expect(r.inwardSupplies.igstPaise).toBe(3000);
    expect(r.itcAvailable.igstPaise).toBe(3000);
    expect(r.taxPayable.igstPaise).toBe(0);
    expect(r.taxPayable.cgstPaise).toBe(118358);
    expect(r.taxPayable.sgstPaise).toBe(118357);
  });
});

describe('GST split determinism (HK-FIN-04)', () => {
  it('always sums to the invoice tax and differs by at most one paisa per invoice', () => {
    let cgst = 0;
    let sgst = 0;
    let tax = 0;
    for (const t of [236715, 100001, 3000, 7, 99999]) {
      const r = splitInvoiceGst({ subtotalPaise: 1000000, discountPaise: 0, taxPaise: t, partyState: 'Maharashtra', locationState: 'Maharashtra' });
      expect(r.cgstPaise + r.sgstPaise).toBe(t);
      expect(Math.abs(r.cgstPaise - r.sgstPaise)).toBeLessThanOrEqual(1);
      // CGST takes the odd paisa, the same rule the invoice detail page uses
      expect(r.cgstPaise).toBe(t - Math.floor(t / 2));
      cgst += r.cgstPaise; sgst += r.sgstPaise; tax += t;
    }
    expect(cgst + sgst).toBe(tax);
    // same inputs, same output (deterministic)
    const a = splitInvoiceGst({ subtotalPaise: 1, discountPaise: 0, taxPaise: 5, partyState: 'A', locationState: 'A' });
    const b = splitInvoiceGst({ subtotalPaise: 1, discountPaise: 0, taxPaise: 5, partyState: 'A', locationState: 'A' });
    expect(a).toEqual(b);
  });
});
