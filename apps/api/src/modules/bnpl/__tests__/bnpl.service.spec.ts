import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createMockPrismaService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
import { BnplService } from '../bnpl.service';

describe('BnplService', () => {
  let service: BnplService; let prisma: ReturnType<typeof createMockPrismaService>;
  let emiService: any;
  const { tenantId, userId } = mockTenantContext;
  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    ['bnplProvider','bnplTransaction','emiPlan','emiSchedule'].forEach(m => { (prisma as any)[m] = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), aggregate: vi.fn() }; });
    ['onlineOrder'].forEach(m => { (prisma as any)[m] = { findFirst: vi.fn() }; });
    emiService = { calculateEmi: vi.fn().mockReturnValue({ monthlyEmiPaise: 10000, totalInterestPaise: 2000, totalPayablePaise: 52000 }), generateEmiSchedule: vi.fn().mockReturnValue([{ installmentNumber: 1, dueDate: new Date(), amountPaise: 10000, principalPaise: 9000, interestPaise: 1000 }]) };
    service = new BnplService(prisma as never, emiService);
  });

  describe('checkEligibility', () => {
    it('should return eligible providers and EMI plans', async () => {
      (prisma as any).bnplProvider.findMany.mockResolvedValue([{ id: 'bp-1', providerName: 'SIMPL', displayName: 'Simpl', maxOrderPaise: 5000000n, supportedTenures: [3, 6], processingFeePct: 0 }]);
      (prisma as any).emiPlan.findMany.mockResolvedValue([{ id: 'ep-1', bankName: 'HDFC', tenure: 6, interestRatePct: 0, isNoCostEmi: true, processingFeePaise: 0n }]);
      const r = await service.checkEligibility(tenantId, 'c1', 100000);
      expect(r.eligible).toBe(true);
      expect(r.providers).toHaveLength(1);
      expect(r.emiPlans).toHaveLength(1);
    });
    it('should return not eligible when no providers match', async () => {
      (prisma as any).bnplProvider.findMany.mockResolvedValue([]);
      (prisma as any).emiPlan.findMany.mockResolvedValue([]);
      const r = await service.checkEligibility(tenantId, 'c1', 100000);
      expect(r.eligible).toBe(false);
    });
  });

  describe('initiateBnpl', () => {
    it('should create transaction with EMI schedule', async () => {
      (prisma as any).bnplProvider.findFirst.mockResolvedValue({ id: 'bp-1', minOrderPaise: 1000n, maxOrderPaise: 10000000n, supportedTenures: [3] });
      (prisma as any).onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', totalPaise: 500000n });
      (prisma as any).bnplTransaction.create.mockResolvedValue({ id: 'bt-1', tenantId, orderId: 'o-1', customerId: 'c1', providerName: 'SIMPL', planId: null, orderAmountPaise: 500000n, emiAmountPaise: 10000n, tenure: 3, interestPaise: 2000n, processingFeePaise: 0n, totalPayablePaise: 52000n, status: 'INITIATED', externalTransactionId: null, approvedAt: null, nextDueDate: null, completedAt: null, createdAt: new Date(), updatedAt: new Date() });
      (prisma as any).emiSchedule.create.mockResolvedValue({});
      const r = await service.initiateBnpl(tenantId, userId, 'c1', { orderId: 'o-1', providerName: 'SIMPL' } as any);
      expect(r.status).toBe('INITIATED');
    });
    it('should throw NotFoundException for missing provider', async () => {
      (prisma as any).bnplProvider.findFirst.mockResolvedValue(null);
      await expect(service.initiateBnpl(tenantId, userId, 'c1', { orderId: 'o-1', providerName: 'BAD' } as any)).rejects.toThrow(NotFoundException);
    });
    it('should throw NotFoundException for missing order', async () => {
      (prisma as any).bnplProvider.findFirst.mockResolvedValue({ id: 'bp-1' });
      (prisma as any).onlineOrder.findFirst.mockResolvedValue(null);
      await expect(service.initiateBnpl(tenantId, userId, 'c1', { orderId: 'x', providerName: 'SIMPL' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('handleBnplCallback', () => {
    const storedTx = { id: 'bt-1', tenantId, orderId: 'o-1', customerId: 'c1', providerName: 'SIMPL', status: 'INITIATED', externalTransactionId: 'ext-1' };

    it('should update transaction status on callback, scoped to the stored transaction tenant', async () => {
      (prisma as any).bnplTransaction.findMany.mockResolvedValue([storedTx]);
      (prisma as any).emiSchedule.findFirst.mockResolvedValue({ id: 'es-1', dueDate: new Date() });
      (prisma as any).emiSchedule.update.mockResolvedValue({});
      (prisma as any).bnplTransaction.update.mockResolvedValue({ id: 'bt-1', tenantId, orderId: 'o-1', customerId: 'c1', providerName: 'SIMPL', planId: null, orderAmountPaise: 500000n, emiAmountPaise: 10000n, tenure: 3, interestPaise: 2000n, processingFeePaise: 0n, totalPayablePaise: 52000n, status: 'APPROVED', externalTransactionId: 'ext-1', approvedAt: new Date(), nextDueDate: new Date(), completedAt: null, createdAt: new Date(), updatedAt: new Date() });
      const r = await service.handleBnplCallback('SIMPL', { transactionId: 'ext-1', status: 'APPROVED' });
      expect(r.status).toBe('APPROVED');
      expect((prisma as any).bnplTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { externalTransactionId: 'ext-1', providerName: 'SIMPL' },
      }));
    });
    it('should throw NotFound if no stored transaction matches', async () => {
      (prisma as any).bnplTransaction.findMany.mockResolvedValue([]);
      await expect(service.handleBnplCallback('SIMPL', { transactionId: 'x', status: 'APPROVED' })).rejects.toThrow(NotFoundException);
    });
    it('should reject an ambiguous external id instead of picking a tenant', async () => {
      (prisma as any).bnplTransaction.findMany.mockResolvedValue([storedTx, { ...storedTx, id: 'bt-2', tenantId: 'other' }]);
      await expect(service.handleBnplCallback('SIMPL', { transactionId: 'ext-1', status: 'APPROVED' })).rejects.toThrow(ConflictException);
      expect((prisma as any).bnplTransaction.update).not.toHaveBeenCalled();
    });
    it('should throw if no transactionId', async () => {
      await expect(service.handleBnplCallback('SIMPL', { status: 'APPROVED' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyCallbackSignature', () => {
    const body = Buffer.from('{"transactionId":"ext-1","status":"APPROVED"}', 'utf8');
    const payload = { transactionId: 'ext-1', status: 'APPROVED' };
    const sign = (secret: string, data: Buffer) => createHmac('sha256', secret).update(data).digest('hex');
    const original = { secret: process.env.BNPL_WEBHOOK_SECRET, env: process.env.NODE_ENV };

    afterEach(() => {
      process.env.BNPL_WEBHOOK_SECRET = original.secret;
      process.env.NODE_ENV = original.env;
    });

    it('accepts a correct HMAC of the raw body', () => {
      process.env.BNPL_WEBHOOK_SECRET = 'whsec-test';
      process.env.NODE_ENV = 'production';
      expect(() => service.verifyCallbackSignature(body, payload, sign('whsec-test', body))).not.toThrow();
    });
    it('rejects a wrong signature', () => {
      process.env.BNPL_WEBHOOK_SECRET = 'whsec-test';
      process.env.NODE_ENV = 'production';
      expect(() => service.verifyCallbackSignature(body, payload, sign('wrong', body))).toThrow(UnauthorizedException);
    });
    it('rejects a missing signature header', () => {
      process.env.BNPL_WEBHOOK_SECRET = 'whsec-test';
      expect(() => service.verifyCallbackSignature(body, payload, undefined)).toThrow(UnauthorizedException);
    });
    it('rejects in production when the secret is unset', () => {
      delete process.env.BNPL_WEBHOOK_SECRET;
      process.env.NODE_ENV = 'production';
      expect(() => service.verifyCallbackSignature(body, payload, sign('x', body))).toThrow(UnauthorizedException);
    });
    it('rejects in production when the raw body is unavailable', () => {
      process.env.BNPL_WEBHOOK_SECRET = 'whsec-test';
      process.env.NODE_ENV = 'production';
      expect(() => service.verifyCallbackSignature(undefined, payload, sign('whsec-test', body))).toThrow(UnauthorizedException);
    });
  });

  describe('getTransaction', () => {
    it('should return transaction with schedule', async () => {
      (prisma as any).bnplTransaction.findFirst.mockResolvedValue({ id: 'bt-1', tenantId, orderId: 'o-1', customerId: 'c1', providerName: 'SIMPL', planId: null, orderAmountPaise: 500000n, emiAmountPaise: 10000n, tenure: 3, interestPaise: 2000n, processingFeePaise: 0n, totalPayablePaise: 52000n, status: 'ACTIVE', externalTransactionId: null, approvedAt: null, nextDueDate: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(), emiSchedule: [{ id: 'es-1', transactionId: 'bt-1', installmentNumber: 1, dueDate: new Date(), amountPaise: 10000n, principalPaise: 9000n, interestPaise: 1000n, status: 'DUE', paidAt: null, paidAmountPaise: null, lateFeePaise: 0n }] });
      const r = await service.getTransaction(tenantId, 'bt-1');
      expect(r.schedule).toHaveLength(1);
    });
    it('should throw NotFoundException', async () => {
      (prisma as any).bnplTransaction.findFirst.mockResolvedValue(null);
      await expect(service.getTransaction(tenantId, 'x')).rejects.toThrow(NotFoundException);
    });
  });
});
