import { describe, it, expect } from 'vitest';
import { SaleInputSchema } from '../retail';

const base = {
  customerId: '3f0e8a2e-6d34-4c1b-9d3e-0a7d2b1c9e11',
  locationId: '41692d3e-00d8-4936-84aa-8c1bd6409080',
  lineItems: [
    {
      productId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
      description: '18K Mangalsutra B10',
      quantity: 1,
      unitPricePaise: '12383200', // BigInt-serialized by the API
      discountPaise: 0,
      metalRatePaise: 673500,
      metalWeightMg: '5000',
      makingChargesPaise: '0',
      wastageChargesPaise: 0,
      hsnCode: '7113',
      gstRate: 300,
    },
  ],
  payments: [{ method: 'CASH', amountPaise: '12754496' }],
  discountPaise: 0,
  currencyCode: 'INR',
};

describe('SaleInputSchema money coercion', () => {
  it('coerces numeric-string paise/mg to integers', () => {
    const out = SaleInputSchema.parse(base);
    expect(out.lineItems[0].unitPricePaise).toBe(12383200);
    expect(out.lineItems[0].metalWeightMg).toBe(5000);
    expect(out.payments[0].amountPaise).toBe(12754496);
  });
  it('still accepts plain numbers and applies defaults', () => {
    const out = SaleInputSchema.parse({
      ...base,
      lineItems: [{ description: 'x', unitPricePaise: 100 }],
      payments: [{ method: 'CASH', amountPaise: 100 }],
    });
    expect(out.lineItems[0].discountPaise).toBe(0);
    expect(out.lineItems[0].gstRate).toBe(300);
  });
  it('rejects fractional, negative, and non-numeric strings', () => {
    for (const bad of ['1.5', '-5', 'abc', 12.5, -1]) {
      const r = SaleInputSchema.safeParse({
        ...base,
        lineItems: [{ ...base.lineItems[0], unitPricePaise: bad }],
      });
      expect(r.success, String(bad)).toBe(false);
    }
  });
  it('rejects zero payments', () => {
    expect(
      SaleInputSchema.safeParse({ ...base, payments: [{ method: 'CASH', amountPaise: '0' }] }).success,
    ).toBe(false);
  });
});
