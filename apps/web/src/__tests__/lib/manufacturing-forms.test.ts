import { describe, it, expect } from 'vitest';
import {
  bomDetailView,
  bomProductMismatch,
  bomsForProduct,
  bpsToPercent,
  buildBomInput,
  buildJobInput,
  buildKarigarInput,
  computeBomEstimate,
  dedupeLocationsByName,
  emptyBomForm,
  emptyKarigarForm,
  formatServerError,
  gramsToMg,
  jobDates,
  karigarToFormValues,
  metalLineCostPaise,
  nextJobStatuses,
  parseDecimalToInt,
  percentToBps,
  rupeesToPaise,
  type BomFormValues,
  type JobFormValues,
} from '@/lib/manufacturing-forms';

const UUID = '3f2b6c1e-8a44-4d0e-9a52-6a1d2f7c9b10';

describe('decimal conversion', () => {
  it('converts without float error', () => {
    expect(parseDecimalToInt('1.005', 2)).toBe(101);
    expect(rupeesToPaise('57242')).toBe(5724200);
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(gramsToMg('10.5')).toBe(10500);
    expect(gramsToMg('0.0004')).toBe(0);
  });
  it('rejects blanks, negatives and junk', () => {
    expect(parseDecimalToInt('', 2)).toBeNull();
    expect(parseDecimalToInt('-4', 0)).toBeNull();
    expect(parseDecimalToInt('1e3', 0)).toBeNull();
  });
  it('wastage percent <-> basis points (200 = 2%)', () => {
    expect(percentToBps('2')).toBe(200);
    expect(percentToBps('2.5')).toBe(250);
    expect(bpsToPercent(200)).toBe('2');
    expect(bpsToPercent(250)).toBe('2.5');
  });
});

describe('BOM form', () => {
  const filled = (): BomFormValues => ({
    ...emptyBomForm(),
    name: '22K Ring BOM',
    productId: UUID,
    metals: [{ metalType: 'GOLD', purity: '916', weightG: '10', ratePerGram: '6000', wastagePct: '2' }],
    stones: [{ name: 'Diamond', pieces: '3', weightG: '0.2', costPerPiece: '1500.50' }],
    makingCharge: '2000',
    labour: '500',
  });

  it('computes metal cost with wastage in integer paise', () => {
    // 10 g * Rs 6000 = Rs 60,000; +2% = Rs 61,200
    expect(metalLineCostPaise(10000, 600000, 200)).toBe(6120000);
    expect(metalLineCostPaise(1, 1, 0)).toBe(0);
  });

  it('builds the create payload matching BomInputSchema (mg, paise, bps)', () => {
    const { input, errors, estimate } = buildBomInput(filled());
    expect(errors).toEqual({});
    expect(input).not.toBeNull();
    expect(input!.items).toHaveLength(4);
    expect(input!.items[0]).toMatchObject({
      itemType: 'METAL',
      description: 'GOLD 916',
      weightMg: 10000,
      unitOfMeasure: 'g',
      quantityRequired: 10,
      wastagePercent: 200,
      estimatedCostPaise: 6120000,
      sortOrder: 0,
    });
    expect(input!.items[1]).toMatchObject({ itemType: 'STONE', quantityRequired: 3, unitOfMeasure: 'pcs', weightMg: 200, estimatedCostPaise: 450150 });
    expect(input!.items[2]).toMatchObject({ itemType: 'OVERHEAD', estimatedCostPaise: 200000 });
    expect(input!.items[3]).toMatchObject({ itemType: 'LABOR', estimatedCostPaise: 50000 });
    const total = 6120000 + 450150 + 200000 + 50000;
    expect(input!.estimatedCostPaise).toBe(total);
    expect(estimate.totalPaise).toBe(total);
    expect(Number.isInteger(input!.estimatedCostPaise)).toBe(true);
  });

  it('live estimate ignores invalid rows', () => {
    const f = filled();
    f.metals[0]!.weightG = 'abc';
    expect(computeBomEstimate(f).metalPaise).toBe(0);
  });

  it('reports field errors', () => {
    const f = { ...emptyBomForm(), outputQuantity: '0' };
    const { input, errors } = buildBomInput(f);
    expect(input).toBeNull();
    expect(errors.name).toBeTruthy();
    expect(errors.productId).toBeTruthy();
    expect(errors.outputQuantity).toBeTruthy();
    expect(errors.items).toBeTruthy();
  });

  it('flags a metal row with rate but no weight and wastage over 100%', () => {
    const f = filled();
    f.metals = [{ metalType: 'GOLD', purity: '916', weightG: '', ratePerGram: '6000', wastagePct: '150' }];
    const { errors } = buildBomInput(f);
    expect(errors['metals.0.weightG']).toBeTruthy();
    expect(errors['metals.0.wastagePct']).toBeTruthy();
  });
});

