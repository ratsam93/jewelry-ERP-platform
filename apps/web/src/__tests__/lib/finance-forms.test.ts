import { describe, it, expect } from 'vitest';
import {
  buildBankInput,
  buildInvoiceInput,
  buildPaymentInput,
  computeInvoiceTotals,
  customerOptionLabel,
  deriveInvoiceTaxView,
  sortInvoiceLines,
  derivePaidView,
  endOfDayUtc,
  rangeLabel,
  readableError,
  rupeesToPaise,
  stateCodeFrom,
  type InvoiceFormValues,
} from '@/lib/finance-forms';

const line = (over = {}) => ({
  description: 'Gold ring', quantity: '2', unitPrice: '45000', discount: '', hsnCode: '7113', gstPercent: '3', ...over,
});
const form = (over: Partial<InvoiceFormValues> = {}): InvoiceFormValues => ({
  invoiceType: 'SALES',
  customerId: 'c1',
  supplierId: '',
  locationId: 'l1',
  sourceState: 'MH',
  destState: 'MH',
  dueDate: '',
  notes: '',
  lines: [line()],
  ...over,
});

describe('rupeesToPaise', () => {
  it('converts exactly without float drift', () => {
    expect(rupeesToPaise('45000')).toBe(4500000);
    expect(rupeesToPaise('1,234.5')).toBe(123450);
    expect(rupeesToPaise('0.07')).toBe(7);
    expect(rupeesToPaise('19.99')).toBe(1999);
  });
  it('rejects negatives, junk and more than 2 decimals', () => {
    expect(rupeesToPaise('-500')).toBeNull();
    expect(rupeesToPaise('abc')).toBeNull();
    expect(rupeesToPaise('1.234')).toBeNull();
    expect(rupeesToPaise('1e3')).toBeNull();
    expect(rupeesToPaise('')).toBeNull();
  });
});

describe('invoice totals (QA arithmetic)', () => {
  it('2 x 45000 @3% + 1 x 5000 @5% intra-state = 95,000 + CGST 1,475 + SGST 1,475 = 97,950.00', () => {
    const t = computeInvoiceTotals(
      [line(), line({ description: 'Making', quantity: '1', unitPrice: '5000', gstPercent: '5' })],
      'MH',
      'MH',
    );
    expect(t.subtotalPaise).toBe(9500000);
    expect(t.cgstPaise).toBe(147500);
    expect(t.sgstPaise).toBe(147500);
    expect(t.igstPaise).toBe(0);
    expect(t.totalPaise).toBe(9795000);
  });
  it('uses IGST when the states differ', () => {
    const t = computeInvoiceTotals([line()], 'MH', 'GJ');
    expect(t.igstPaise).toBe(270000);
    expect(t.cgstPaise + t.sgstPaise).toBe(0);
    expect(t.totalPaise).toBe(9270000);
  });
});

describe('buildInvoiceInput', () => {
  it('builds the API payload in paise with rates *100 and no empty ids', () => {
    const { input, errors } = buildInvoiceInput(form({ dueDate: '2026-12-01', notes: ' hi ' }));
    expect(errors).toEqual({});
    expect(input).toEqual({
      invoiceType: 'SALES',
      locationId: 'l1',
      customerId: 'c1',
      sourceState: 'MH',
      destState: 'MH',
      currencyCode: 'INR',
      dueDate: '2026-12-01',
      notes: 'hi',
      lineItems: [
        { description: 'Gold ring', quantity: 2, unitPricePaise: 4500000, discountPaise: 0, hsnCode: '7113', gstRate: 300 },
      ],
    });
  });
  it('purchase invoices carry supplierId, not customerId', () => {
    const { input } = buildInvoiceInput(form({ invoiceType: 'PURCHASE', customerId: '', supplierId: 's1' }));
    expect(input).toMatchObject({ supplierId: 's1' });
    expect(input).not.toHaveProperty('customerId');
  });
  it('an empty submit yields inline messages for every required field', () => {
    const { input, errors } = buildInvoiceInput(
      form({ customerId: '', locationId: '', sourceState: '', destState: '', lines: [line({ description: '', unitPrice: '' })] }),
    );
    expect(input).toBeNull();
    expect(errors.customerId).toBeTruthy();
    expect(errors.locationId).toBeTruthy();
    expect(errors.sourceState).toBeTruthy();
    expect(errors.destState).toBeTruthy();
    expect(errors['lines.0.description']).toBeTruthy();
    expect(errors['lines.0.unitPrice']).toBe('Unit price is required');
  });
  it('rejects zero/negative price, fractional qty, bad GST % and oversize discount', () => {
    const { errors } = buildInvoiceInput(
      form({ lines: [line({ unitPrice: '0', quantity: '1.5', gstPercent: '101', discount: '999999999' })] }),
    );
    expect(errors['lines.0.unitPrice']).toMatch(/greater than 0/);
    expect(errors['lines.0.quantity']).toBeTruthy();
    expect(errors['lines.0.gstPercent']).toBeTruthy();
    const { errors: e2 } = buildInvoiceInput(form({ lines: [line({ discount: '999999999' })] }));
    expect(e2['lines.0.discount']).toMatch(/exceed/);
  });
});

