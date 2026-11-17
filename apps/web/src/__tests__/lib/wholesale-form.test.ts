import { describe, it, expect } from 'vitest';
import {
  PurchaseOrderInputSchema,
  ConsignmentInInputSchema,
  ConsignmentOutInputSchema,
  AgentBrokerInputSchema,
  SupplierInputSchema,
} from '../../../../../packages/shared-types/src/wholesale';
import { partialUpdate } from '../../../../../packages/shared-types/src/zod-helpers';
import {
  parseScaled,
  readableError,
  buildPurchaseOrderInput,
  poLineTotals,
  poLineView,
  poHeaderView,
  buildConsignmentInput,
  buildAgentInput,
  formatCommissionRate,
  consignmentPartyName,
  diffSupplierUpdate,
  emptyPOLine,
  poMissingRequirements,
  validateSupplierFormats,
  type POFormValues,
  type AgentFormValues,
} from '@/lib/wholesale-form';

import { buildSupplierInput } from '@/lib/supplier-form';

const SUP = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';
const PROD = '33333333-3333-4333-8333-333333333333';

const poForm = (over: Partial<POFormValues> = {}): POFormValues => ({
  supplierId: SUP,
  locationId: LOC,
  expectedDate: '2026-12-01',
  notes: 'QA-HK po verification',
  lines: [{ ...emptyPOLine('a'), productId: PROD, description: 'Gold 22K bulk', quantity: '15', unitPrice: '5924.00', weightG: '12.5', purityFineness: '916' }],
  ...over,
});

describe('parseScaled', () => {
  it('converts decimals exactly without float error', () => {
    expect(parseScaled('5924.00', 2)).toBe(592400);
    expect(parseScaled('0.29', 2)).toBe(29);
    expect(parseScaled('1.005', 3)).toBe(1005);
    expect(parseScaled('19.99', 2)).toBe(1999);
  });
  it('rejects blank, negative, junk and excess precision', () => {
    for (const bad of ['', ' ', '-1', 'abc', '1.234', '1,5']) expect(parseScaled(bad, 2)).toBeNull();
  });
});

describe('purchase order payload', () => {
  it('builds a payload accepted by PurchaseOrderInputSchema', () => {
    const { input, errors } = buildPurchaseOrderInput(poForm());
    expect(errors).toEqual({});
    const parsed = PurchaseOrderInputSchema.parse(input);
    expect(parsed.items[0]).toMatchObject({ quantity: 15, unitPricePaise: 592400, weightMg: 12500, purityFineness: 916, productId: PROD });
    expect(parsed.notes).toBe('QA-HK po verification');
  });
  it('rejects the old hard-coded ids (the Invalid GUID 400)', () => {
    const { input, errors } = buildPurchaseOrderInput(poForm({ supplierId: 's1', locationId: 'l1' }));
    expect(input).toBeNull();
    expect(errors.supplierId).toBeTruthy();
    expect(errors.locationId).toBeTruthy();
  });
  it('validates lines', () => {
    const { input, errors } = buildPurchaseOrderInput(
      poForm({ lines: [{ ...emptyPOLine('a'), description: '', quantity: '0', unitPrice: 'x', purityFineness: '1000' }] }),
    );
    expect(input).toBeNull();
    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(['line0.description', 'line0.quantity', 'line0.unitPrice', 'line0.purityFineness']),
    );
  });
  it('computes line totals and subtotal in integer paise (15 x 5,924.00 = 88,860.00)', () => {
    const { totals, subtotalPaise } = poLineTotals([
      ...poForm().lines,
      { ...emptyPOLine('b'), quantity: '3', unitPrice: '0.10' },
      emptyPOLine('c'),
    ]);
    expect(totals).toEqual([8886000, 30, null]);
    expect(subtotalPaise).toBe(8886030);
  });
  it('line view is qty x unit and flags a stored total that disagrees (demo PO-DEMO-0015)', () => {
    const row = { quantity: 15, unitPricePaise: 592400, totalPaise: 15626500 };
    const v = poLineView(row);
    expect(v.amountPaise).toBe(8886000);
    expect(v.mismatch).toBe(true);
    expect(poLineView({ quantity: 2, unitPricePaise: 100, totalPaise: 200 }).mismatch).toBe(false);
  });
  it('reads names/date from the flat PurchaseOrderResponse shape', () => {
    expect(poHeaderView({ supplierName: 'Rajhans', locationName: 'Main', expectedDate: '2026-12-01T00:00:00.000Z' })).toEqual({
      supplier: 'Rajhans', location: 'Main', expectedDate: '2026-12-01T00:00:00.000Z',
    });
    expect(poHeaderView({}).supplier).toBe('-');
  });
});

