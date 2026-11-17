import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndiaGirviService } from '../india.girvi.service';
import { IndiaKycService } from '../india.kyc.service';
import { IndiaSchemeService } from '../india.scheme.service';
import { createMockPrismaService, TEST_TENANT_ID, TEST_USER_ID } from '../../../__tests__/setup';

vi.mock('@caratflow/utils', () => ({
  isValidAadhaar: (num: string) => /^\d{12}$/.test(num),
  isValidPan: (pan: string) => /^[A-Z]{5}\d{4}[A-Z]$/.test(pan),
}));

const RAW_PAN = 'ABCPS1234F';
const RAW_AADHAAR = '234567890124';
const customerRow = () => ({
  id: 'cust-1',
  firstName: 'Ravi',
  lastName: 'Kumar',
  panNumber: RAW_PAN,
  aadhaarNumber: RAW_AADHAAR,
});
const loanRow = () => ({ id: 'loan-1', loanNumber: 'GL-1', status: 'ACTIVE', customer: customerRow() });

function expectMasked(value: unknown) {
  const json = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  expect(json).not.toContain(RAW_PAN);
  expect(json).not.toContain(RAW_AADHAAR);
  expect(json).toContain('ABXXXXXXXF');
  expect(json).toContain('XXXX-XXXX-0124');
}

describe('India PII masking in responses', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = createMockPrismaService();
    for (const m of [
      'girviLoan',
      'girviAuction',
      'kycVerification',
      'kittyScheme',
      'goldSavingsScheme',
      'goldSavingsMember',
      'kittyMember',
    ]) {
      prisma[m] = {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
      };
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  });

  describe('girvi', () => {
    it('getLoan masks customer PAN and Aadhaar', async () => {
      prisma.girviLoan.findFirst.mockResolvedValue(loanRow());
      const out: any = await new IndiaGirviService(prisma).getLoan(TEST_TENANT_ID, 'loan-1');
      expect(out.customer.panNumber).toBe('ABXXXXXXXF');
      expect(out.customer.aadhaarNumber).toBe('XXXX-XXXX-0124');
      expect(out.customer.firstName).toBe('Ravi');
      expectMasked(out);
    });

    it('listLoans masks every item', async () => {
      prisma.girviLoan.findMany.mockResolvedValue([loanRow(), loanRow()]);
      const out: any = await new IndiaGirviService(prisma).listLoans(TEST_TENANT_ID, { page: 1, limit: 20 } as any);
      expect(out.items).toHaveLength(2);
      expectMasked(out);
    });

    it('listAuctions masks nested loan customer', async () => {
      prisma.girviAuction.findMany.mockResolvedValue([{ id: 'a-1', girviLoan: loanRow() }]);
      const out = await new IndiaGirviService(prisma).listAuctions(TEST_TENANT_ID);
      expectMasked(out);
    });

    it('markDefaulted masks the returned customer', async () => {
      const svc = new IndiaGirviService(prisma);
      prisma.girviLoan.findFirst.mockResolvedValue({ id: 'loan-1', status: 'ACTIVE' });
      prisma.girviLoan.update.mockResolvedValue(loanRow());
      expectMasked(await svc.markDefaulted(TEST_TENANT_ID, TEST_USER_ID, 'loan-1'));
    });
  });

  describe('kyc', () => {
    const verification = () => ({
      id: 'v-1',
      verificationType: 'AADHAAR',
      verificationStatus: 'PENDING',
      documentNumber: RAW_AADHAAR,
      customer: customerRow(),
    });
    const svc = () => new IndiaKycService(prisma, {} as any);

    it('listVerifications masks documentNumber and embedded customer', async () => {
      prisma.kycVerification.findMany.mockResolvedValue([verification()]);
      const out: any = await svc().listVerifications(TEST_TENANT_ID, {} as any);
      expect(out[0].documentNumber).toBe('XXXX-XXXX-0124');
      expect(JSON.stringify(out)).not.toContain(RAW_AADHAAR);
      expect(JSON.stringify(out)).not.toContain(RAW_PAN);
    });

    it('getExpiringVerifications masks PAN document numbers', async () => {
      prisma.kycVerification.findMany.mockResolvedValue([
        { ...verification(), verificationType: 'PAN', documentNumber: RAW_PAN },
      ]);
      const out: any = await svc().getExpiringVerifications(TEST_TENANT_ID, 30);
      expect(out[0].documentNumber).not.toBe(RAW_PAN);
      expect(JSON.stringify(out)).not.toContain(RAW_PAN);
    });

    it('verifyAadhaar without a customer does not echo the full number', async () => {
      const provider: any = {
        verifyAadhaar: vi.fn().mockResolvedValue({ verified: true, source: 'cashfree' }),
      };
      const out: any = await new IndiaKycService(prisma, provider).verifyAadhaar(TEST_TENANT_ID, TEST_USER_ID, {
        aadhaarNumber: RAW_AADHAAR,
      });
      expect(out.documentNumber).toBe('XXXX-XXXX-0124');
      expect(JSON.stringify(out)).not.toContain(RAW_AADHAAR);
    });
  });

  describe('schemes', () => {
    it('getKittyScheme masks member customers', async () => {
      prisma.kittyScheme.findFirst.mockResolvedValue({
        id: 's-1',
        members: [{ id: 'm-1', customer: customerRow(), installments: [] }],
      });
      expectMasked(await new IndiaSchemeService(prisma).getKittyScheme(TEST_TENANT_ID, 's-1'));
    });

    it('getGoldSavingsScheme masks member customers', async () => {
      prisma.goldSavingsScheme.findFirst.mockResolvedValue({
        id: 's-1',
        members: [{ id: 'm-1', customer: customerRow(), installments: [] }],
      });
      expectMasked(await new IndiaSchemeService(prisma).getGoldSavingsScheme(TEST_TENANT_ID, 's-1'));
    });
  });
});