describe('BOM detail view (real getById shape)', () => {
  const bom = {
    id: 'c87eae9f',
    name: 'BOM for product 1',
    version: 1,
    status: 'ACTIVE',
    outputQuantity: 1,
    estimatedCostPaise: '5724200',
    estimatedTimeMins: 120,
    product: { name: '22K Gold Ring A1' },
    items: [
      { id: 'i1', itemType: 'METAL', description: '22K Gold', quantityRequired: 8, unitOfMeasure: 'g', weightMg: '8000', estimatedCostPaise: '4800000', wastagePercent: 200, product: { name: 'Gold 22K' } },
      { id: 'i2', itemType: 'LABOR', description: 'Labour', quantityRequired: 1, unitOfMeasure: 'lot', weightMg: null, estimatedCostPaise: '924200', wastagePercent: 0, product: null },
    ],
  };
  it('shows components from items and the BOM estimated cost', () => {
    const v = bomDetailView(bom);
    expect(v.estimatedCostPaise).toBe(5724200);
    expect(v.productName).toBe('22K Gold Ring A1');
    expect(v.rows).toHaveLength(2);
    expect(v.rows[0]).toMatchObject({ name: 'Gold 22K', weightMg: 8000, wastagePct: '2%', costPaise: 4800000 });
    expect(v.rows[1]).toMatchObject({ name: 'Labour', weightMg: null, wastagePct: null, costPaise: 924200 });
    expect(v.itemsCostPaise).toBe(5724200);
  });
  it('tolerates an empty BOM', () => {
    expect(bomDetailView({}).rows).toEqual([]);
  });
});

describe('job form', () => {
  const base: JobFormValues = {
    productId: UUID, locationId: UUID, assignedKarigarId: '', bomId: '', customerId: '',
    priority: 'MEDIUM', quantity: '2', estimatedStartDate: '2026-11-20', estimatedEndDate: '2026-11-25',
    notes: '', specialInstructions: '',
  };
  it('builds a valid input', () => {
    const { input, errors } = buildJobInput(base);
    expect(errors).toEqual({});
    expect(input).toMatchObject({ productId: UUID, quantity: 2, bomId: undefined, notes: undefined });
    expect(input!.estimatedEndDate).toBeInstanceOf(Date);
  });
  it('rejects quantity -4 instead of coercing it to 1', () => {
    const { input, errors } = buildJobInput({ ...base, quantity: '-4' });
    expect(input).toBeNull();
    expect(errors.quantity).toMatch(/at least 1/);
    expect(buildJobInput({ ...base, quantity: '0' }).errors.quantity).toBeTruthy();
    expect(buildJobInput({ ...base, quantity: '' }).errors.quantity).toBeTruthy();
  });
  it('shows inline errors for an empty submit', () => {
    const { errors } = buildJobInput({ ...base, productId: '', locationId: '' });
    expect(errors.productId).toBeTruthy();
    expect(errors.locationId).toBeTruthy();
  });
  it('rejects end before start', () => {
    const { errors } = buildJobInput({ ...base, estimatedStartDate: '2026-11-25', estimatedEndDate: '2026-11-20' });
    expect(errors.estimatedEndDate).toMatch(/before/);
    expect(buildJobInput({ ...base, estimatedStartDate: '2026-11-25', estimatedEndDate: '2026-11-25' }).errors).toEqual({});
  });
  it('warns when the BOM is for another product', () => {
    expect(bomProductMismatch({ productId: 'other', product: { name: '18K Chain' } }, UUID)).toMatch(/18K Chain/);
    expect(bomProductMismatch({ productId: UUID }, UUID)).toBeNull();
    expect(bomProductMismatch(undefined, UUID)).toBeNull();
  });
});