describe('readableError', () => {
  it('flattens zod issue JSON from tRPC', () => {
    const msg = JSON.stringify([
      { path: ['supplierId'], message: 'Invalid GUID' },
      { path: ['items', 0, 'quantity'], message: 'Too small' },
    ]);
    expect(readableError({ message: msg })).toBe('supplierId: Invalid GUID; items > 0 > quantity: Too small');
  });
  it('passes plain messages and falls back', () => {
    expect(readableError({ message: 'Supplier not found' })).toBe('Supplier not found');
    expect(readableError(null, 'fallback')).toBe('fallback');
  });
});

describe('consignments', () => {
  const base = {
    partyId: SUP,
    locationId: LOC,
    dueDate: '2026-12-15',
    notes: '',
    lines: [{ key: 'k', productId: PROD, quantity: '2', weightG: '10.250', value: '45000.50' }],
  };
  it('builds ConsignmentIn input (supplierId)', () => {
    const { input } = buildConsignmentInput('in', base);
    const parsed = ConsignmentInInputSchema.parse(input);
    expect(parsed.items[0]).toEqual({ productId: PROD, quantity: 2, weightMg: 10250, valuePaise: 4500050 });
    expect(input).not.toHaveProperty('customerId');
  });
  it('builds ConsignmentOut input (customerId)', () => {
    const { input } = buildConsignmentInput('out', base);
    expect(ConsignmentOutInputSchema.parse(input).customerId).toBe(SUP);
    expect(input).not.toHaveProperty('supplierId');
  });
  it('requires party, location, product', () => {
    const { input, errors } = buildConsignmentInput('out', { ...base, partyId: '', locationId: 'x', lines: [{ ...base.lines[0]!, productId: '' }] });
    expect(input).toBeNull();
    expect(errors.partyId).toBe('Select a customer');
    expect(errors.locationId).toBeTruthy();
    expect(errors['line0.productId']).toBeTruthy();
  });
  it('shows party names from flat response fields', () => {
    expect(consignmentPartyName({ supplierName: 'Zaveri' }, 'supplier')).toBe('Zaveri');
    expect(consignmentPartyName({ customerName: 'Asha Rao' }, 'customer')).toBe('Asha Rao');
    expect(consignmentPartyName({}, 'customer')).toBe('-');
  });
});

describe('agent', () => {
  const base: AgentFormValues = {
    name: ' Ravi Broker ', phone: '9876543210', email: '', commissionType: 'PERCENTAGE', commissionRate: '2.5',
    bankAccountNumber: '', ifscCode: 'hdfc0001234', panNumber: '', isActive: true,
  };
  it('stores percent as percent*100 and passes AgentBrokerInputSchema', () => {
    const { input } = buildAgentInput(base);
    const parsed = AgentBrokerInputSchema.parse(input);
    expect(parsed).toMatchObject({ name: 'Ravi Broker', commissionRate: 250, commissionType: 'PERCENTAGE', ifscCode: 'HDFC0001234' });
  });
  it('stores fixed commission in paise', () => {
    expect(buildAgentInput({ ...base, commissionType: 'FIXED_PER_PIECE', commissionRate: '50' }).input?.commissionRate).toBe(5000);
  });
  it('validates', () => {
    const { input, errors } = buildAgentInput({ ...base, name: '', email: 'bad', commissionRate: '150' });
    expect(input).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(['commissionRate', 'email', 'name']);
  });
  it('formats stored rates', () => {
    expect(formatCommissionRate('PERCENTAGE', 250)).toBe('2.5%');
    expect(formatCommissionRate('FIXED_PER_WEIGHT', 5000)).toContain('50.00 per g');
    expect(formatCommissionRate('PERCENTAGE', undefined)).toBe('-');
  });
});