describe('buildPaymentInput', () => {
  const base = { paymentType: 'RECEIVED' as const, method: 'UPI', amount: '500', customerId: 'c1', supplierId: '', invoiceId: '', reference: ' UTR1 ' };
  it('builds a positive paise amount', () => {
    expect(buildPaymentInput(base).input).toEqual({
      paymentType: 'RECEIVED', method: 'UPI', amountPaise: 50000, currencyCode: 'INR', customerId: 'c1', reference: 'UTR1',
    });
  });
  it('rejects a negative amount (-500) and zero', () => {
    expect(buildPaymentInput({ ...base, amount: '-500' }).errors.amount).toMatch(/positive/);
    expect(buildPaymentInput({ ...base, amount: '0' }).errors.amount).toMatch(/greater than 0/);
    expect(buildPaymentInput({ ...base, amount: '' }).errors.amount).toMatch(/required/);
  });
  it('requires the party and blocks overpaying the linked invoice', () => {
    expect(buildPaymentInput({ ...base, customerId: '' }).errors.customerId).toBeTruthy();
    expect(buildPaymentInput({ ...base, amount: '600', invoiceId: 'i1' }, { outstandingPaise: 50000 }).errors.amount).toMatch(/exceeds/);
    expect(buildPaymentInput({ ...base, invoiceId: 'i1' }, { outstandingPaise: 50000 }).input).toMatchObject({ invoiceId: 'i1' });
  });
});

describe('buildBankInput', () => {
  const ok = { bankName: 'HDFC Bank', accountNumber: '50100123456789', ifscCode: 'hdfc0001234', branchName: '', accountType: 'Current', ledgerAccountId: '', openingBalance: '1000.50', isDefault: false };
  it('uppercases IFSC and converts the opening balance', () => {
    expect(buildBankInput(ok).input).toMatchObject({ ifscCode: 'HDFC0001234', currentBalancePaise: 100050 });
  });
  it('validates IFSC (11 chars, 5th is 0)', () => {
    expect(buildBankInput({ ...ok, ifscCode: 'HDFC1001234' }).errors.ifscCode).toBeTruthy();
    expect(buildBankInput({ ...ok, ifscCode: 'HDFC00012' }).errors.ifscCode).toBeTruthy();
    expect(buildBankInput({ ...ok, bankName: '', accountNumber: '' }).errors).toMatchObject({
      bankName: expect.any(String), accountNumber: expect.any(String),
    });
  });
});

describe('deriveInvoiceTaxView (real seeded shape: no lines, no tax rows)', () => {
  const seeded = {
    subtotalPaise: '7890500', discountPaise: '0', taxPaise: '236715', totalPaise: '8127215', paidPaise: '8127215',
    lineItems: [], payments: [], taxTransactions: [],
    customer: { state: 'Maharashtra' }, location: { state: 'Maharashtra' },
  };
  it('splits the invoice-level tax into CGST + SGST that add up to the grand total', () => {
    const v = deriveInvoiceTaxView(seeded);
    expect(v.source).toBe('invoice');
    expect(v.taxablePaise).toBe(7890500);
    expect(v.cgstPaise + v.sgstPaise).toBe(236715);
    expect(v.taxablePaise + v.totalTaxPaise).toBe(8127215);
    expect(v.cgstRate).toBe(150); // 1.5% as percent*100
  });
  it('uses IGST for inter-state invoices', () => {
    const v = deriveInvoiceTaxView({ ...seeded, customer: { state: 'Gujarat' } });
    expect(v).toMatchObject({ igstPaise: 236715, cgstPaise: 0, isInterState: true });
  });
  it('prefers line amounts when present', () => {
    const v = deriveInvoiceTaxView({
      ...seeded,
      lineItems: [{ taxableAmountPaise: '9000000', gstRate: 300, cgstPaise: '135000', sgstPaise: '135000', igstPaise: '0' }],
    });
    expect(v).toMatchObject({ source: 'lines', cgstPaise: 135000, taxablePaise: 9000000, cgstRate: 150 });
  });
  it('explains paid amounts without payment rows', () => {
    expect(derivePaidView(seeded)).toEqual({ paidPaise: 8127215, recordedPaise: 0, unallocatedPaise: 8127215 });
    expect(
      derivePaidView({ paidPaise: '5000', payments: [{ amountPaise: '5000', status: 'COMPLETED' }] }).unallocatedPaise,
    ).toBe(0);
  });
});

