import { describe, it, expect, vi } from 'vitest';
import { WholesaleAgentService } from '../wholesale.agent.service';
import { WholesaleSupplierService } from '../wholesale.supplier.service';
import { FinancialBankService } from '../../financial/financial.bank.service';

const now = new Date();
const agent = {
  id: 'a-1',
  tenantId: 't',
  name: 'Agent',
  phone: '1',
  email: null,
  commissionType: 'PERCENTAGE',
  commissionRate: 1,
  isActive: true,
  bankAccountNumber: '123456789012',
  ifscCode: 'HDFC0001234',
  panNumber: 'ABCPS1234F',
  commissions: [],
  createdAt: now,
  updatedAt: now,
};

describe('wholesale / bank list+detail PII masking', () => {
  it('listAgents and getAgent mask PAN and bank account', async () => {
    const prisma: any = {
      agentBroker: {
        findMany: vi.fn().mockResolvedValue([agent]),
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue(agent),
      },
    };
    const svc = new WholesaleAgentService(prisma);
    const list = await svc.listAgents('t', {}, { page: 1, limit: 10 } as any);
    expect(list.items[0]!.panNumber).toBe('ABXXXXXXXF');
    expect(list.items[0]!.bankAccountNumber).toBe('XXXXXXXX9012');
    const one = await svc.getAgent('t', 'a-1');
    expect(one.panNumber).toBe('ABXXXXXXXF');
    expect(one.bankAccountNumber).toBe('XXXXXXXX9012');
  });

  it('listSuppliers masks PAN', async () => {
    const supplier = { id: 's-1', tenantId: 't', name: 'S', panNumber: 'ABCPS1234F', isActive: true, createdAt: now, updatedAt: now };
    const prisma: any = {
      supplier: { findMany: vi.fn().mockResolvedValue([supplier]), count: vi.fn().mockResolvedValue(1) },
    };
    const list = await new WholesaleSupplierService(prisma).listSuppliers('t', {} as any, { page: 1, limit: 10 } as any);
    expect(list.items[0]!.panNumber).toBe('ABXXXXXXXF');
  });

  it('bank account list and detail mask the account number', async () => {
    const acct = { id: 'b-1', bankName: 'HDFC', accountNumber: '123456789012', ifscCode: 'HDFC0001234', account: { id: 'x' } };
    const prisma: any = {
      bankAccount: { findMany: vi.fn().mockResolvedValue([acct]), findFirst: vi.fn().mockResolvedValue(acct) },
    };
    const svc = new FinancialBankService(prisma);
    const list: any = await svc.listBankAccounts('t');
    expect(list[0].accountNumber).toBe('XXXXXXXX9012');
    const one: any = await svc.getBankAccount('t', 'b-1');
    expect(one.accountNumber).toBe('XXXXXXXX9012');
  });
});
