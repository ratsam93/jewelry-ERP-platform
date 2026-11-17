import { describe, it, expect } from 'vitest';
import {
  buildCustomOrderInput,
  buildRepairInput,
  buildReturnInput,
  parseGramsToMg,
  parseRupees,
  unitRefundPaise,
} from '@/lib/retail-forms';

const CUST = '6ecfac52-f967-41a6-a76c-1abd8712078e';
const LOC = '41692d3e-00d8-4936-84aa-8c1bd6409080';

describe('parseRupees', () => {
  it('parses to integer paise', () => {
    expect(parseRupees('500')).toEqual({ paise: 50000, error: null });
    expect(parseRupees('1,234.5')).toEqual({ paise: 123450, error: null });
    expect(parseRupees('0.07')).toEqual({ paise: 7, error: null });
  });
  it('rejects negatives instead of flipping the sign', () => {
    expect(parseRupees('-500', { label: 'Value' }).error).toBe('Value cannot be negative.');
    expect(parseRupees('-500').paise).toBeNull();
  });
  it('rejects zero, garbage and >2 decimals; blank is neutral', () => {
    expect(parseRupees('0').error).toMatch(/greater than zero/);
    expect(parseRupees('0', { allowZero: true }).paise).toBe(0);
    expect(parseRupees('abc').error).toMatch(/number/);
    expect(parseRupees('1.234').error).toMatch(/2 decimal/);
    expect(parseRupees('  ')).toEqual({ paise: null, error: null });
  });
});

describe('parseGramsToMg', () => {
  it('converts grams to mg', () => {
    expect(parseGramsToMg('12.5').mg).toBe(12500);
    expect(parseGramsToMg('0.001').mg).toBe(1);
  });
  it('rejects bad input', () => {
    expect(parseGramsToMg('-1').error).toBeTruthy();
    expect(parseGramsToMg('0').error).toMatch(/greater than zero/);
  });
});

describe('buildRepairInput', () => {
  const base = {
    customerId: CUST,
    locationId: LOC,
    itemDescription: ' Gold chain clasp ',
    weightGrams: '',
    diagnosticNotes: '',
    estimate: '',
    promisedDate: '',
  };
  it('builds a schema-shaped input', () => {
    const { input, errors } = buildRepairInput({
      ...base,
      weightGrams: '12.5',
      estimate: '1500',
      diagnosticNotes: 'broken',
      promisedDate: '2099-01-05',
    });
    expect(errors).toEqual({});
    expect(input).toMatchObject({
      customerId: CUST,
      locationId: LOC,
      itemDescription: 'Gold chain clasp',
      itemWeightMg: 12500,
      estimatePaise: 150000,
      diagnosticNotes: 'broken',
    });
    expect(input!.promisedDate).toBeInstanceOf(Date);
  });
  it('requires customer, location and item', () => {
    const { input, errors } = buildRepairInput({ ...base, customerId: '', locationId: 'x', itemDescription: '  ' });
    expect(input).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['customerId', 'itemDescription', 'locationId']);
  });
  it('rejects negative estimate and past date', () => {
    const r = buildRepairInput({ ...base, estimate: '-5', promisedDate: '2000-01-01' });
    expect(r.errors.estimate).toBeTruthy();
    expect(r.errors.promisedDate).toMatch(/past/);
  });
});

describe('buildCustomOrderInput', () => {
  const base = {
    customerId: CUST,
    locationId: LOC,
    description: 'Bridal necklace',
    designNotes: '',
    estimate: '',
    expectedDate: '',
    targetWeightGrams: '',
    metalPurity: '',
  };
  it('builds with optional production hints', () => {
    const { input } = buildCustomOrderInput({ ...base, estimate: '250000', targetWeightGrams: '45', metalPurity: '916' });
    expect(input).toMatchObject({
      description: 'Bridal necklace',
      estimatePaise: 25000000,
      targetWeightMg: 45000,
      metalPurity: 916,
    });
  });
  it('requires a description and valid purity', () => {
    const r = buildCustomOrderInput({ ...base, description: '', metalPurity: 'abc' });
    expect(r.input).toBeNull();
    expect(r.errors.description).toBeTruthy();
    expect(r.errors.metalPurity).toBeTruthy();
  });
});

describe('buildReturnInput', () => {
  const lines = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      quantity: 2,
      unitRefundPaise: unitRefundPaise('12754696', 2),
    },
  ];
  const args = {
    originalSaleId: '33333333-3333-4333-8333-333333333333',
    locationId: LOC,
    customerId: CUST,
    refundMethod: 'CASH',
    lines,
  };
  it('computes per-unit refund and total', () => {
    expect(unitRefundPaise('12754696', 2)).toBe(6377348);
    const r = buildReturnInput({ ...args, reason: 'Defective', selection: { [lines[0].id]: { quantity: 1, reason: '' } } });
    expect(r.errors).toEqual([]);
    expect(r.refundPaise).toBe(6377348);
    expect(r.input).toMatchObject({
      reason: 'Defective',
      items: [{ originalLineItemId: lines[0].id, quantity: 1, returnPricePaise: 6377348 }],
    });
  });
  it('requires an item and a reason; rejects over-quantity', () => {
    expect(buildReturnInput({ ...args, reason: '', selection: {} }).errors).toEqual([
      'Select at least one item to return.',
      'Enter a reason for the return.',
    ]);
    const over = buildReturnInput({ ...args, reason: 'x', selection: { [lines[0].id]: { quantity: 3, reason: '' } } });
    expect(over.input).toBeNull();
    expect(over.errors[0]).toMatch(/between 1 and 2/);
  });
});

describe('returnUnitBreakdown (HK-RET-02)', () => {
  it('shows ex-tax unit price, GST per unit and the GST-inclusive refund per unit', async () => {
    const { returnUnitBreakdown } = await import('@/lib/retail-forms');
    // 2 x Mangalsutra: unit 1,23,832.00 ex-tax, line total (incl 3% GST) 2,55,093.92
    const b = returnUnitBreakdown({ quantity: 2, unitPricePaise: 12383200, discountPaise: 0, lineTotalPaise: 25509392 });
    expect(b.exTaxUnitPaise).toBe(12383200);
    expect(b.refundPerUnitPaise).toBe(12754696);
    expect(b.gstPerUnitPaise).toBe(371496);
    expect(b.exTaxUnitPaise + b.gstPerUnitPaise).toBe(b.refundPerUnitPaise);
  });
  it('accounts for line discounts and string money from the API', async () => {
    const { returnUnitBreakdown } = await import('@/lib/retail-forms');
    const b = returnUnitBreakdown({ quantity: 2, unitPricePaise: '100000', discountPaise: '20000', lineTotalPaise: '185400' });
    expect(b.exTaxUnitPaise).toBe(90000);
    expect(b.refundPerUnitPaise).toBe(92700);
    expect(b.gstPerUnitPaise).toBe(2700);
  });
});