describe('supplier update diff', () => {
  it('sends only changed fields and the result satisfies the supplier schema', () => {
    const original = { name: 'Zaveri', city: 'Mumbai', email: null, phone: '+919800000000' };
    const patch = diffSupplierUpdate(original, { name: 'Zaveri', city: 'Pune', email: 'a@b.com', phone: '+919800000000', isActive: true });
    expect(patch).toEqual({ city: 'Pune', email: 'a@b.com' });
    expect(partialUpdate(SupplierInputSchema).parse(patch)).toEqual(patch);
  });
});

describe('supplier format validation (HK-WHL-01)', () => {
  const blank = { name: 'Acme Gold', contactPerson: '', email: '', phone: '', address: '', city: '', state: '', country: 'IN', postalCode: '', gstinNumber: '', panNumber: '', supplierType: '' };

  it('flags the corrupting GSTIN inline and blocks the payload', () => {
    const r = buildSupplierInput({ ...blank, gstinNumber: '27ABC' });
    expect(r.input).toBeNull();
    expect(r.errors.gstinNumber).toMatch(/GSTIN/);
  });
  it('accepts a lower-case GSTIN/PAN and sends them upper-case', () => {
    const r = buildSupplierInput({ ...blank, gstinNumber: ' 27abcde1234f1z5 ', panNumber: 'abcde1234f' });
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ gstinNumber: '27ABCDE1234F1Z5', panNumber: 'ABCDE1234F' });
  });
  it('checks pincode, phone and email', () => {
    const e = validateSupplierFormats({ postalCode: '4000', country: 'IN', phone: 'abc', email: 'bad' });
    expect(Object.keys(e).sort()).toEqual(['email', 'phone', 'postalCode']);
    expect(validateSupplierFormats({ postalCode: 'SW1A 1AA', country: 'GB' })).toEqual({});
    expect(validateSupplierFormats({})).toEqual({});
  });
  it('agrees with the server schema on a table of cases', () => {
    const cases: Array<[string, Record<string, string>]> = [
      ['gstinNumber', { gstinNumber: '27ABC' }],
      ['gstinNumber', { gstinNumber: '27ABCDE1234F1Z5' }],
      ['panNumber', { panNumber: 'ABCDE123' }],
      ['panNumber', { panNumber: 'ABCDE1234F' }],
      ['postalCode', { postalCode: '4000', country: 'IN' }],
      ['postalCode', { postalCode: '400001', country: 'IN' }],
      ['phone', { phone: '12' }],
      ['phone', { phone: '+91 98765 43210' }],
      ['email', { email: 'x@' }],
      ['email', { email: 'ok@shop.in' }],
    ];
    for (const [field, data] of cases) {
      const server = SupplierInputSchema.safeParse({ name: 'A', ...data });
      const serverBad = !server.success && server.error.issues.some((i) => i.path[0] === field);
      expect(Boolean(validateSupplierFormats(data)[field]), JSON.stringify(data)).toBe(serverBad);
    }
  });
});

describe('purchase order form hints (HK-WHL-02/03)', () => {
  it('lists what is missing', () => {
    const empty = poForm({ supplierId: '', locationId: '', lines: [] });
    expect(poMissingRequirements(empty)).toEqual(['a supplier', 'a delivery location', 'at least one line item']);
    expect(poMissingRequirements(poForm({ lines: [emptyPOLine('x')] }))).toEqual(['a line item description']);
    expect(poMissingRequirements(poForm())).toEqual([]);
  });
  it('sends the entered notes in the create payload', () => {
    const r = buildPurchaseOrderInput(poForm({ notes: '  Deliver before Diwali  ' }));
    expect(r.input?.notes).toBe('Deliver before Diwali');
  });
});