describe('misc helpers', () => {
  it('maps state names to GST codes', () => {
    expect(stateCodeFrom('Maharashtra')).toBe('MH');
    expect(stateCodeFrom('gj')).toBe('GJ');
    expect(stateCodeFrom('Atlantis')).toBe('');
  });
  it('labels customers with name and phone', () => {
    expect(customerOptionLabel({ firstName: 'Priya', lastName: 'Sharma', phone: '+919820000001' })).toBe('Priya Sharma (+919820000001)');
  });
  it('formats the trial balance range and includes the whole last day', () => {
    expect(rangeLabel('2026-11-01', '2026-11-17')).toBe('From 01 Nov 2026 to 17 Nov 2026');
    expect(endOfDayUtc('2026-11-17').toISOString()).toBe('2026-11-17T23:59:59.999Z');
  });
  it('turns zod issue JSON into readable text', () => {
    const msg = readableError({ message: JSON.stringify([{ path: ['lineItems', 0, 'unitPricePaise'], message: 'Required' }]) });
    expect(msg).toBe('lineItems.0.unitPricePaise: Required');
    expect(readableError({ message: 'Invoice not found' })).toBe('Invoice not found');
    expect(readableError(null)).toMatch(/try again/);
  });
});

describe('deriveInvoiceTaxView on a mixed 3% / 5% invoice', () => {
  const mixed = {
    subtotalPaise: 9500000,
    discountPaise: 0,
    taxPaise: 295000,
    lineItems: [
      { id: 'a', gstRate: 300, taxableAmountPaise: 9000000, cgstPaise: 135000, sgstPaise: 135000, igstPaise: 0, totalPaise: 9270000 },
      { id: 'b', gstRate: 500, taxableAmountPaise: 500000, cgstPaise: 12500, sgstPaise: 12500, igstPaise: 0, totalPaise: 525000 },
    ],
  } as never;

  it('returns per-rate rows and the effective rate, not one line rate', () => {
    const v = deriveInvoiceTaxView(mixed);
    expect(v.rateRows).toEqual([
      { gstRate: 300, taxablePaise: 9000000, cgstPaise: 135000, sgstPaise: 135000, igstPaise: 0 },
      { gstRate: 500, taxablePaise: 500000, cgstPaise: 12500, sgstPaise: 12500, igstPaise: 0 },
    ]);
    expect(v.cgstPaise + v.sgstPaise).toBe(295000);
    expect(v.cgstRate).toBe(155); // 1.55% effective (percent * 100)
    expect(v.cgstRate).not.toBe(250);
  });

  it('single-rate invoices keep the nominal half rate', () => {
    const v = deriveInvoiceTaxView({
      subtotalPaise: 100000, discountPaise: 0, taxPaise: 3000,
      lineItems: [{ id: 'a', gstRate: 300, taxableAmountPaise: 100000, cgstPaise: 1500, sgstPaise: 1500, igstPaise: 0, totalPaise: 103000 }],
    } as never);
    expect(v.cgstRate).toBe(150);
    expect(v.rateRows).toHaveLength(1);
  });
});

describe('sortInvoiceLines', () => {
  it('orders oldest first and keeps received order for ties', () => {
    const out = sortInvoiceLines([
      { id: 'c', createdAt: '2026-01-01T00:00:00.002Z' },
      { id: 'a', createdAt: '2026-01-01T00:00:00.001Z' },
      { id: 'b', createdAt: '2026-01-01T00:00:00.001Z' },
    ]);
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
});
