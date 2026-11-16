import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { ComplianceTrpcRouter } from '../compliance.trpc';

describe('ComplianceTrpcRouter (procedure coverage)', () => {
  const trpc = new TrpcService();

  const huidService = {
    list: vi.fn(),
    findById: vi.fn(),
    findByProduct: vi.fn(),
    register: vi.fn(),
    bulkRegister: vi.fn(),
    verify: vi.fn(),
    enforceHuidOnSale: vi.fn(),
    getCoverageReport: vi.fn(),
  };
  const hallmarkService = {
    listCenters: vi.fn(),
    getCenterById: vi.fn(),
    createCenter: vi.fn(),
    updateCenter: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
    createSubmission: vi.fn(),
    recordResults: vi.fn(),
    getPendingCount: vi.fn(),
  };
  const certificateService = {
    list: vi.fn(),
    findById: vi.fn(),
    findByCertificateNumber: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    verifyCertificate: vi.fn(),
    manualVerify: vi.fn(),
    getCertifiedStonesPercent: vi.fn(),
  };
  const traceabilityService = {
    recordEvent: vi.fn(),
    getChainForProduct: vi.fn(),
    searchByProduct: vi.fn(),
  };
  const documentService = {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    revoke: vi.fn(),
    getExpiringCount: vi.fn(),
  };
  const insuranceService = {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getCoverageSummary: vi.fn(),
  };
  const auditService = {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    startAudit: vi.fn(),
    recordFindings: vi.fn(),
    resolve: vi.fn(),
    completeAudit: vi.fn(),
    getUpcomingAudits: vi.fn(),
  };

  const routerInstance = new ComplianceTrpcRouter(
    trpc,
    huidService as never,
    hallmarkService as never,
    certificateService as never,
    traceabilityService as never,
    documentService as never,
    insuranceService as never,
    auditService as never,
  );

  const staffCtx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };
  const caller = routerInstance.router.createCaller(staffCtx);

  // Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
  const PRODUCT_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const CENTER_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const LOCATION_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const SUBMISSION_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
  const ITEM_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';
  const ENTITY_ID = '5a6b7c8d-9e0f-4a1b-9c2d-4e5f6a7b8c9d';
  const CERT_ID = '6b7c8d9e-0f1a-4b2c-8d3e-5f6a7b8c9d0e';
  const DOC_ID = '7c8d9e0f-1a2b-4c3d-9e4f-6a7b8c9d0e1f';
  const POLICY_ID = '8d9e0f1a-2b3c-4d4e-8f5a-7b8c9d0e1f2a';
  const AUDIT_ID = '9e0f1a2b-3c4d-4e5f-9a6b-8c9d0e1f2a3b';

  const huidInput = {
    productId: PRODUCT_ID,
    huidNumber: 'AB12CD',
    articleType: 'RING',
    metalType: 'GOLD',
    purityFineness: 916,
    weightMg: 5000,
  };

  const hallmarkCenterInput = { centerCode: 'HC01', name: 'Mumbai Assay Centre' };

  const submissionInput = {
    hallmarkCenterId: CENTER_ID,
    locationId: LOCATION_ID,
    items: [{ productId: PRODUCT_ID, declaredPurity: 916 }],
  };

  const certificateInput = {
    productId: PRODUCT_ID,
    certificateNumber: 'GIA-123456',
    issuingLab: 'GIA' as const,
    stoneType: 'DIAMOND',
    caratWeight: 200,
  };

  const custodyInput = { productId: PRODUCT_ID, eventType: 'SOURCED' as const };

  const documentInput = { documentType: 'BIS_CERTIFICATE' as const, documentNumber: 'BIS-001' };

  const insuranceInput = {
    policyNumber: 'POL-1',
    provider: 'ICICI Lombard',
    coverageType: 'ALL_RISK' as const,
    coveredValuePaise: 10000000,
    premiumPaise: 250000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };

  const auditInput = {
    auditType: 'INTERNAL' as const,
    auditDate: '2026-03-01',
    auditorName: 'A. Sharma',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── HUID ───────────────────────────────────────────────
  describe('huid', () => {
    it('list delegates with tenant and parsed pagination input', async () => {
      huidService.list.mockResolvedValue({ items: [], total: 0 });
      const result = await caller.huid.list({ page: 2, limit: 10, status: 'ACTIVE', search: 'ring' });
      expect(huidService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 2, limit: 10, status: 'ACTIVE', search: 'ring', sortOrder: 'desc' }),
      );
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('list applies pagination defaults when called with empty input', async () => {
      huidService.list.mockResolvedValue({ items: [], total: 0 });
      await caller.huid.list({});
      expect(huidService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1, limit: 20, sortOrder: 'desc' }),
      );
    });

    it('list rejects an invalid status enum', async () => {
      await expect(caller.huid.list({ status: 'BOGUS' as never })).rejects.toThrow();
    });

    it('getById delegates findById with tenant and id', async () => {
      huidService.findById.mockResolvedValue({ id: ENTITY_ID });
      const result = await caller.huid.getById({ id: ENTITY_ID });
      expect(huidService.findById).toHaveBeenCalledWith('tenant-1', ENTITY_ID);
      expect(result).toEqual({ id: ENTITY_ID });
    });

    it('getById rejects a non-uuid id', async () => {
      await expect(caller.huid.getById({ id: 'nope' })).rejects.toThrow();
    });

    it('getByProduct delegates findByProduct', async () => {
      huidService.findByProduct.mockResolvedValue([{ id: ENTITY_ID }]);
      const result = await caller.huid.getByProduct({ productId: PRODUCT_ID });
      expect(huidService.findByProduct).toHaveBeenCalledWith('tenant-1', PRODUCT_ID);
      expect(result).toEqual([{ id: ENTITY_ID }]);
    });

    it('getByProduct rejects a non-uuid productId', async () => {
      await expect(caller.huid.getByProduct({ productId: '123' })).rejects.toThrow();
    });

    it('register delegates with tenant, user and parsed input', async () => {
      huidService.register.mockResolvedValue({ id: ENTITY_ID, huidNumber: 'AB12CD' });
      const result = await caller.huid.register(huidInput);
      expect(huidService.register).toHaveBeenCalledWith('tenant-1', 'user-1', expect.objectContaining(huidInput));
      expect(result).toEqual({ id: ENTITY_ID, huidNumber: 'AB12CD' });
    });

    it('register rejects a HUID that is not 6 uppercase alphanumerics', async () => {
      await expect(caller.huid.register({ ...huidInput, huidNumber: 'ab12' })).rejects.toThrow();
      expect(huidService.register).not.toHaveBeenCalled();
    });

    it('register rejects non-positive weight', async () => {
      await expect(caller.huid.register({ ...huidInput, weightMg: 0 })).rejects.toThrow();
    });

    it('bulkRegister delegates with tenant, user and items', async () => {
      huidService.bulkRegister.mockResolvedValue({ created: 2 });
      const result = await caller.huid.bulkRegister({ items: [huidInput, { ...huidInput, huidNumber: 'ZZ99YY' }] });
      expect(huidService.bulkRegister).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ huidNumber: 'ZZ99YY' })]) }),
      );
      expect(result).toEqual({ created: 2 });
    });

    it('bulkRegister rejects an empty items array', async () => {
      await expect(caller.huid.bulkRegister({ items: [] })).rejects.toThrow();
    });

    it('verify delegates with the HUID number', async () => {
      huidService.verify.mockResolvedValue({ valid: true });
      const result = await caller.huid.verify({ huidNumber: 'AB12CD' });
      expect(huidService.verify).toHaveBeenCalledWith('tenant-1', 'AB12CD');
      expect(result).toEqual({ valid: true });
    });

    it('verify rejects a malformed HUID', async () => {
      await expect(caller.huid.verify({ huidNumber: 'abc' })).rejects.toThrow();
    });

    it('checkSaleEligibility delegates enforceHuidOnSale', async () => {
      huidService.enforceHuidOnSale.mockResolvedValue({ eligible: true });
      const result = await caller.huid.checkSaleEligibility({ productId: PRODUCT_ID });
      expect(huidService.enforceHuidOnSale).toHaveBeenCalledWith('tenant-1', PRODUCT_ID);
      expect(result).toEqual({ eligible: true });
    });

    it('coverageReport delegates getCoverageReport', async () => {
      huidService.getCoverageReport.mockResolvedValue({ coveragePercent: 75 });
      const result = await caller.huid.coverageReport();
      expect(huidService.getCoverageReport).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ coveragePercent: 75 });
    });
  });

  // ─── Hallmark ───────────────────────────────────────────
  describe('hallmark.centers', () => {
    it('list defaults activeOnly to true when no input is supplied', async () => {
      hallmarkService.listCenters.mockResolvedValue([]);
      await caller.hallmark.centers.list();
      expect(hallmarkService.listCenters).toHaveBeenCalledWith(true);
    });

    it('list forwards activeOnly=false', async () => {
      hallmarkService.listCenters.mockResolvedValue([{ id: CENTER_ID }]);
      const result = await caller.hallmark.centers.list({ activeOnly: false });
      expect(hallmarkService.listCenters).toHaveBeenCalledWith(false);
      expect(result).toEqual([{ id: CENTER_ID }]);
    });

    it('getById delegates getCenterById', async () => {
      hallmarkService.getCenterById.mockResolvedValue({ id: CENTER_ID });
      const result = await caller.hallmark.centers.getById({ id: CENTER_ID });
      expect(hallmarkService.getCenterById).toHaveBeenCalledWith(CENTER_ID);
      expect(result).toEqual({ id: CENTER_ID });
    });

    it('getById rejects a non-uuid id', async () => {
      await expect(caller.hallmark.centers.getById({ id: 'x' })).rejects.toThrow();
    });

    it('create delegates createCenter with parsed input', async () => {
      hallmarkService.createCenter.mockResolvedValue({ id: CENTER_ID });
      const result = await caller.hallmark.centers.create(hallmarkCenterInput);
      expect(hallmarkService.createCenter).toHaveBeenCalledWith(expect.objectContaining(hallmarkCenterInput));
      expect(result).toEqual({ id: CENTER_ID });
    });

    it('create rejects an invalid email', async () => {
      await expect(
        caller.hallmark.centers.create({ ...hallmarkCenterInput, email: 'not-an-email' }),
      ).rejects.toThrow();
    });

    it('update delegates updateCenter with id and partial data', async () => {
      hallmarkService.updateCenter.mockResolvedValue({ id: CENTER_ID, name: 'Renamed' });
      const result = await caller.hallmark.centers.update({ id: CENTER_ID, data: { name: 'Renamed' } });
      expect(hallmarkService.updateCenter).toHaveBeenCalledWith(CENTER_ID, expect.objectContaining({ name: 'Renamed' }));
      expect(result).toEqual({ id: CENTER_ID, name: 'Renamed' });
    });
  });

  describe('hallmark.submissions', () => {
    it('list delegates with tenant and filters', async () => {
      hallmarkService.list.mockResolvedValue({ items: [] });
      await caller.hallmark.submissions.list({ status: 'COMPLETED', hallmarkCenterId: CENTER_ID });
      expect(hallmarkService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'COMPLETED', hallmarkCenterId: CENTER_ID, page: 1 }),
      );
    });

    it('getById delegates findById with tenant and id', async () => {
      hallmarkService.findById.mockResolvedValue({ id: SUBMISSION_ID });
      const result = await caller.hallmark.submissions.getById({ id: SUBMISSION_ID });
      expect(hallmarkService.findById).toHaveBeenCalledWith('tenant-1', SUBMISSION_ID);
      expect(result).toEqual({ id: SUBMISSION_ID });
    });

    it('create delegates createSubmission with tenant and user', async () => {
      hallmarkService.createSubmission.mockResolvedValue({ id: SUBMISSION_ID });
      const result = await caller.hallmark.submissions.create(submissionInput);
      expect(hallmarkService.createSubmission).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ hallmarkCenterId: CENTER_ID, items: [expect.objectContaining({ declaredPurity: 916 })] }),
      );
      expect(result).toEqual({ id: SUBMISSION_ID });
    });

    it('create rejects a submission with no items', async () => {
      await expect(caller.hallmark.submissions.create({ ...submissionInput, items: [] })).rejects.toThrow();
    });

    it('recordResults delegates recordResults with tenant and user', async () => {
      hallmarkService.recordResults.mockResolvedValue({ status: 'COMPLETED' });
      const input = {
        submissionId: SUBMISSION_ID,
        results: [{ itemId: ITEM_ID, status: 'PASSED' as const, testedPurity: 916, huidAssigned: 'AB12CD' }],
      };
      const result = await caller.hallmark.submissions.recordResults(input);
      expect(hallmarkService.recordResults).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ submissionId: SUBMISSION_ID }),
      );
      expect(result).toEqual({ status: 'COMPLETED' });
    });

    it('recordResults rejects an unknown item status', async () => {
      await expect(
        caller.hallmark.submissions.recordResults({
          submissionId: SUBMISSION_ID,
          results: [{ itemId: ITEM_ID, status: 'MAYBE' as never }],
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Certificates ───────────────────────────────────────
  describe('certificates', () => {
    it('list delegates with tenant and parsed input', async () => {
      certificateService.list.mockResolvedValue({ items: [] });
      await caller.certificates.list({ issuingLab: 'IGI', isVerified: true });
      expect(certificateService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ issuingLab: 'IGI', isVerified: true }),
      );
    });

    it('getById delegates findById', async () => {
      certificateService.findById.mockResolvedValue({ id: CERT_ID });
      const result = await caller.certificates.getById({ id: CERT_ID });
      expect(certificateService.findById).toHaveBeenCalledWith('tenant-1', CERT_ID);
      expect(result).toEqual({ id: CERT_ID });
    });

    it('findByCertNumber delegates findByCertificateNumber', async () => {
      certificateService.findByCertificateNumber.mockResolvedValue({ certificateNumber: 'GIA-123456' });
      const result = await caller.certificates.findByCertNumber({ certificateNumber: 'GIA-123456' });
      expect(certificateService.findByCertificateNumber).toHaveBeenCalledWith('tenant-1', 'GIA-123456');
      expect(result).toEqual({ certificateNumber: 'GIA-123456' });
    });

    it('create delegates create with tenant and user', async () => {
      certificateService.create.mockResolvedValue({ id: CERT_ID });
      const result = await caller.certificates.create(certificateInput);
      expect(certificateService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ certificateNumber: 'GIA-123456', issuingLab: 'GIA', caratWeight: 200 }),
      );
      expect(result).toEqual({ id: CERT_ID });
    });

    it('create rejects an unsupported issuing lab', async () => {
      await expect(caller.certificates.create({ ...certificateInput, issuingLab: 'XYZ' as never })).rejects.toThrow();
    });

    it('update delegates update with id and partial data', async () => {
      certificateService.update.mockResolvedValue({ id: CERT_ID });
      await caller.certificates.update({ id: CERT_ID, data: { color: 'D' } });
      expect(certificateService.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        CERT_ID,
        expect.objectContaining({ color: 'D' }),
      );
    });

    it('verify delegates verifyCertificate', async () => {
      certificateService.verifyCertificate.mockResolvedValue({ isVerified: true });
      const result = await caller.certificates.verify({ id: CERT_ID });
      expect(certificateService.verifyCertificate).toHaveBeenCalledWith('tenant-1', 'user-1', CERT_ID);
      expect(result).toEqual({ isVerified: true });
    });

    it('manualVerifyCertificate delegates manualVerify', async () => {
      certificateService.manualVerify.mockResolvedValue({ isVerified: true });
      const result = await caller.certificates.manualVerifyCertificate({ id: CERT_ID });
      expect(certificateService.manualVerify).toHaveBeenCalledWith('tenant-1', 'user-1', CERT_ID);
      expect(result).toEqual({ isVerified: true });
    });

    it('verify rejects a non-uuid id', async () => {
      await expect(caller.certificates.verify({ id: 'bad' })).rejects.toThrow();
    });
  });

  // ─── Traceability ───────────────────────────────────────
  describe('traceability', () => {
    it('recordEvent delegates with tenant and user', async () => {
      traceabilityService.recordEvent.mockResolvedValue({ id: ENTITY_ID });
      const result = await caller.traceability.recordEvent(custodyInput);
      expect(traceabilityService.recordEvent).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ productId: PRODUCT_ID, eventType: 'SOURCED' }),
      );
      expect(result).toEqual({ id: ENTITY_ID });
    });

    it('recordEvent rejects an unknown event type', async () => {
      await expect(
        caller.traceability.recordEvent({ productId: PRODUCT_ID, eventType: 'STOLEN' as never }),
      ).rejects.toThrow();
    });

    it('getChain delegates getChainForProduct', async () => {
      traceabilityService.getChainForProduct.mockResolvedValue({ events: [] });
      const result = await caller.traceability.getChain({ productId: PRODUCT_ID });
      expect(traceabilityService.getChainForProduct).toHaveBeenCalledWith('tenant-1', PRODUCT_ID);
      expect(result).toEqual({ events: [] });
    });

    it('search delegates searchByProduct', async () => {
      traceabilityService.searchByProduct.mockResolvedValue([]);
      const result = await caller.traceability.search({ search: 'ring' });
      expect(traceabilityService.searchByProduct).toHaveBeenCalledWith('tenant-1', 'ring');
      expect(result).toEqual([]);
    });

    it('search rejects an empty string', async () => {
      await expect(caller.traceability.search({ search: '' })).rejects.toThrow();
    });
  });

  // ─── Documents ──────────────────────────────────────────
  describe('documents', () => {
    it('list delegates with tenant and parsed input', async () => {
      documentService.list.mockResolvedValue({ items: [] });
      await caller.documents.list({ documentType: 'IMPORT_LICENSE', expiringWithinDays: 15 });
      expect(documentService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ documentType: 'IMPORT_LICENSE', expiringWithinDays: 15 }),
      );
    });

    it('getById delegates findById', async () => {
      documentService.findById.mockResolvedValue({ id: DOC_ID });
      const result = await caller.documents.getById({ id: DOC_ID });
      expect(documentService.findById).toHaveBeenCalledWith('tenant-1', DOC_ID);
      expect(result).toEqual({ id: DOC_ID });
    });

    it('create delegates create with tenant and user', async () => {
      documentService.create.mockResolvedValue({ id: DOC_ID });
      const result = await caller.documents.create(documentInput);
      expect(documentService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ documentType: 'BIS_CERTIFICATE', documentNumber: 'BIS-001' }),
      );
      expect(result).toEqual({ id: DOC_ID });
    });

    it('create rejects an unknown document type', async () => {
      await expect(caller.documents.create({ ...documentInput, documentType: 'NOPE' as never })).rejects.toThrow();
    });

    it('update delegates update with id and partial data', async () => {
      documentService.update.mockResolvedValue({ id: DOC_ID });
      await caller.documents.update({ id: DOC_ID, data: { notes: 'renewed' } });
      expect(documentService.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        DOC_ID,
        expect.objectContaining({ notes: 'renewed' }),
      );
    });

    it('revoke delegates revoke', async () => {
      documentService.revoke.mockResolvedValue({ id: DOC_ID, status: 'REVOKED' });
      const result = await caller.documents.revoke({ id: DOC_ID });
      expect(documentService.revoke).toHaveBeenCalledWith('tenant-1', 'user-1', DOC_ID);
      expect(result).toEqual({ id: DOC_ID, status: 'REVOKED' });
    });
  });

  // ─── Insurance ──────────────────────────────────────────
  describe('insurance', () => {
    it('list delegates with tenant and parsed input', async () => {
      insuranceService.list.mockResolvedValue({ items: [] });
      await caller.insurance.list({ status: 'ACTIVE', coverageType: 'TRANSIT' });
      expect(insuranceService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'ACTIVE', coverageType: 'TRANSIT' }),
      );
    });

    it('getById delegates findById', async () => {
      insuranceService.findById.mockResolvedValue({ id: POLICY_ID });
      const result = await caller.insurance.getById({ id: POLICY_ID });
      expect(insuranceService.findById).toHaveBeenCalledWith('tenant-1', POLICY_ID);
      expect(result).toEqual({ id: POLICY_ID });
    });

    it('create delegates create with tenant and user', async () => {
      insuranceService.create.mockResolvedValue({ id: POLICY_ID });
      const result = await caller.insurance.create(insuranceInput);
      expect(insuranceService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ policyNumber: 'POL-1', coveredValuePaise: 10000000 }),
      );
      expect(result).toEqual({ id: POLICY_ID });
    });

    it('create rejects a non-positive premium', async () => {
      await expect(caller.insurance.create({ ...insuranceInput, premiumPaise: 0 })).rejects.toThrow();
    });

    it('update delegates update with id and partial data', async () => {
      insuranceService.update.mockResolvedValue({ id: POLICY_ID });
      await caller.insurance.update({ id: POLICY_ID, data: { provider: 'Bajaj Allianz' } });
      expect(insuranceService.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        POLICY_ID,
        expect.objectContaining({ provider: 'Bajaj Allianz' }),
      );
    });

    it('coverageSummary delegates getCoverageSummary', async () => {
      insuranceService.getCoverageSummary.mockResolvedValue({ totalCoveredPaise: 10000000 });
      const result = await caller.insurance.coverageSummary();
      expect(insuranceService.getCoverageSummary).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ totalCoveredPaise: 10000000 });
    });
  });

  // ─── Audits ─────────────────────────────────────────────
  describe('audits', () => {
    it('list delegates with tenant and parsed input', async () => {
      auditService.list.mockResolvedValue({ items: [] });
      await caller.audits.list({ auditType: 'BIS', status: 'SCHEDULED' });
      expect(auditService.list).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ auditType: 'BIS', status: 'SCHEDULED' }),
      );
    });

    it('getById delegates findById', async () => {
      auditService.findById.mockResolvedValue({ id: AUDIT_ID });
      const result = await caller.audits.getById({ id: AUDIT_ID });
      expect(auditService.findById).toHaveBeenCalledWith('tenant-1', AUDIT_ID);
      expect(result).toEqual({ id: AUDIT_ID });
    });

    it('create delegates create with tenant and user', async () => {
      auditService.create.mockResolvedValue({ id: AUDIT_ID });
      const result = await caller.audits.create(auditInput);
      expect(auditService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ auditType: 'INTERNAL', auditorName: 'A. Sharma' }),
      );
      expect(result).toEqual({ id: AUDIT_ID });
    });

    it('create rejects an empty auditor name', async () => {
      await expect(caller.audits.create({ ...auditInput, auditorName: '' })).rejects.toThrow();
    });

    it('update delegates update with id and partial data', async () => {
      auditService.update.mockResolvedValue({ id: AUDIT_ID });
      await caller.audits.update({ id: AUDIT_ID, data: { findings: 'Minor gaps' } });
      expect(auditService.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        AUDIT_ID,
        expect.objectContaining({ findings: 'Minor gaps' }),
      );
    });

    it('start delegates startAudit', async () => {
      auditService.startAudit.mockResolvedValue({ id: AUDIT_ID, status: 'IN_PROGRESS' });
      const result = await caller.audits.start({ id: AUDIT_ID });
      expect(auditService.startAudit).toHaveBeenCalledWith('tenant-1', 'user-1', AUDIT_ID);
      expect(result).toEqual({ id: AUDIT_ID, status: 'IN_PROGRESS' });
    });

    it('recordFindings passes findings and recommendations positionally', async () => {
      auditService.recordFindings.mockResolvedValue({ id: AUDIT_ID });
      await caller.audits.recordFindings({ id: AUDIT_ID, findings: 'Gap', recommendations: 'Fix it' });
      expect(auditService.recordFindings).toHaveBeenCalledWith('tenant-1', 'user-1', AUDIT_ID, 'Gap', 'Fix it');
    });

    it('recordFindings passes undefined recommendations when omitted', async () => {
      auditService.recordFindings.mockResolvedValue({ id: AUDIT_ID });
      await caller.audits.recordFindings({ id: AUDIT_ID, findings: 'Gap' });
      expect(auditService.recordFindings).toHaveBeenCalledWith('tenant-1', 'user-1', AUDIT_ID, 'Gap', undefined);
    });

    it('recordFindings rejects missing findings', async () => {
      await expect(
        caller.audits.recordFindings({ id: AUDIT_ID } as never),
      ).rejects.toThrow();
    });

    it('resolve delegates resolve with tenant, user and parsed input', async () => {
      auditService.resolve.mockResolvedValue({ id: AUDIT_ID, status: 'RESOLVED' });
      const result = await caller.audits.resolve({ auditId: AUDIT_ID, findings: 'Closed' });
      expect(auditService.resolve).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ auditId: AUDIT_ID, findings: 'Closed' }),
      );
      expect(result).toEqual({ id: AUDIT_ID, status: 'RESOLVED' });
    });

    it('complete delegates completeAudit', async () => {
      auditService.completeAudit.mockResolvedValue({ id: AUDIT_ID, status: 'COMPLETED' });
      const result = await caller.audits.complete({ id: AUDIT_ID });
      expect(auditService.completeAudit).toHaveBeenCalledWith('tenant-1', 'user-1', AUDIT_ID);
      expect(result).toEqual({ id: AUDIT_ID, status: 'COMPLETED' });
    });
  });

  // ─── Dashboard ──────────────────────────────────────────
  describe('dashboard.get', () => {
    it('aggregates all sub-service figures for the tenant', async () => {
      huidService.getCoverageReport.mockResolvedValue({ coveragePercent: 80 });
      hallmarkService.getPendingCount.mockResolvedValue(3);
      documentService.getExpiringCount.mockResolvedValue(2);
      certificateService.getCertifiedStonesPercent.mockResolvedValue(42.5);
      insuranceService.getCoverageSummary.mockResolvedValue({ totalCoveredPaise: 500000 });
      auditService.getUpcomingAudits.mockResolvedValue([{ id: AUDIT_ID }]);
      huidService.list.mockResolvedValue({ items: [{ id: ENTITY_ID }], total: 1 });

      const result = await caller.dashboard.get();

      expect(huidService.getCoverageReport).toHaveBeenCalledWith('tenant-1');
      expect(documentService.getExpiringCount).toHaveBeenCalledWith('tenant-1', 30);
      expect(huidService.list).toHaveBeenCalledWith('tenant-1', {
        page: 1, limit: 5, sortBy: 'registeredAt', sortOrder: 'desc',
      });
      expect(result).toEqual({
        huidCoveragePercent: 80,
        pendingHallmarks: 3,
        expiringDocs: 2,
        certifiedStonesPercent: 42.5,
        insuranceCoverage: 500000,
        upcomingAudits: [{ id: AUDIT_ID }],
        recentHuids: [{ id: ENTITY_ID }],
      });
    });

    it('propagates a failure from a dependent service', async () => {
      huidService.getCoverageReport.mockRejectedValue(new Error('db down'));
      hallmarkService.getPendingCount.mockResolvedValue(0);
      documentService.getExpiringCount.mockResolvedValue(0);
      certificateService.getCertifiedStonesPercent.mockResolvedValue(0);
      insuranceService.getCoverageSummary.mockResolvedValue({ totalCoveredPaise: 0 });
      auditService.getUpcomingAudits.mockResolvedValue([]);
      huidService.list.mockResolvedValue({ items: [] });

      await expect(caller.dashboard.get()).rejects.toThrow('db down');
    });
  });

  // ─── Authentication ─────────────────────────────────────
  describe('authentication', () => {
    it('rejects calls without tenant or user context', async () => {
      const anon = routerInstance.router.createCaller({
        tenantId: '',
        userId: '',
        userRole: 'anonymous',
        userPermissions: [],
      });
      await expect(anon.huid.coverageReport()).rejects.toThrow();
      expect(huidService.getCoverageReport).not.toHaveBeenCalled();
    });
  });
});
