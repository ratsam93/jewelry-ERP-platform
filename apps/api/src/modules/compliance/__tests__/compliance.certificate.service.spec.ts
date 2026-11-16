import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComplianceCertificateService } from '../compliance.certificate.service';
import { createMockPrismaService, TEST_TENANT_ID, TEST_USER_ID, resetAllMocks } from '../../../__tests__/setup';

describe('ComplianceCertificateService (Unit)', () => {
  let service: ComplianceCertificateService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    (mockPrisma as any).gemstoneCertificate = {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    };
    (mockPrisma as any).product = {
      ...mockPrisma.product,
      count: vi.fn(),
      findMany: vi.fn(),
    };
    service = new ComplianceCertificateService(mockPrisma as any);
    resetAllMocks(mockPrisma);
  });

  const baseCertInput = {
    productId: 'prod-1',
    certificateNumber: 'GIA-12345678',
    issuingLab: 'GIA',
    stoneType: 'DIAMOND',
    caratWeight: 1.5,
    color: 'D',
    clarity: 'VVS1',
    cut: 'Excellent',
    shape: 'Round',
  };

  // ─── create ─────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a gemstone certificate', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);
      (mockPrisma as any).gemstoneCertificate.create.mockResolvedValue({
        id: 'cert-1',
        ...baseCertInput,
        product: { id: 'prod-1', sku: 'DIA-001', name: 'Diamond Solitaire' },
      });

      const result = await service.create(TEST_TENANT_ID, TEST_USER_ID, baseCertInput as any);
      expect(result.certificateNumber).toBe('GIA-12345678');
      expect(result.issuingLab).toBe('GIA');
    });

    it('rejects duplicate certificate number within tenant', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(TEST_TENANT_ID, TEST_USER_ID, baseCertInput as any),
      ).rejects.toThrow('already exists');
    });

    it('allows different lab types (IGI)', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);
      (mockPrisma as any).gemstoneCertificate.create.mockResolvedValue({
        id: 'cert-2',
        ...baseCertInput,
        issuingLab: 'IGI',
        certificateNumber: 'IGI-999',
        product: { id: 'prod-1', sku: 'S1', name: 'Stone' },
      });

      const result = await service.create(TEST_TENANT_ID, TEST_USER_ID, {
        ...baseCertInput,
        issuingLab: 'IGI',
        certificateNumber: 'IGI-999',
      } as any);
      expect(result.issuingLab).toBe('IGI');
    });

    it('allows HRD lab type', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);
      (mockPrisma as any).gemstoneCertificate.create.mockResolvedValue({
        id: 'cert-3',
        ...baseCertInput,
        issuingLab: 'HRD',
        certificateNumber: 'HRD-555',
        product: { id: 'prod-1', sku: 'S1', name: 'Stone' },
      });

      const result = await service.create(TEST_TENANT_ID, TEST_USER_ID, {
        ...baseCertInput,
        issuingLab: 'HRD',
        certificateNumber: 'HRD-555',
      } as any);
      expect(result.issuingLab).toBe('HRD');
    });
  });

  // ─── update ─────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a certificate', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue({ id: 'cert-1' });
      (mockPrisma as any).gemstoneCertificate.update.mockResolvedValue({
        id: 'cert-1',
        color: 'E',
        product: { id: 'prod-1', sku: 'S1', name: 'Stone' },
      });

      const result = await service.update(TEST_TENANT_ID, TEST_USER_ID, 'cert-1', { color: 'E' } as any);
      expect(result.color).toBe('E');
    });

    it('throws NotFoundException for missing certificate', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TEST_TENANT_ID, TEST_USER_ID, 'nonexistent', {} as any),
      ).rejects.toThrow('not found');
    });
  });

  // ─── findByCertificateNumber ────────────────────────────────────

  describe('findByCertificateNumber', () => {
    it('returns certificate by number', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue({
        id: 'cert-1',
        certificateNumber: 'GIA-12345678',
        product: { id: 'prod-1', sku: 'S1', name: 'Stone' },
      });

      const result = await service.findByCertificateNumber(TEST_TENANT_ID, 'GIA-12345678');
      expect(result?.certificateNumber).toBe('GIA-12345678');
    });

    it('returns null when certificate not found', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);

      const result = await service.findByCertificateNumber(TEST_TENANT_ID, 'NONEXIST');
      expect(result).toBeNull();
    });
  });

  // ─── verifyCertificate ──────────────────────────────────────────

  describe('verifyCertificate', () => {
    const certRow = (lab: string, number: string) => ({
      id: 'cert-1',
      certificateNumber: number,
      issuingLab: lab,
      isVerified: false,
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('never marks a cert verified without lab credentials (GIA)', async () => {
      vi.stubEnv('GIA_API_URL', '');
      vi.stubEnv('GIA_API_KEY', '');
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(certRow('GIA', 'GIA-99999999'));

      const result = await service.verifyCertificate(TEST_TENANT_ID, TEST_USER_ID, 'cert-1');

      expect(result.status).toBe('PENDING_VERIFICATION');
      expect(result.verificationMode).toBe('MANUAL');
      expect(result.isValid).toBe(false);
      expect(result.verifiedAt).toBeNull();
      expect((mockPrisma as any).gemstoneCertificate.update).not.toHaveBeenCalled();
    });

    it('treats HRD and SGL as manual-verification labs', async () => {
      for (const lab of ['HRD', 'SGL']) {
        (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(certRow(lab, `${lab}-1`));
        const result = await service.verifyCertificate(TEST_TENANT_ID, TEST_USER_ID, 'cert-1');
        expect(result.status).toBe('PENDING_VERIFICATION');
        expect(result.verificationMode).toBe('MANUAL');
        expect(result.isValid).toBe(false);
      }
      expect((mockPrisma as any).gemstoneCertificate.update).not.toHaveBeenCalled();
    });

    it('marks VERIFIED via the lab API when the lab confirms the cert', async () => {
      vi.stubEnv('IGI_API_URL', 'https://igi.example.test');
      vi.stubEnv('IGI_API_KEY', 'test-key');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true }) }));
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(certRow('IGI', 'IGI-1'));
      (mockPrisma as any).gemstoneCertificate.update.mockResolvedValue({
        id: 'cert-1',
        certificateNumber: 'IGI-1',
        issuingLab: 'IGI',
        isVerified: true,
        verifiedAt: new Date(),
      });

      const result = await service.verifyCertificate(TEST_TENANT_ID, TEST_USER_ID, 'cert-1');

      expect(result.status).toBe('VERIFIED');
      expect(result.verificationMode).toBe('API');
      expect(result.isValid).toBe(true);
      expect(result.source).toBe('IGI-API');
    });

    it('rejects and leaves the record unverified when the lab does not confirm', async () => {
      vi.stubEnv('GIA_API_URL', 'https://gia.example.test');
      vi.stubEnv('GIA_API_KEY', 'test-key');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: false, message: 'unknown' }) }));
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(certRow('GIA', 'GIA-404'));

      await expect(
        service.verifyCertificate(TEST_TENANT_ID, TEST_USER_ID, 'cert-1'),
      ).rejects.toThrow('could not verify');
      expect((mockPrisma as any).gemstoneCertificate.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing certificate', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyCertificate(TEST_TENANT_ID, TEST_USER_ID, 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  // ─── manualVerify ───────────────────────────────────────────────

  describe('manualVerify', () => {
    it('records verifier (updatedBy) and verification date', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue({ id: 'cert-1', certificateNumber: 'HRD-9' });
      const verifiedAt = new Date('2026-11-16T10:00:00Z');
      (mockPrisma as any).gemstoneCertificate.update.mockResolvedValue({
        id: 'cert-1',
        certificateNumber: 'HRD-9',
        issuingLab: 'HRD',
        isVerified: true,
        verifiedAt,
      });

      const result = await service.manualVerify(TEST_TENANT_ID, TEST_USER_ID, 'cert-1');

      const call = (mockPrisma as any).gemstoneCertificate.update.mock.calls[0][0];
      expect(call.data.isVerified).toBe(true);
      expect(call.data.updatedBy).toBe(TEST_USER_ID);
      expect(call.data.verifiedAt).toBeInstanceOf(Date);
      expect(result.verificationMode).toBe('MANUAL');
      expect(result.verifiedBy).toBe(TEST_USER_ID);
      expect(result.verifiedAt).toEqual(verifiedAt);
    });

    it('throws NotFoundException for missing certificate', async () => {
      (mockPrisma as any).gemstoneCertificate.findFirst.mockResolvedValue(null);

      await expect(
        service.manualVerify(TEST_TENANT_ID, TEST_USER_ID, 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  // ─── getCertifiedStonesPercent ──────────────────────────────────

  describe('getCertifiedStonesPercent', () => {
    it('calculates percentage of certified stones', async () => {
      (mockPrisma as any).product.count.mockResolvedValue(50);
      (mockPrisma as any).gemstoneCertificate.count.mockResolvedValue(30);

      const result = await service.getCertifiedStonesPercent(TEST_TENANT_ID);
      expect(result).toBe(60);
    });

    it('returns 100% when no stone products exist', async () => {
      (mockPrisma as any).product.count.mockResolvedValue(0);
      (mockPrisma as any).gemstoneCertificate.count.mockResolvedValue(0);

      const result = await service.getCertifiedStonesPercent(TEST_TENANT_ID);
      expect(result).toBe(100);
    });
  });

  // ─── list ───────────────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated results with filters', async () => {
      (mockPrisma as any).gemstoneCertificate.findMany.mockResolvedValue([]);
      (mockPrisma as any).gemstoneCertificate.count.mockResolvedValue(0);

      const result = await service.list(TEST_TENANT_ID, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        issuingLab: 'GIA',
      });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
