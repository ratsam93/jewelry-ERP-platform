import { describe, it, expect } from 'vitest';
import { partialUpdate } from '../zod-helpers';
import {
  PurchaseOrderInputSchema,
  SupplierInputSchema,
  supplierPostalCodeError,
  PurchaseOrderItemInputSchema,
  ConsignmentOutInputSchema,
  ConsignmentInInputSchema,
  AgentBrokerInputSchema,
  CommissionInputSchema,
  CreditLimitInputSchema,
  RateContractInputSchema,
  GoodsReceiptInputSchema,
  WholesaleCommissionType,
  WholesaleCommissionRefType,
  WholesaleCreditEntityType,
} from '../wholesale';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('PurchaseOrderItemInputSchema', () => {
  it('should parse valid PO item', () => {
    const result = PurchaseOrderItemInputSchema.safeParse({
      description: '22K Gold Chain',
      quantity: 10,
      unitPricePaise: 500000,
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-positive quantity', () => {
    const result = PurchaseOrderItemInputSchema.safeParse({
      description: 'Test',
      quantity: 0,
      unitPricePaise: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe('PurchaseOrderInputSchema', () => {
  it('should parse valid purchase order', () => {
    const result = PurchaseOrderInputSchema.safeParse({
      supplierId: validUuid,
      locationId: validUuid,
      items: [{ description: 'Gold Bar', quantity: 5, unitPricePaise: 10000000 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currencyCode).toBe('INR');
    }
  });

  it('should reject empty items', () => {
    const result = PurchaseOrderInputSchema.safeParse({
      supplierId: validUuid,
      locationId: validUuid,
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing supplierId', () => {
    const result = PurchaseOrderInputSchema.safeParse({
      locationId: validUuid,
      items: [{ description: 'Test', quantity: 1, unitPricePaise: 100 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('ConsignmentOutInputSchema', () => {
  it('should parse valid consignment out', () => {
    const result = ConsignmentOutInputSchema.safeParse({
      customerId: validUuid,
      locationId: validUuid,
      items: [{ productId: validUuid, quantity: 5, weightMg: 50000, valuePaise: 5000000 }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty items', () => {
    const result = ConsignmentOutInputSchema.safeParse({
      customerId: validUuid,
      locationId: validUuid,
      items: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ConsignmentInInputSchema', () => {
  it('should parse valid consignment in', () => {
    const result = ConsignmentInInputSchema.safeParse({
      supplierId: validUuid,
      locationId: validUuid,
      items: [{ productId: validUuid, quantity: 3, weightMg: 30000, valuePaise: 3000000 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('AgentBrokerInputSchema', () => {
  it('should parse valid agent/broker', () => {
    const result = AgentBrokerInputSchema.safeParse({
      name: 'Ramesh Broker',
      commissionType: WholesaleCommissionType.PERCENTAGE,
      commissionRate: 200,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional email', () => {
    const result = AgentBrokerInputSchema.safeParse({
      name: 'Test Agent',
      commissionType: WholesaleCommissionType.FIXED_PER_PIECE,
      commissionRate: 50000,
      email: 'agent@example.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('CommissionInputSchema', () => {
  it('should parse valid commission', () => {
    const result = CommissionInputSchema.safeParse({
      agentBrokerId: validUuid,
      referenceType: WholesaleCommissionRefType.SALE,
      referenceId: validUuid,
      amountPaise: 50000,
    });
    expect(result.success).toBe(true);
  });
});

describe('CreditLimitInputSchema', () => {
  it('should parse valid credit limit', () => {
    const result = CreditLimitInputSchema.safeParse({
      entityType: WholesaleCreditEntityType.CUSTOMER,
      entityId: validUuid,
      creditLimitPaise: 100000000,
    });
    expect(result.success).toBe(true);
  });
});

describe('RateContractInputSchema', () => {
  it('should parse valid rate contract', () => {
    const result = RateContractInputSchema.safeParse({
      supplierId: validUuid,
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
    });
    expect(result.success).toBe(true);
  });
});

describe('GoodsReceiptInputSchema', () => {
  it('should parse valid goods receipt', () => {
    const result = GoodsReceiptInputSchema.safeParse({
      purchaseOrderId: validUuid,
      items: [{ productId: validUuid, receivedQuantity: 10, weightMg: 100000 }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty items', () => {
    const result = GoodsReceiptInputSchema.safeParse({
      purchaseOrderId: validUuid,
      items: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('SupplierInputSchema (HK-WHL-01)', () => {
  const base = { name: 'Rajesh Gold Traders' };
  const fieldError = (data: Record<string, unknown>, field: string) => {
    const r = SupplierInputSchema.safeParse({ ...base, ...data });
    return r.success ? null : r.error.issues.find((i) => i.path[0] === field)?.message ?? null;
  };

  it('rejects the corrupting GSTIN from the QA run', () => {
    expect(fieldError({ gstinNumber: '27ABC' }, 'gstinNumber')).toMatch(/GSTIN/);
  });
  it('accepts a valid GSTIN and upper-cases / trims it', () => {
    const r = SupplierInputSchema.parse({ ...base, gstinNumber: ' 27abcde1234f1z5 ' });
    expect(r.gstinNumber).toBe('27ABCDE1234F1Z5');
  });
  it('treats blank optional fields as not provided', () => {
    const r = SupplierInputSchema.parse({ ...base, gstinNumber: '  ', panNumber: '', email: '', phone: '', postalCode: '' });
    expect(r.gstinNumber).toBeUndefined();
    expect(r.panNumber).toBeUndefined();
    expect(r.email).toBeUndefined();
    expect(r.phone).toBeUndefined();
  });
  it('validates PAN', () => {
    expect(fieldError({ panNumber: 'ABCDE123' }, 'panNumber')).toMatch(/PAN/);
    expect(SupplierInputSchema.parse({ ...base, panNumber: 'abcde1234f' }).panNumber).toBe('ABCDE1234F');
  });
  it('requires a 6 digit pincode for India (and when no country is given)', () => {
    expect(fieldError({ postalCode: '4000', country: 'IN' }, 'postalCode')).toMatch(/6 digits/);
    expect(fieldError({ postalCode: '4000' }, 'postalCode')).toMatch(/6 digits/);
    expect(fieldError({ postalCode: '40000A', country: 'IN' }, 'postalCode')).toMatch(/6 digits/);
    expect(fieldError({ postalCode: '400001', country: 'IN' }, 'postalCode')).toBeNull();
    expect(fieldError({ postalCode: 'SW1A 1AA', country: 'GB' }, 'postalCode')).toBeNull();
  });
  it('validates phone and email formats', () => {
    expect(fieldError({ phone: 'abc' }, 'phone')).toBeTruthy();
    expect(fieldError({ phone: '12345' }, 'phone')).toBeTruthy();
    expect(fieldError({ phone: '+91 98765 43210' }, 'phone')).toBeNull();
    expect(fieldError({ email: 'not-an-email' }, 'email')).toBeTruthy();
    expect(fieldError({ email: 'buyer@shop.in' }, 'email')).toBeNull();
  });
  it('requires a name', () => {
    expect(SupplierInputSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(SupplierInputSchema.safeParse({}).success).toBe(false);
  });
  it('supplierPostalCodeError is null when nothing is provided', () => {
    expect(supplierPostalCodeError('IN', '')).toBeNull();
    expect(supplierPostalCodeError(undefined, undefined)).toBeNull();
  });

  describe('partialUpdate keeps the field checks', () => {
    const update = partialUpdate(SupplierInputSchema);
    it('rejects a bad GSTIN / PAN / phone on update', () => {
      expect(update.safeParse({ gstinNumber: '27ABC' }).success).toBe(false);
      expect(update.safeParse({ panNumber: 'XYZ' }).success).toBe(false);
      expect(update.safeParse({ phone: 'zzz' }).success).toBe(false);
      expect(update.safeParse({ email: 'nope' }).success).toBe(false);
    });
    it('accepts valid partial updates and leaves omitted fields untouched', () => {
      const r = update.parse({ gstinNumber: '27abcde1234f1z5' });
      expect(r.gstinNumber).toBe('27ABCDE1234F1Z5');
      expect('isActive' in r && r.isActive !== undefined).toBe(false);
    });
  });
});
