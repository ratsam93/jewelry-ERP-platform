import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { createMockPrismaService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
import { CrmService } from '../crm.service';
import {
  CustomerCreateInputSchema,
  maskAadhaar,
  maskCustomerIdentifiers,
  maskPan,
} from '../crm.customer.schema';

// Real row shape taken from crm.customer360 for the demo customer (Priya Sharma).
const CUSTOMER_ROW = {
  id: '6ecfac52-f967-41a6-a76c-1abd8712078e',
  tenantId: 't1',
  firstName: 'Priya',
  lastName: 'Sharma',
  email: 'demo.customer@example.com',
  phone: '+919820000001',
  alternatePhone: null,
  address: '12, Linking Road, Bandra West',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'IN',
  postalCode: '400050',
  customerType: 'RETAIL',
  loyaltyPoints: 0,
  loyaltyTier: null,
  panNumber: 'ABCPS1234F',
  aadhaarNumber: '234567890124',
  gstinNumber: null,
  dateOfBirth: null,
  anniversary: null,
  createdAt: new Date('2026-11-17T09:16:34.177Z'),
};

describe('PAN / Aadhaar masking', () => {
  it('maskPan keeps the first 2 and last 1 characters', () => {
    expect(maskPan('ABCPS1234F')).toBe('ABXXXXXXXF');
    expect(maskPan(null)).toBeNull();
    expect(maskPan('')).toBeNull();
  });

  it('maskAadhaar keeps only the last 4 digits', () => {
    expect(maskAadhaar('234567890124')).toBe('XXXX-XXXX-0124');
    expect(maskAadhaar(undefined)).toBeNull();
  });

  it('maskCustomerIdentifiers leaves other fields untouched and does not mutate input', () => {
    const out = maskCustomerIdentifiers(CUSTOMER_ROW);
    expect(out.firstName).toBe('Priya');
    expect(out.panNumber).toBe('ABXXXXXXXF');
    expect(out.aadhaarNumber).toBe('XXXX-XXXX-0124');
    expect(CUSTOMER_ROW.panNumber).toBe('ABCPS1234F');
  });
});

describe('CustomerCreateInputSchema', () => {
  it('accepts a minimal customer and defaults the type to RETAIL', () => {
    const r = CustomerCreateInputSchema.parse({ firstName: 'Asha', lastName: 'Rao' });
    expect(r.customerType).toBe('RETAIL');
  });

  it('requires E.164 phone numbers', () => {
    const base = { firstName: 'A', lastName: 'B' };
    expect(CustomerCreateInputSchema.safeParse({ ...base, phone: '+919820000001' }).success).toBe(true);
    expect(CustomerCreateInputSchema.safeParse({ ...base, phone: '9820000001' }).success).toBe(false);
    expect(CustomerCreateInputSchema.safeParse({ ...base, phone: '+0123' }).success).toBe(false);
  });

  it('rejects blank names and bad emails', () => {
    expect(CustomerCreateInputSchema.safeParse({ firstName: ' ', lastName: 'B' }).success).toBe(false);
    expect(CustomerCreateInputSchema.safeParse({ firstName: 'A', lastName: 'B', email: 'nope' }).success).toBe(false);
  });
});

describe('CrmService PII masking and createCustomer', () => {
  let service: CrmService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  const { tenantId, userId } = mockTenantContext;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    ['loyaltyTransaction', 'customerOccasion', 'customerInteraction', 'feedback', 'digitalPassbook', 'invoice'].forEach((m) => {
      (prisma as any)[m] = { findMany: vi.fn().mockResolvedValue([]) };
    });
    prisma.customer.findFirst = vi.fn() as any;
    prisma.customer.findMany = vi.fn() as any;
    prisma.customer.count = vi.fn() as any;
    prisma.customer.create = vi.fn() as any;
    service = new CrmService(prisma as never);
  });

  it('getCustomer360 never returns the full PAN or Aadhaar', async () => {
    prisma.customer.findFirst = vi.fn().mockResolvedValue(CUSTOMER_ROW) as any;
    const r = await service.getCustomer360(tenantId, CUSTOMER_ROW.id);
    expect(r.profile.firstName).toBe('Priya');
    expect(r.profile.panNumber).toBe('ABXXXXXXXF');
    expect(r.profile.aadhaarNumber).toBe('XXXX-XXXX-0124');
    const json = JSON.stringify(r);
    expect(json).not.toContain('ABCPS1234F');
    expect(json).not.toContain('234567890124');
  });

  it('listCustomers masks identifiers on every row', async () => {
    prisma.customer.findMany.mockResolvedValue([CUSTOMER_ROW] as any);
    prisma.customer.count.mockResolvedValue(1);
    const r = await service.listCustomers(tenantId, { page: 1, limit: 20 } as never);
    const row = r.items[0] as typeof CUSTOMER_ROW;
    expect(row.panNumber).toBe('ABXXXXXXXF');
    expect(row.aadhaarNumber).toBe('XXXX-XXXX-0124');
  });

  it('createCustomer stores tenant, audit fields and defaults country to IN', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ ...CUSTOMER_ROW, panNumber: null, aadhaarNumber: null } as any);
    await service.createCustomer(
      tenantId,
      userId,
      CustomerCreateInputSchema.parse({ firstName: 'Asha', lastName: 'Rao', phone: '+919820000002', city: 'Pune' }),
    );
    const data = (prisma.customer.create as any).mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId,
      firstName: 'Asha',
      lastName: 'Rao',
      phone: '+919820000002',
      city: 'Pune',
      country: 'IN',
      customerType: 'RETAIL',
      createdBy: userId,
      updatedBy: userId,
    });
  });

  it('createCustomer rejects a duplicate phone with ConflictException', async () => {
    prisma.customer.findFirst.mockResolvedValue({ ...CUSTOMER_ROW } as any);
    await expect(
      service.createCustomer(
        tenantId,
        userId,
        CustomerCreateInputSchema.parse({ firstName: 'X', lastName: 'Y', phone: '+919820000001' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
});
