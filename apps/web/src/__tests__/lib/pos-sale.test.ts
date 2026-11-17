import { describe, it, expect } from 'vitest';
import {
  buildSalePayload,
  computePosTotals,
  formatPaise,
  humanizeServerError,
  toInt,
  withLineTax,
  type PosCartLine,
} from '@/lib/pos-sale';

// Shape as returned by inventory.stockItems.list: BigInt paise arrive as strings.
const line = (over: Partial<PosCartLine> = {}): PosCartLine =>
  withLineTax({
    productId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
    description: '18K Mangalsutra B10',
    quantity: 1,
    unitPricePaise: toInt('12383200'),
    metalWeightMg: 0,
    metalRatePaise: 673500,
    makingChargesPaise: 0,
    wastageChargesPaise: 0,
    discountPaise: 0,
    hsnCode: '7113',
    gstRate: 300,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    lineTotalPaise: 0,
    ...over,
  });

describe('toInt / formatPaise', () => {
  it('normalises BigInt strings, numbers, null', () => {
    expect(toInt('12383200')).toBe(12383200);
    expect(toInt(5)).toBe(5);
    expect(toInt(null)).toBe(0);
    expect(toInt('abc')).toBe(0);
  });
  it('always shows 2 decimals', () => {
    expect(formatPaise('11973660')).toBe('₹1,19,736.60');
    expect(formatPaise(10900)).toBe('₹109.00');
    expect(formatPaise(5)).toBe('₹0.05');
  });
});

describe('buildSalePayload', () => {
  it('sends only integer numbers for money/weight (no strings)', () => {
    const l = { ...line(), unitPricePaise: '12383200' as unknown as number };
    const p = buildSalePayload({
      customerId: '3f0e8a2e-6d34-4c1b-9d3e-0a7d2b1c9e11',
      locationId: '41692d3e-00d8-4936-84aa-8c1bd6409080',
      lines: [l],
      payments: [{ method: 'CASH', amountPaise: '12754496' }],
    });
    expect(p.lineItems[0].unitPricePaise).toBe(12383200);
    expect(typeof p.payments[0].amountPaise).toBe('number');
    for (const v of Object.values(p.lineItems[0])) {
      expect(typeof v === 'string' ? ['18K Mangalsutra B10', '7113', l.productId].includes(v) : true).toBe(true);
    }
    expect(p.currencyCode).toBe('INR');
  });
  it('omits customerId for walk-in', () => {
    const p = buildSalePayload({ customerId: null, locationId: 'x', lines: [line()], payments: [] });
    expect(p.customerId).toBeUndefined();
  });
});

describe('totals and tax', () => {
  it('tax is computed on the line total: qty 2 tax == 2 x qty 1 tax for even paise', () => {
    const one = line();
    const two = withLineTax(one, 2);
    expect(two.cgstPaise + two.sgstPaise).toBe(2 * (one.cgstPaise + one.sgstPaise));
  });
  it('odd paise: line tax is half-up on the line total, not unit tax x qty', () => {
    const one = line({ unitPricePaise: 10001 }); // 3% = 300.03 -> cgst 150.015 -> 150
    const three = withLineTax(one, 3); // 30003*3% = 900.09 -> 450.045 -> 450
    expect(one.cgstPaise).toBe(150);
    expect(three.cgstPaise).toBe(450);
  });
  it('total equals subtotal + tax + round-off exactly', () => {
    const lines = [line({ unitPricePaise: 5563900 }), withLineTax(line({ unitPricePaise: 4429233 }), 2)];
    const t = computePosTotals(lines);
    expect(t.totalPaise).toBe(t.subtotalPaise + t.taxPaise + t.roundOffPaise);
    expect(t.totalPaise % 100).toBe(0);
    expect(Math.abs(t.roundOffPaise)).toBeLessThan(100);
  });
  it('round-off is zero when exact', () => {
    expect(computePosTotals([line({ unitPricePaise: 10000 })]).roundOffPaise).toBe(0);
  });
});

describe('humanizeServerError', () => {
  it('flattens a zod issue dump', () => {
    const msg = JSON.stringify([
      { expected: 'number', code: 'invalid_type', path: ['lineItems', 0, 'unitPricePaise'], message: 'Invalid input: expected number, received string' },
      { code: 'invalid_type', path: ['lineItems', 1, 'unitPricePaise'], message: 'Invalid input: expected number, received string' },
    ]);
    const out = humanizeServerError(msg);
    expect(out).not.toContain('{');
    expect(out).not.toContain('"');
    expect(out).toContain('Item 1 unit price');
    expect(out).toContain('Item 2 unit price');
  });
  it('passes plain messages through and falls back when empty', () => {
    expect(humanizeServerError('Payment total (1) is less than sale total (2)')).toBe('Payment total (1) is less than sale total (2)');
    expect(humanizeServerError('')).toMatch(/try again/);
    expect(humanizeServerError('[not json')).toMatch(/try again/);
  });
});

describe('buildSalePayload customer (HK-RET-01)', () => {
  it('sends the picked customer id under customerId and omits it for walk-in', async () => {
    const { buildSalePayload } = await import('@/lib/pos-sale');
    const base = { locationId: '41692d3e-00d8-4936-84aa-8c1bd6409080', lines: [], payments: [] };
    expect(buildSalePayload({ ...base, customerId: '6ecfac52-f967-41a6-a76c-1abd8712078e' }).customerId).toBe(
      '6ecfac52-f967-41a6-a76c-1abd8712078e',
    );
    expect(buildSalePayload({ ...base, customerId: null }).customerId).toBeUndefined();
    expect(buildSalePayload({ ...base }).customerId).toBeUndefined();
  });
});
