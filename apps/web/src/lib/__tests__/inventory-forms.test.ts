import { describe, it, expect } from 'vitest';
import {
  buildMetalAdjustInput,
  decimalToScaledInt,
  gramsToMgString,
  rupeesToPaiseString,
  stockTakeCounts,
  totalRequested,
  transferLineLabels,
  valuationMethodLabel,
} from '../inventory-forms';

const LOC = '41692d3e-00d8-4936-84aa-8c1bd6409080';
const base = {
  locationId: LOC,
  metalType: 'GOLD',
  purityFineness: '916',
  weightGrams: '10.5',
  valueRupees: '5000',
  notes: ' recount ',
};

describe('decimalToScaledInt', () => {
  it('converts grams to mg and rupees to paise without float error', () => {
    expect(gramsToMgString('10.5')).toBe('10500');
    expect(gramsToMgString('0.001')).toBe('1');
    expect(gramsToMgString('1,250.125')).toBe('1250125');
    expect(rupeesToPaiseString('5000')).toBe('500000');
    expect(rupeesToPaiseString('19.99')).toBe('1999');
    expect(rupeesToPaiseString('0.1')).toBe('10');
  });
  it('rejects junk, excess decimals, and negatives unless allowed', () => {
    expect(gramsToMgString('abc')).toBeNull();
    expect(gramsToMgString('1.2345')).toBeNull();
    expect(gramsToMgString('')).toBeNull();
    expect(gramsToMgString('-5')).toBeNull();
    expect(gramsToMgString('-5', true)).toBe('-5000');
    expect(decimalToScaledInt('-0', 3, { allowNegative: true })).toBe('0');
  });
});

describe('buildMetalAdjustInput', () => {
  it('builds the metalStock.adjust payload with mg and paise strings', () => {
    const r = buildMetalAdjustInput(base);
    expect(r).toEqual({
      ok: true,
      input: {
        locationId: LOC,
        metalType: 'GOLD',
        purityFineness: 916,
        weightChangeMg: '10500',
        valueChangePaise: '500000',
        notes: 'recount',
      },
    });
  });
  it('supports deductions and a blank value (0 paise, no notes)', () => {
    const r = buildMetalAdjustInput({ ...base, weightGrams: '-2', valueRupees: '', notes: '' });
    expect(r).toMatchObject({
      ok: true,
      input: { weightChangeMg: '-2000', valueChangePaise: '0', notes: undefined },
    });
  });
  it('an empty form fails with readable messages instead of doing nothing', () => {
    const r = buildMetalAdjustInput({
      locationId: '', metalType: 'GOLD', purityFineness: '', weightGrams: '', valueRupees: '', notes: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.locationId).toMatch(/location/i);
      expect(r.errors.purityFineness).toMatch(/1 and 999/);
      expect(r.errors.weightGrams).toMatch(/grams/);
    }
  });
  it('rejects zero weight, bad purity and bad value', () => {
    const r = buildMetalAdjustInput({ ...base, weightGrams: '0', purityFineness: '1000', valueRupees: '1.234' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.weightGrams).toMatch(/zero/);
      expect(r.errors.purityFineness).toBeDefined();
      expect(r.errors.valueRupees).toMatch(/2 decimals/);
    }
  });
  it('never puts a bigint in the payload (JSON.stringify must not throw)', () => {
    const r = buildMetalAdjustInput(base);
    expect(() => JSON.stringify(r)).not.toThrow();
  });
});

describe('transfer and stock take display helpers', () => {
  const items = [
    { productId: 'abcdef12-0000', quantityRequested: 3, product: { sku: 'SJ-R-1', name: 'Gold Ring' } },
    { productId: 'zzzzzzzz-0000', quantityRequested: 2 },
  ];
  it('lists line quantities and totals', () => {
    expect(transferLineLabels(items)).toEqual(['Gold Ring (SJ-R-1) x 3', 'zzzzzzzz x 2']);
    expect(totalRequested(items)).toBe(5);
    expect(transferLineLabels(undefined)).toEqual([]);
  });
  it('summarises stock take counts', () => {
    expect(
      stockTakeCounts([
        { countedQuantity: 5, varianceQuantity: 0 },
        { countedQuantity: 2, varianceQuantity: -1 },
        { countedQuantity: null, varianceQuantity: null },
      ]),
    ).toEqual({ total: 3, counted: 2, uncounted: 1, varianceLines: 1 });
  });
  it('names valuation methods', () => {
    expect(valuationMethodLabel('FIFO')).toBe('FIFO');
    expect(valuationMethodLabel('AVG')).toBe('Weighted Average');
    expect(valuationMethodLabel('MARKET')).toBe('Market Value');
  });
});
