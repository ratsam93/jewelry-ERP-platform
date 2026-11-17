import { describe, it, expect, beforeEach } from 'vitest';
import { FinancialService } from '../financial.service';
import { createMockPrismaService, TEST_TENANT_ID, resetAllMocks } from '../../../__tests__/setup';

const pii = { panNumber: 'ABCDE1234F', aadhaarNumber: '234567890124', gstinNumber: '27ABCDE1234F1Z5' };

describe('Financial PII masking', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let svc: FinancialService;
  beforeEach(() => {
    prisma = createMockPrismaService();
    svc = new FinancialService(prisma as any);
    resetAllMocks(prisma);
  });

  it('invoice getById / list mask party identifiers but keep GSTIN', async () => {
    const inv = { id: 'i1', customer: { id: 'c1', ...pii }, supplier: null };
    prisma.invoice.findFirst.mockResolvedValue(inv);
    const one: any = await svc.getInvoice(TEST_TENANT_ID, 'i1');
    expect(one.customer.panNumber).toBe('ABXXXXXXXF');
    expect(one.customer.aadhaarNumber).toBe('XXXX-XXXX-0124');
    expect(one.customer.gstinNumber).toBe('27ABCDE1234F1Z5');

    prisma.invoice.findMany.mockResolvedValue([inv]);
    prisma.invoice.count.mockResolvedValue(1);
    const list: any = await svc.listInvoices(TEST_TENANT_ID, { page: 1, limit: 10 } as any);
    expect(list.items[0].customer.panNumber).toBe('ABXXXXXXXF');
  });

  it('payment getById / list mask party identifiers', async () => {
    const pay = { id: 'p1', customer: { id: 'c1', ...pii }, supplier: { id: 's1', panNumber: 'ZZZZZ9999Z' } };
    prisma.payment.findFirst.mockResolvedValue(pay);
    const one: any = await svc.getPayment(TEST_TENANT_ID, 'p1');
    expect(one.customer.aadhaarNumber).toBe('XXXX-XXXX-0124');
    expect(one.supplier.panNumber).toBe('ZZXXXXXXXZ');

    prisma.payment.findMany.mockResolvedValue([pay]);
    prisma.payment.count.mockResolvedValue(1);
    const list: any = await svc.listPayments(TEST_TENANT_ID, { page: 1, limit: 10 } as any);
    expect(list.items[0].customer.panNumber).toBe('ABXXXXXXXF');
  });
});