describe('formatServerError', () => {
  it('turns a Zod issue array into readable text', () => {
    const raw = JSON.stringify([
      { origin: 'number', code: 'too_small', minimum: 1, path: ['quantity'], message: 'Too small: expected number to be >=1' },
      { code: 'invalid_format', format: 'guid', path: ['productId'], message: 'Invalid GUID' },
    ], null, 2);
    const text = formatServerError(new Error(raw));
    expect(text).toContain('Quantity must be at least 1');
    expect(text).toContain('Product is not valid');
    expect(text).not.toContain('{');
  });
  it('passes plain messages through', () => {
    expect(formatServerError({ message: 'Employee code already exists' })).toBe('Employee code already exists');
    expect(formatServerError(null)).toMatch(/went wrong/);
  });
});

describe('job status transitions', () => {
  it('follows the API state machine, cancel last', () => {
    expect(nextJobStatuses('DRAFT')).toEqual(['PLANNED', 'CANCELLED']);
    expect(nextJobStatuses('QC_FAILED')).toEqual(['IN_PROGRESS', 'CANCELLED']);
    expect(nextJobStatuses('QC_PENDING')).toEqual(['QC_PASSED', 'QC_FAILED']);
    expect(nextJobStatuses('COMPLETED')).toEqual([]);
    expect(nextJobStatuses('BOGUS')).toEqual([]);
  });
});

describe('job dates (HK-MFG-06)', () => {
  it('reads estimatedStartDate / estimatedEndDate', () => {
    const d = jobDates({ estimatedStartDate: '2026-11-20T00:00:00.000Z', estimatedEndDate: '2026-11-25T00:00:00.000Z' });
    expect(d.estimatedStart).toBe('2026-11-20T00:00:00.000Z');
    expect(d.estimatedEnd).toBe('2026-11-25T00:00:00.000Z');
    expect(jobDates({}).estimatedEnd).toBeNull();
  });
});

describe('location dedupe (HK-RPT-02)', () => {
  it('drops same-name same-type repeats and repeated ids', () => {
    const out = dedupeLocationsByName([
      { id: 'a', name: 'Main Showroom', locationType: 'SHOWROOM' },
      { id: 'b', name: 'main showroom ', locationType: 'SHOWROOM' },
      { id: 'a', name: 'Other', locationType: 'SHOWROOM' },
      { id: 'c', name: 'Main Showroom', locationType: 'WAREHOUSE' },
    ]);
    expect(out.map((l) => l.id)).toEqual(['a', 'c']);
  });
});

describe('karigar form', () => {
  const ok = { ...emptyKarigarForm(), employeeCode: 'KAR-007', firstName: 'Anil', lastName: 'Verma', locationId: UUID, dailyWage: '850.50', phone: '+91 98765 43210' };
  it('builds KarigarInputSchema data with wage in paise', () => {
    const { input, errors } = buildKarigarInput(ok);
    expect(errors).toEqual({});
    expect(input).toMatchObject({ employeeCode: 'KAR-007', dailyWagePaise: 85050, skillLevel: 'JUNIOR', isActive: true, email: null, joiningDate: null });
  });
  it('validates required fields and formats', () => {
    const { input, errors } = buildKarigarInput({ ...emptyKarigarForm(), email: 'nope', phone: 'abc', dailyWage: '-5' });
    expect(input).toBeNull();
    for (const k of ['employeeCode', 'firstName', 'lastName', 'locationId', 'email', 'phone', 'dailyWage']) expect(errors[k]).toBeTruthy();
  });
  it('prefills the edit form from getById', () => {
    const f = karigarToFormValues({ employeeCode: 'KAR-001', firstName: 'Ramesh', lastName: 'Kumar', dailyWagePaise: '85050', locationId: UUID, joiningDate: '2025-04-01T00:00:00.000Z', specialization: null, isActive: true, skillLevel: 'SENIOR' });
    expect(f).toMatchObject({ dailyWage: '850.5', joiningDate: '2025-04-01', specialization: '', skillLevel: 'SENIOR' });
  });
});

describe('bomsForProduct (HK-MFG-02)', () => {
  const boms = [{ id: 'a', productId: 'p1' }, { id: 'b', productId: 'p2' }, { id: 'c', productId: 'p1' }];
  it('keeps only the selected product BOMs', () => {
    expect(bomsForProduct(boms, 'p1').map((b) => b.id)).toEqual(['a', 'c']);
    expect(bomsForProduct(boms, 'p9')).toEqual([]);
  });
  it('offers none before a product is chosen', () => {
    expect(bomsForProduct(boms, '')).toEqual([]);
  });
});
