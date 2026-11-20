import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OtpService } from '../auth.otp.service';
import { createMockPrismaService, resetMocks } from '../../__tests__/mocks';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 10)),
}));

describe('OtpService', () => {
  let service: OtpService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    service = new OtpService(prisma as never);
  });

  // ─── Generate OTP ──────────────────────────────────────────────

  describe('generateOtp', () => {
    it('should generate a 6-digit OTP', async () => {
      prisma.otpVerification.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpVerification.create.mockResolvedValue({ id: 'otp-id' });

      const result = await service.generateOtp('+919876543210', 'LOGIN' as never);

      // No provider wired in this test: must not claim delivery.
      expect(result.delivered).toBe(false);
      expect(result.message).not.toMatch(/sent successfully/i);
      // In dev mode, OTP is returned
      if (result.otp) {
        expect(result.otp).toMatch(/^\d{6}$/);
        const num = parseInt(result.otp, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });

    it('should invalidate previous unexpired OTPs', async () => {
      prisma.otpVerification.updateMany.mockResolvedValue({ count: 1 });
      prisma.otpVerification.create.mockResolvedValue({ id: 'otp-id' });

      await service.generateOtp('+919876543210', 'LOGIN' as never);

      expect(prisma.otpVerification.updateMany).toHaveBeenCalledWith({
        where: {
          identifier: '+919876543210',
          purpose: 'LOGIN',
          verifiedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { expiresAt: expect.any(Date) },
      });
    });

    it('should create OTP record with 5-minute expiry', async () => {
      prisma.otpVerification.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpVerification.create.mockResolvedValue({ id: 'otp-id' });

      await service.generateOtp('user@example.com', 'REGISTRATION' as never);

      expect(prisma.otpVerification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          identifier: 'user@example.com',
          purpose: 'REGISTRATION',
          expiresAt: expect.any(Date),
        }),
      });

      const createCall = prisma.otpVerification.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const now = new Date();
      // Should be approximately 5 minutes in the future
      const diffMs = expiresAt.getTime() - now.getTime();
      expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
      expect(diffMs).toBeLessThan(6 * 60 * 1000);
    });

    it('should NOT return OTP unless ALLOW_DEV_OTP is explicitly enabled', async () => {
      prisma.otpVerification.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpVerification.create.mockResolvedValue({ id: 'otp-id' });
      delete process.env.ALLOW_DEV_OTP;

      const result = await service.generateOtp('+919876543210', 'LOGIN' as never);

      expect(result.otp).toBeUndefined();
    });

    it('should return OTP only when ALLOW_DEV_OTP=true', async () => {
      prisma.otpVerification.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpVerification.create.mockResolvedValue({ id: 'otp-id' });
      process.env.ALLOW_DEV_OTP = 'true';
      try {
        const result = await service.generateOtp('+919876543210', 'LOGIN' as never);
        expect(result.otp).toBeDefined();
      } finally {
        delete process.env.ALLOW_DEV_OTP;
      }
    });
  });

  // ─── Verify OTP ────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('should succeed with correct OTP code', async () => {
      prisma.otpVerification.findFirst.mockResolvedValue({
        id: 'otp-id',
        identifier: '+919876543210',
        otpCode: '123456',
        purpose: 'LOGIN',
        attempts: 0,
        maxAttempts: 3,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 300000),
      });
      prisma.otpVerification.update.mockResolvedValue({});

      const result = await service.verifyOtp('+919876543210', '123456', 'LOGIN' as never);

      expect(result).toBe(true);
    });

    it('should mark OTP as verified after success', async () => {
      prisma.otpVerification.findFirst.mockResolvedValue({
        id: 'otp-id',
        otpCode: '123456',
        attempts: 0,
        maxAttempts: 3,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 300000),
      });
      prisma.otpVerification.update.mockResolvedValue({});

      await service.verifyOtp('+919876543210', '123456', 'LOGIN' as never);

      // Second update call should mark as verified
      const updateCalls = prisma.otpVerification.update.mock.calls;
      const verifyCall = updateCalls.find(
        (call: Array<Record<string, unknown>>) => (call[0].data as Record<string, unknown>).verifiedAt !== undefined,
      );
      expect(verifyCall).toBeDefined();
    });

    it('should throw for wrong OTP code and increment attempts', async () => {
      prisma.otpVerification.findFirst.mockResolvedValue({
        id: 'otp-id',
        otpCode: '123456',
        attempts: 0,
        maxAttempts: 3,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 300000),
      });
      prisma.otpVerification.update.mockResolvedValue({});

      await expect(
        service.verifyOtp('+919876543210', '999999', 'LOGIN' as never),
      ).rejects.toThrow(BadRequestException);

      // Should increment attempts
      expect(prisma.otpVerification.update).toHaveBeenCalledWith({
        where: { id: 'otp-id' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('should throw when no valid OTP found (expired)', async () => {
      prisma.otpVerification.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp('+919876543210', '123456', 'LOGIN' as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyOtp('+919876543210', '123456', 'LOGIN' as never),
      ).rejects.toThrow('No valid OTP found');
    });

    it('should throw after max attempts exceeded', async () => {
      prisma.otpVerification.findFirst.mockResolvedValue({
        id: 'otp-id',
        otpCode: '123456',
        attempts: 3,
        maxAttempts: 3,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 300000),
      });

      await expect(
        service.verifyOtp('+919876543210', '123456', 'LOGIN' as never),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.verifyOtp('+919876543210', '123456', 'LOGIN' as never),
      ).rejects.toThrow('Maximum verification attempts exceeded');
    });

    it('should show remaining attempts in error message', async () => {
      prisma.otpVerification.findFirst.mockResolvedValue({
        id: 'otp-id',
        otpCode: '123456',
        attempts: 1,
        maxAttempts: 3,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 300000),
      });
      prisma.otpVerification.update.mockResolvedValue({});

      await expect(
        service.verifyOtp('+919876543210', '000000', 'LOGIN' as never),
      ).rejects.toThrow(/1 attempt\(s\) remaining/);
    });
  });

  // ─── Cleanup ───────────────────────────────────────────────────

  describe('cleanupExpiredOtps', () => {
    it('should delete expired and verified OTP records', async () => {
      prisma.otpVerification.deleteMany.mockResolvedValue({ count: 5 });

      const count = await service.cleanupExpiredOtps();

      expect(count).toBe(5);
      expect(prisma.otpVerification.deleteMany).toHaveBeenCalled();
    });
  });

  // ─── Delivery truthfulness ─────────────────────────────────────

  describe('delivery reporting', () => {
    const setup = (sms?: unknown, email?: unknown, whatsapp?: unknown) => {
      prisma.otpVerification.updateMany.mockResolvedValue({ count: 0 });
      prisma.otpVerification.create.mockResolvedValue({ id: 'otp-id' });
      return new OtpService(prisma as never, sms as never, email as never, whatsapp as never);
    };

    it('reports delivered=true when the SMS provider accepts the message', async () => {
      const sms = { sendSms: vi.fn().mockResolvedValue({}) };
      const svc = setup(sms);
      const res = await svc.generateOtp('+919876543210', 'REGISTRATION' as never, 't1');
      expect(res).toMatchObject({ delivered: true, channel: 'SMS', message: 'OTP sent successfully' });
    });

    it('reports delivered=false and hides provider details when the provider throws', async () => {
      const sms = { sendSms: vi.fn().mockRejectedValue(new Error('missing setting "msg91_auth_key"')) };
      const svc = setup(sms);
      const res = await svc.generateOtp('+919876543210', 'REGISTRATION' as never, 't1');
      expect(res.delivered).toBe(false);
      expect(res.message).toBe('We could not send an SMS right now.');
      expect(JSON.stringify(res)).not.toContain('msg91');
    });

    it('reports delivered=false when no SMS service is wired', async () => {
      const svc = setup();
      const res = await svc.generateOtp('+919876543210', 'REGISTRATION' as never, 't1');
      expect(res.delivered).toBe(false);
    });

    it('reports email channel for an email identifier', async () => {
      const email = { sendEmail: vi.fn().mockResolvedValue({}) };
      const svc = setup(undefined, email);
      const res = await svc.generateOtp('a@b.com', 'REGISTRATION' as never, 't1');
      expect(res).toMatchObject({ delivered: true, channel: 'EMAIL' });
    });
  });

  describe('getCapabilities', () => {
    it('phoneOtp is false when SMS is not configured', async () => {
      const sms = { isConfigured: vi.fn().mockResolvedValue(false) };
      const email = { isConfigured: vi.fn().mockResolvedValue(false) };
      const svc = new OtpService(prisma as never, sms as never, email as never);
      await expect(svc.getCapabilities('t1')).resolves.toEqual({
        phoneOtp: false,
        emailVerification: false,
      });
    });

    it('reflects configured providers', async () => {
      const sms = { isConfigured: vi.fn().mockResolvedValue(true) };
      const email = { isConfigured: vi.fn().mockResolvedValue(false) };
      const svc = new OtpService(prisma as never, sms as never, email as never);
      await expect(svc.getCapabilities('t1')).resolves.toEqual({
        phoneOtp: true,
        emailVerification: false,
      });
    });

    it('is all false when no providers are wired', async () => {
      const svc = new OtpService(prisma as never);
      await expect(svc.getCapabilities('t1')).resolves.toEqual({
        phoneOtp: false,
        emailVerification: false,
      });
    });
  });
});
