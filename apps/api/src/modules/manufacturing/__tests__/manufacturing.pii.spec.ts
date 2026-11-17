import { describe, it, expect, beforeEach } from 'vitest';
import { ManufacturingKarigarService } from '../manufacturing.karigar.service';
import { ManufacturingService } from '../manufacturing.service';
import { createMockPrismaService, TEST_TENANT_ID, resetAllMocks } from '../../../__tests__/setup';

const pii = { panNumber: 'ABCDE1234F', aadhaarNumber: '234567890124', bankAccountNumber: '123456789012' };
const pagination = { page: 1, limit: 10, sortOrder: 'asc' } as any;

describe('Manufacturing PII masking', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  beforeEach(() => {
    prisma = createMockPrismaService();
    resetAllMocks(prisma);
  });

  it('karigar list and getById mask PAN, Aadhaar and bank account', async () => {
    const svc = new ManufacturingKarigarService(prisma as any);
    prisma.karigar.findMany.mockResolvedValue([{ id: 'k1', ...pii }]);
    prisma.karigar.count.mockResolvedValue(1);
    const list = await svc.findAllKarigars(TEST_TENANT_ID, pagination);
    expect((list.items[0] as any).panNumber).toBe('ABXXXXXXXF');
    expect((list.items[0] as any).bankAccountNumber).toBe('XXXXXXXX9012');

    prisma.karigar.findFirst.mockResolvedValue({ id: 'k1', ...pii });
    const one: any = await svc.findKarigarById(TEST_TENANT_ID, 'k1');
    expect(one.aadhaarNumber).toBe('XXXX-XXXX-0124');
  });

  it('job orders mask the embedded customer and karigar', async () => {
    const svc = new ManufacturingService(prisma as any, { publish: async () => undefined } as any);
    const job = { id: 'j1', customer: { id: 'c1', ...pii }, assignedKarigar: { id: 'k1', ...pii } };
    prisma.jobOrder.findMany.mockResolvedValue([job]);
    prisma.jobOrder.count.mockResolvedValue(1);
    const list: any = await svc.findAllJobOrders(TEST_TENANT_ID, pagination);
    expect(list.items[0].customer.panNumber).toBe('ABXXXXXXXF');
    expect(list.items[0].assignedKarigar.aadhaarNumber).toBe('XXXX-XXXX-0124');

    prisma.jobOrder.findFirst.mockResolvedValue(job);
    const one: any = await svc.findJobOrderById(TEST_TENANT_ID, 'j1');
    expect(one.customer.aadhaarNumber).toBe('XXXX-XXXX-0124');
  });
});
