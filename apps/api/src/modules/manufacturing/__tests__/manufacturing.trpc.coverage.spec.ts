import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { ManufacturingTrpc } from '../manufacturing.trpc';

// Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits).
const BOM_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
const PRODUCT_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const JOB_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
const KARIGAR_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const LOCATION_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
const PLAN_ID = '3e4f5a6b-7c8d-4e9f-9a0b-2c3d4e5f6a7b';
const PLAN_ITEM_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';

const DEFAULT_PAGINATION = { page: 1, limit: 20, sortOrder: 'desc' };

describe('ManufacturingTrpc (function coverage)', () => {
  const trpc = new TrpcService();

  const manufacturingService = {
    createBom: vi.fn(),
    updateBom: vi.fn(),
    activateBom: vi.fn(),
    archiveBom: vi.fn(),
    cloneBom: vi.fn(),
    findAllBoms: vi.fn(),
    findBomById: vi.fn(),
    explodeBom: vi.fn(),
    createJobOrder: vi.fn(),
    updateJobOrderStatus: vi.fn(),
    assignKarigar: vi.fn(),
    cancelJobOrder: vi.fn(),
    findAllJobOrders: vi.fn(),
    findJobOrderById: vi.fn(),
    getJobCost: vi.fn(),
    addJobCost: vi.fn(),
    getDashboard: vi.fn(),
    generateRequisitionFromBom: vi.fn(),
    generateRequisitionFromPlan: vi.fn(),
  };
  const karigarService = {
    createKarigar: vi.fn(),
    updateKarigar: vi.fn(),
    findKarigarById: vi.fn(),
    findAllKarigars: vi.fn(),
    recordAttendance: vi.fn(),
    getAttendanceReport: vi.fn(),
    issueMetal: vi.fn(),
    recordReturn: vi.fn(),
    recordWastage: vi.fn(),
    getMetalBalanceSummary: vi.fn(),
    getTransactionHistory: vi.fn(),
    calculatePayment: vi.fn(),
    getPerformanceMetrics: vi.fn(),
  };
  const qcService = {
    recordCheckpoint: vi.fn(),
    passJob: vi.fn(),
    failJob: vi.fn(),
    getQcHistory: vi.fn(),
    getPendingQcJobs: vi.fn(),
    getRecentQcResults: vi.fn(),
  };
  const planningService = {
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    addPlanItem: vi.fn(),
    removePlanItem: vi.fn(),
    generateJobOrdersFromPlan: vi.fn(),
    findAllPlans: vi.fn(),
    findPlanById: vi.fn(),
    getCapacityAnalysis: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new ManufacturingTrpc(
    trpc,
    manufacturingService as never,
    karigarService as never,
    qcService as never,
    planningService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  const bomItem = {
    itemType: 'METAL',
    description: 'Gold 22K',
    quantityRequired: 10,
    unitOfMeasure: 'g',
  };

  const bomInput = {
    name: 'Ring BOM',
    productId: PRODUCT_ID,
    items: [bomItem],
  };

  const transactionInput = {
    karigarId: KARIGAR_ID,
    transactionType: 'ISSUE',
    metalType: 'GOLD',
    purityFineness: 916,
    weightMg: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Dashboard ──────────────────────────────────────────
  describe('dashboard', () => {
    it('delegates to manufacturingService.getDashboard with tenant', async () => {
      manufacturingService.getDashboard.mockResolvedValue({ activeJobs: 3 });
      const result = await caller.dashboard();
      expect(manufacturingService.getDashboard).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ activeJobs: 3 });
    });

    it('denies callers without any manufacturing permission', async () => {
      const noPerms = routerInstance.router.createCaller({ ...ctx, userPermissions: [] });
      await expect(noPerms.dashboard()).rejects.toThrow();
      expect(manufacturingService.getDashboard).not.toHaveBeenCalled();
    });
  });

  // ─── BOM ────────────────────────────────────────────────
  describe('bom.create', () => {
    it('creates the BOM with defaults applied', async () => {
      manufacturingService.createBom.mockResolvedValue({ id: BOM_ID });
      const result = await caller.bom.create(bomInput);
      expect(manufacturingService.createBom).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ name: 'Ring BOM', version: 1, outputQuantity: 1, estimatedCostPaise: 0 }),
      );
      expect(result).toEqual({ id: BOM_ID });
    });

    it('rejects a BOM with no items', async () => {
      await expect(caller.bom.create({ ...bomInput, items: [] })).rejects.toThrow();
      expect(manufacturingService.createBom).not.toHaveBeenCalled();
    });
  });

  describe('bom.update', () => {
    it('updates the BOM by id with the partial data', async () => {
      manufacturingService.updateBom.mockResolvedValue({ id: BOM_ID, name: 'Renamed' });
      const result = await caller.bom.update({ id: BOM_ID, data: { name: 'Renamed' } });
      expect(manufacturingService.updateBom).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        BOM_ID,
        expect.objectContaining({ name: 'Renamed' }),
      );
      expect(result).toEqual({ id: BOM_ID, name: 'Renamed' });
    });

    it('rejects a non-uuid id', async () => {
      await expect(caller.bom.update({ id: 'bad', data: { name: 'X' } })).rejects.toThrow();
    });
  });

  describe('bom.activate', () => {
    it('activates the BOM for the acting user', async () => {
      manufacturingService.activateBom.mockResolvedValue({ id: BOM_ID, status: 'ACTIVE' });
      const result = await caller.bom.activate({ id: BOM_ID });
      expect(manufacturingService.activateBom).toHaveBeenCalledWith('tenant-1', 'user-1', BOM_ID);
      expect(result).toEqual({ id: BOM_ID, status: 'ACTIVE' });
    });
  });

  describe('bom.archive', () => {
    it('archives the BOM for the acting user', async () => {
      manufacturingService.archiveBom.mockResolvedValue({ id: BOM_ID, status: 'ARCHIVED' });
      const result = await caller.bom.archive({ id: BOM_ID });
      expect(manufacturingService.archiveBom).toHaveBeenCalledWith('tenant-1', 'user-1', BOM_ID);
      expect(result).toEqual({ id: BOM_ID, status: 'ARCHIVED' });
    });
  });

  describe('bom.clone', () => {
    it('clones the BOM for the acting user', async () => {
      manufacturingService.cloneBom.mockResolvedValue({ id: 'clone-id' });
      const result = await caller.bom.clone({ id: BOM_ID });
      expect(manufacturingService.cloneBom).toHaveBeenCalledWith('tenant-1', 'user-1', BOM_ID);
      expect(result).toEqual({ id: 'clone-id' });
    });
  });

  describe('bom.list', () => {
    it('lists BOMs with pagination and filter', async () => {
      manufacturingService.findAllBoms.mockResolvedValue({ items: [] });
      const result = await caller.bom.list({
        pagination: { page: 1, limit: 10, sortOrder: 'asc' },
        filter: { status: 'ACTIVE', productId: PRODUCT_ID },
      });
      expect(manufacturingService.findAllBoms).toHaveBeenCalledWith(
        'tenant-1',
        { page: 1, limit: 10, sortOrder: 'asc' },
        { status: 'ACTIVE', productId: PRODUCT_ID },
      );
      expect(result).toEqual({ items: [] });
    });

    it('applies default pagination values when an empty pagination object is sent', async () => {
      manufacturingService.findAllBoms.mockResolvedValue({ items: [] });
      await caller.bom.list({ pagination: {} });
      expect(manufacturingService.findAllBoms).toHaveBeenCalledWith(
        'tenant-1',
        DEFAULT_PAGINATION,
        undefined,
      );
    });
  });

  describe('bom.getById', () => {
    it('fetches the BOM by id', async () => {
      manufacturingService.findBomById.mockResolvedValue({ id: BOM_ID });
      const result = await caller.bom.getById({ id: BOM_ID });
      expect(manufacturingService.findBomById).toHaveBeenCalledWith('tenant-1', BOM_ID);
      expect(result).toEqual({ id: BOM_ID });
    });
  });

  describe('bom.explode', () => {
    it('explodes the BOM for the requested quantity', async () => {
      manufacturingService.explodeBom.mockResolvedValue({ items: [] });
      const result = await caller.bom.explode({ id: BOM_ID, quantity: 3 });
      expect(manufacturingService.explodeBom).toHaveBeenCalledWith('tenant-1', BOM_ID, 3);
      expect(result).toEqual({ items: [] });
    });

    it('rejects a zero quantity', async () => {
      await expect(caller.bom.explode({ id: BOM_ID, quantity: 0 })).rejects.toThrow();
      expect(manufacturingService.explodeBom).not.toHaveBeenCalled();
    });
  });

  // ─── Job orders ─────────────────────────────────────────
  describe('job.create', () => {
    it('creates a job order with default priority and quantity', async () => {
      manufacturingService.createJobOrder.mockResolvedValue({ id: JOB_ID });
      const result = await caller.job.create({ productId: PRODUCT_ID, locationId: LOCATION_ID });
      expect(manufacturingService.createJobOrder).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ productId: PRODUCT_ID, locationId: LOCATION_ID, priority: 'MEDIUM', quantity: 1 }),
      );
      expect(result).toEqual({ id: JOB_ID });
    });

    it('rejects a job order without a location', async () => {
      await expect(caller.job.create({ productId: PRODUCT_ID } as never)).rejects.toThrow();
      expect(manufacturingService.createJobOrder).not.toHaveBeenCalled();
    });
  });

  describe('job.updateStatus', () => {
    it('forwards the status update to the service', async () => {
      manufacturingService.updateJobOrderStatus.mockResolvedValue({ id: JOB_ID, status: 'IN_PROGRESS' });
      const result = await caller.job.updateStatus({
        id: JOB_ID,
        data: { status: 'IN_PROGRESS', notes: 'Started' },
      });
      expect(manufacturingService.updateJobOrderStatus).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        JOB_ID,
        { status: 'IN_PROGRESS', notes: 'Started' },
      );
      expect(result).toEqual({ id: JOB_ID, status: 'IN_PROGRESS' });
    });

    it('rejects an unknown job status', async () => {
      await expect(
        caller.job.updateStatus({ id: JOB_ID, data: { status: 'LOST' as never } }),
      ).rejects.toThrow();
    });
  });

  describe('job.assignKarigar', () => {
    it('assigns the karigar to the job', async () => {
      manufacturingService.assignKarigar.mockResolvedValue({ id: JOB_ID });
      const result = await caller.job.assignKarigar({ jobId: JOB_ID, karigarId: KARIGAR_ID });
      expect(manufacturingService.assignKarigar).toHaveBeenCalledWith('tenant-1', 'user-1', JOB_ID, KARIGAR_ID);
      expect(result).toEqual({ id: JOB_ID });
    });
  });

  describe('job.cancel', () => {
    it('cancels the job with a reason', async () => {
      manufacturingService.cancelJobOrder.mockResolvedValue({ id: JOB_ID, status: 'CANCELLED' });
      const result = await caller.job.cancel({ id: JOB_ID, reason: 'Customer cancelled' });
      expect(manufacturingService.cancelJobOrder).toHaveBeenCalledWith('tenant-1', 'user-1', JOB_ID, 'Customer cancelled');
      expect(result).toEqual({ id: JOB_ID, status: 'CANCELLED' });
    });

    it('cancels the job without a reason when none is given', async () => {
      manufacturingService.cancelJobOrder.mockResolvedValue({ id: JOB_ID, status: 'CANCELLED' });
      await caller.job.cancel({ id: JOB_ID });
      expect(manufacturingService.cancelJobOrder).toHaveBeenCalledWith('tenant-1', 'user-1', JOB_ID, undefined);
    });
  });

  describe('job.list', () => {
    it('lists job orders with pagination and filter', async () => {
      manufacturingService.findAllJobOrders.mockResolvedValue({ items: [] });
      await caller.job.list({
        pagination: { page: 2, limit: 5, sortOrder: 'desc' },
        filter: { status: 'QC_PENDING', priority: 'URGENT', karigarId: KARIGAR_ID },
      });
      expect(manufacturingService.findAllJobOrders).toHaveBeenCalledWith(
        'tenant-1',
        { page: 2, limit: 5, sortOrder: 'desc' },
        { status: 'QC_PENDING', priority: 'URGENT', karigarId: KARIGAR_ID },
      );
    });
  });

  describe('job.getById', () => {
    it('fetches the job order by id', async () => {
      manufacturingService.findJobOrderById.mockResolvedValue({ id: JOB_ID });
      const result = await caller.job.getById({ id: JOB_ID });
      expect(manufacturingService.findJobOrderById).toHaveBeenCalledWith('tenant-1', JOB_ID);
      expect(result).toEqual({ id: JOB_ID });
    });
  });

  describe('job.getCost', () => {
    it('returns the cost breakdown for the job', async () => {
      manufacturingService.getJobCost.mockResolvedValue({ totalPaise: 0n });
      const result = await caller.job.getCost({ id: JOB_ID });
      expect(manufacturingService.getJobCost).toHaveBeenCalledWith('tenant-1', JOB_ID);
      expect(result).toEqual({ totalPaise: 0n });
    });
  });

  describe('job.addCost', () => {
    it('converts paise and weight to BigInt before calling the service', async () => {
      manufacturingService.addJobCost.mockResolvedValue({ id: 'cost-1' });
      const result = await caller.job.addCost({
        jobId: JOB_ID,
        costType: 'LABOR',
        description: 'Setting labour',
        amountPaise: 150000,
        weightMg: 2500,
      });
      expect(manufacturingService.addJobCost).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        JOB_ID,
        'LABOR',
        'Setting labour',
        150000n,
        2500n,
      );
      expect(result).toEqual({ id: 'cost-1' });
    });

    it('passes undefined weight when weightMg is omitted', async () => {
      manufacturingService.addJobCost.mockResolvedValue({ id: 'cost-2' });
      await caller.job.addCost({
        jobId: JOB_ID,
        costType: 'OVERHEAD',
        description: 'Electricity',
        amountPaise: 0,
      });
      expect(manufacturingService.addJobCost).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        JOB_ID,
        'OVERHEAD',
        'Electricity',
        0n,
        undefined,
      );
    });

    it('treats a zero weight as absent', async () => {
      manufacturingService.addJobCost.mockResolvedValue({ id: 'cost-3' });
      await caller.job.addCost({
        jobId: JOB_ID,
        costType: 'WASTAGE',
        description: 'Filing loss',
        amountPaise: 100,
        weightMg: 0,
      });
      expect(manufacturingService.addJobCost).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        JOB_ID,
        'WASTAGE',
        'Filing loss',
        100n,
        undefined,
      );
    });

    it('rejects a negative amount', async () => {
      await expect(
        caller.job.addCost({ jobId: JOB_ID, costType: 'LABOR', description: 'x', amountPaise: -5 }),
      ).rejects.toThrow();
      expect(manufacturingService.addJobCost).not.toHaveBeenCalled();
    });

    it('rejects an unknown cost type', async () => {
      await expect(
        caller.job.addCost({ jobId: JOB_ID, costType: 'BRIBE' as never, description: 'x', amountPaise: 1 }),
      ).rejects.toThrow();
    });
  });

  // ─── Karigar ────────────────────────────────────────────
  describe('karigar.create', () => {
    it('creates the karigar with defaults applied', async () => {
      karigarService.createKarigar.mockResolvedValue({ id: KARIGAR_ID });
      const result = await caller.karigar.create({
        employeeCode: 'K-001',
        firstName: 'Ravi',
        lastName: 'Kumar',
        locationId: LOCATION_ID,
      });
      expect(karigarService.createKarigar).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ employeeCode: 'K-001', skillLevel: 'JUNIOR', isActive: true, dailyWagePaise: 0 }),
      );
      expect(result).toEqual({ id: KARIGAR_ID });
    });

    it('rejects an invalid email', async () => {
      await expect(
        caller.karigar.create({
          employeeCode: 'K-002',
          firstName: 'A',
          lastName: 'B',
          locationId: LOCATION_ID,
          email: 'not-an-email',
        }),
      ).rejects.toThrow();
      expect(karigarService.createKarigar).not.toHaveBeenCalled();
    });
  });

  describe('karigar.update', () => {
    it('applies a partial update to the karigar', async () => {
      karigarService.updateKarigar.mockResolvedValue({ id: KARIGAR_ID, firstName: 'Mohan' });
      const result = await caller.karigar.update({ id: KARIGAR_ID, data: { firstName: 'Mohan' } });
      expect(karigarService.updateKarigar).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        KARIGAR_ID,
        expect.objectContaining({ firstName: 'Mohan' }),
      );
      expect(result).toEqual({ id: KARIGAR_ID, firstName: 'Mohan' });
    });
  });

  describe('karigar.getById', () => {
    it('fetches the karigar by id', async () => {
      karigarService.findKarigarById.mockResolvedValue({ id: KARIGAR_ID });
      const result = await caller.karigar.getById({ id: KARIGAR_ID });
      expect(karigarService.findKarigarById).toHaveBeenCalledWith('tenant-1', KARIGAR_ID);
      expect(result).toEqual({ id: KARIGAR_ID });
    });
  });

  describe('karigar.list', () => {
    it('lists karigars with pagination and filter', async () => {
      karigarService.findAllKarigars.mockResolvedValue({ items: [] });
      await caller.karigar.list({
        pagination: { page: 1, limit: 20, sortOrder: 'desc' },
        filter: { locationId: LOCATION_ID, skillLevel: 'SENIOR', isActive: true },
      });
      expect(karigarService.findAllKarigars).toHaveBeenCalledWith(
        'tenant-1',
        DEFAULT_PAGINATION,
        { locationId: LOCATION_ID, skillLevel: 'SENIOR', isActive: true },
      );
    });
  });

  describe('karigar.recordAttendance', () => {
    it('records attendance with the default PRESENT status', async () => {
      karigarService.recordAttendance.mockResolvedValue({ id: 'att-1' });
      const result = await caller.karigar.recordAttendance({
        karigarId: KARIGAR_ID,
        date: '2026-11-10',
      });
      expect(karigarService.recordAttendance).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ karigarId: KARIGAR_ID, status: 'PRESENT', overtimeMinutes: 0, wagePaidPaise: 0 }),
      );
      expect(karigarService.recordAttendance.mock.calls[0]?.[2].date).toBeInstanceOf(Date);
      expect(result).toEqual({ id: 'att-1' });
    });
  });

  describe('karigar.getAttendanceReport', () => {
    it('converts the date range into Date objects', async () => {
      karigarService.getAttendanceReport.mockResolvedValue({ present: 20 });
      const result = await caller.karigar.getAttendanceReport({
        karigarId: KARIGAR_ID,
        dateRange: { from: '2026-11-01', to: '2026-11-30' },
      });
      expect(karigarService.getAttendanceReport).toHaveBeenCalledWith(
        'tenant-1',
        KARIGAR_ID,
        expect.any(Date),
        expect.any(Date),
      );
      expect(result).toEqual({ present: 20 });
    });

    it('rejects a date range with a missing end date', async () => {
      await expect(
        caller.karigar.getAttendanceReport({ karigarId: KARIGAR_ID, dateRange: { from: '2026-11-01' } } as never),
      ).rejects.toThrow();
    });
  });

  describe('karigar.issueMetal', () => {
    it('issues metal to the karigar', async () => {
      karigarService.issueMetal.mockResolvedValue({ id: 'tx-1' });
      const result = await caller.karigar.issueMetal(transactionInput);
      expect(karigarService.issueMetal).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ ...transactionInput }),
      );
      expect(result).toEqual({ id: 'tx-1' });
    });

    it('rejects a purity outside 1..999', async () => {
      await expect(caller.karigar.issueMetal({ ...transactionInput, purityFineness: 1000 })).rejects.toThrow();
      expect(karigarService.issueMetal).not.toHaveBeenCalled();
    });
  });

  describe('karigar.recordReturn', () => {
    it('records a metal return from the karigar', async () => {
      karigarService.recordReturn.mockResolvedValue({ id: 'tx-2' });
      const input = { ...transactionInput, transactionType: 'RETURN', weightMg: 4800 };
      const result = await caller.karigar.recordReturn(input);
      expect(karigarService.recordReturn).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ transactionType: 'RETURN', weightMg: 4800 }),
      );
      expect(result).toEqual({ id: 'tx-2' });
    });
  });

  describe('karigar.recordWastage', () => {
    it('records wastage for the karigar', async () => {
      karigarService.recordWastage.mockResolvedValue({ id: 'tx-3' });
      const input = { ...transactionInput, transactionType: 'WASTAGE', weightMg: 120 };
      const result = await caller.karigar.recordWastage(input);
      expect(karigarService.recordWastage).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ transactionType: 'WASTAGE', weightMg: 120 }),
      );
      expect(result).toEqual({ id: 'tx-3' });
    });

    it('rejects a non-positive weight', async () => {
      await expect(caller.karigar.recordWastage({ ...transactionInput, weightMg: 0 })).rejects.toThrow();
      expect(karigarService.recordWastage).not.toHaveBeenCalled();
    });
  });

  describe('karigar.getMetalBalance', () => {
    it('returns the metal balance summary for the karigar', async () => {
      karigarService.getMetalBalanceSummary.mockResolvedValue([{ balanceWeightMg: 100n }]);
      const result = await caller.karigar.getMetalBalance({ karigarId: KARIGAR_ID });
      expect(karigarService.getMetalBalanceSummary).toHaveBeenCalledWith('tenant-1', KARIGAR_ID);
      expect(result).toEqual([{ balanceWeightMg: 100n }]);
    });
  });

  describe('karigar.getTransactionHistory', () => {
    it('passes coerced from/to dates to the service', async () => {
      karigarService.getTransactionHistory.mockResolvedValue([]);
      await caller.karigar.getTransactionHistory({
        karigarId: KARIGAR_ID,
        from: '2026-11-01',
        to: '2026-11-15',
      });
      expect(karigarService.getTransactionHistory).toHaveBeenCalledWith(
        'tenant-1',
        KARIGAR_ID,
        expect.any(Date),
        expect.any(Date),
      );
    });

    it('passes undefined dates when the range is omitted', async () => {
      karigarService.getTransactionHistory.mockResolvedValue([]);
      await caller.karigar.getTransactionHistory({ karigarId: KARIGAR_ID });
      expect(karigarService.getTransactionHistory).toHaveBeenCalledWith('tenant-1', KARIGAR_ID, undefined, undefined);
    });
  });

  describe('karigar.calculatePayment', () => {
    it('calculates payment over the date range', async () => {
      karigarService.calculatePayment.mockResolvedValue({ amountPaise: 50000 });
      const result = await caller.karigar.calculatePayment({
        karigarId: KARIGAR_ID,
        dateRange: { from: '2026-11-01', to: '2026-11-07' },
      });
      expect(karigarService.calculatePayment).toHaveBeenCalledWith(
        'tenant-1',
        KARIGAR_ID,
        expect.any(Date),
        expect.any(Date),
      );
      expect(result).toEqual({ amountPaise: 50000 });
    });
  });

  describe('karigar.getPerformance', () => {
    it('returns performance metrics for the karigar', async () => {
      karigarService.getPerformanceMetrics.mockResolvedValue({ onTimeRate: 0.95 });
      const result = await caller.karigar.getPerformance({ karigarId: KARIGAR_ID });
      expect(karigarService.getPerformanceMetrics).toHaveBeenCalledWith('tenant-1', KARIGAR_ID);
      expect(result).toEqual({ onTimeRate: 0.95 });
    });
  });

  // ─── Quality control ────────────────────────────────────
  describe('qc.recordCheckpoint', () => {
    it('records a QC checkpoint for the acting user', async () => {
      qcService.recordCheckpoint.mockResolvedValue({ id: 'qc-1' });
      const input = {
        jobOrderId: JOB_ID,
        checkpointType: 'IN_PROCESS',
        checkedBy: 'Inspector A',
        status: 'PASSED',
        weightMg: 4990,
      };
      const result = await caller.qc.recordCheckpoint(input);
      expect(qcService.recordCheckpoint).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ jobOrderId: JOB_ID, checkpointType: 'IN_PROCESS', status: 'PASSED', weightMg: 4990 }),
      );
      expect(result).toEqual({ id: 'qc-1' });
    });

    it('rejects an unknown QC status', async () => {
      await expect(
        caller.qc.recordCheckpoint({
          jobOrderId: JOB_ID,
          checkpointType: 'FINAL',
          checkedBy: 'Inspector A',
          status: 'MAYBE' as never,
        }),
      ).rejects.toThrow();
    });
  });

  describe('qc.passJob', () => {
    it('passes the job QC for the acting user', async () => {
      qcService.passJob.mockResolvedValue({ id: JOB_ID, status: 'QC_PASSED' });
      const result = await caller.qc.passJob({ jobId: JOB_ID });
      expect(qcService.passJob).toHaveBeenCalledWith('tenant-1', 'user-1', JOB_ID);
      expect(result).toEqual({ id: JOB_ID, status: 'QC_PASSED' });
    });
  });

  describe('qc.failJob', () => {
    it('fails the job QC with findings', async () => {
      qcService.failJob.mockResolvedValue({ id: JOB_ID, status: 'QC_FAILED' });
      const result = await caller.qc.failJob({ jobId: JOB_ID, findings: 'Stone loose' });
      expect(qcService.failJob).toHaveBeenCalledWith('tenant-1', 'user-1', JOB_ID, 'Stone loose');
      expect(result).toEqual({ id: JOB_ID, status: 'QC_FAILED' });
    });

    it('fails the job QC without findings when none are given', async () => {
      qcService.failJob.mockResolvedValue({ id: JOB_ID, status: 'QC_FAILED' });
      await caller.qc.failJob({ jobId: JOB_ID });
      expect(qcService.failJob).toHaveBeenCalledWith('tenant-1', 'user-1', JOB_ID, undefined);
    });
  });

  describe('qc.getHistory', () => {
    it('returns QC history for the job', async () => {
      qcService.getQcHistory.mockResolvedValue([{ id: 'qc-1' }]);
      const result = await caller.qc.getHistory({ jobId: JOB_ID });
      expect(qcService.getQcHistory).toHaveBeenCalledWith('tenant-1', JOB_ID);
      expect(result).toEqual([{ id: 'qc-1' }]);
    });
  });

  describe('qc.getPendingJobs', () => {
    it('returns jobs awaiting QC for the tenant', async () => {
      qcService.getPendingQcJobs.mockResolvedValue([{ id: JOB_ID }]);
      const result = await caller.qc.getPendingJobs();
      expect(qcService.getPendingQcJobs).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([{ id: JOB_ID }]);
    });
  });

  describe('qc.getRecentResults', () => {
    it('forwards an undefined limit to the service when no input is supplied', async () => {
      qcService.getRecentQcResults.mockResolvedValue([]);
      const result = await caller.qc.getRecentResults();
      expect(qcService.getRecentQcResults).toHaveBeenCalledWith('tenant-1', undefined);
      expect(result).toEqual([]);
    });

    it('forwards an explicit limit', async () => {
      qcService.getRecentQcResults.mockResolvedValue([{ id: 'qc-9' }]);
      await caller.qc.getRecentResults({ limit: 5 });
      expect(qcService.getRecentQcResults).toHaveBeenCalledWith('tenant-1', 5);
    });

    it('rejects a limit above 100', async () => {
      await expect(caller.qc.getRecentResults({ limit: 101 })).rejects.toThrow();
      expect(qcService.getRecentQcResults).not.toHaveBeenCalled();
    });
  });

  // ─── Production planning ────────────────────────────────
  describe('plan.create', () => {
    it('creates a production plan with parsed dates', async () => {
      planningService.createPlan.mockResolvedValue({ id: PLAN_ID });
      const result = await caller.plan.create({
        name: 'Diwali Run',
        locationId: LOCATION_ID,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      expect(planningService.createPlan).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ name: 'Diwali Run', locationId: LOCATION_ID, startDate: expect.any(Date) }),
      );
      expect(result).toEqual({ id: PLAN_ID });
    });

    it('rejects a plan with an empty name', async () => {
      await expect(
        caller.plan.create({ name: '', locationId: LOCATION_ID, startDate: '2026-10-01', endDate: '2026-10-31' }),
      ).rejects.toThrow();
      expect(planningService.createPlan).not.toHaveBeenCalled();
    });
  });

  describe('plan.update', () => {
    it('applies a partial update to the plan', async () => {
      planningService.updatePlan.mockResolvedValue({ id: PLAN_ID, name: 'Renamed' });
      const result = await caller.plan.update({ id: PLAN_ID, data: { name: 'Renamed' } });
      expect(planningService.updatePlan).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        PLAN_ID,
        expect.objectContaining({ name: 'Renamed' }),
      );
      expect(result).toEqual({ id: PLAN_ID, name: 'Renamed' });
    });
  });

  describe('plan.addItem', () => {
    it('adds an item to the plan with defaulted quantity and priority', async () => {
      planningService.addPlanItem.mockResolvedValue({ id: PLAN_ITEM_ID });
      const result = await caller.plan.addItem({ planId: PLAN_ID, item: { productId: PRODUCT_ID } });
      expect(planningService.addPlanItem).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        PLAN_ID,
        expect.objectContaining({ productId: PRODUCT_ID, quantity: 1, priority: 'MEDIUM' }),
      );
      expect(result).toEqual({ id: PLAN_ITEM_ID });
    });

    it('rejects an item with a zero quantity', async () => {
      await expect(
        caller.plan.addItem({ planId: PLAN_ID, item: { productId: PRODUCT_ID, quantity: 0 } }),
      ).rejects.toThrow();
    });
  });

  describe('plan.removeItem', () => {
    it('removes the item from the plan', async () => {
      planningService.removePlanItem.mockResolvedValue({ success: true });
      const result = await caller.plan.removeItem({ planId: PLAN_ID, itemId: PLAN_ITEM_ID });
      expect(planningService.removePlanItem).toHaveBeenCalledWith('tenant-1', 'user-1', PLAN_ID, PLAN_ITEM_ID);
      expect(result).toEqual({ success: true });
    });
  });

  describe('plan.generateJobs', () => {
    it('generates job orders from the plan', async () => {
      planningService.generateJobOrdersFromPlan.mockResolvedValue({ created: 3 });
      const result = await caller.plan.generateJobs({ planId: PLAN_ID });
      expect(planningService.generateJobOrdersFromPlan).toHaveBeenCalledWith('tenant-1', 'user-1', PLAN_ID);
      expect(result).toEqual({ created: 3 });
    });
  });

  describe('plan.list', () => {
    it('lists plans with pagination', async () => {
      planningService.findAllPlans.mockResolvedValue({ items: [] });
      const result = await caller.plan.list({ pagination: { page: 1, limit: 20, sortOrder: 'desc' } });
      expect(planningService.findAllPlans).toHaveBeenCalledWith('tenant-1', DEFAULT_PAGINATION);
      expect(result).toEqual({ items: [] });
    });
  });

  describe('plan.getById', () => {
    it('fetches the plan by id', async () => {
      planningService.findPlanById.mockResolvedValue({ id: PLAN_ID });
      const result = await caller.plan.getById({ id: PLAN_ID });
      expect(planningService.findPlanById).toHaveBeenCalledWith('tenant-1', PLAN_ID);
      expect(result).toEqual({ id: PLAN_ID });
    });
  });

  describe('plan.capacityAnalysis', () => {
    it('returns capacity analysis for the location', async () => {
      planningService.getCapacityAnalysis.mockResolvedValue({ utilization: 0.7 });
      const result = await caller.plan.capacityAnalysis({ locationId: LOCATION_ID });
      expect(planningService.getCapacityAnalysis).toHaveBeenCalledWith('tenant-1', LOCATION_ID);
      expect(result).toEqual({ utilization: 0.7 });
    });
  });

  // ─── Material requisition ───────────────────────────────
  describe('requisition.fromBom', () => {
    it('generates a requisition from the BOM and quantity', async () => {
      manufacturingService.generateRequisitionFromBom.mockResolvedValue({ bomId: BOM_ID, items: [] });
      const result = await caller.requisition.fromBom({ bomId: BOM_ID, quantity: 4 });
      expect(manufacturingService.generateRequisitionFromBom).toHaveBeenCalledWith('tenant-1', BOM_ID, 4);
      expect(result).toEqual({ bomId: BOM_ID, items: [] });
    });

    it('rejects a fractional quantity', async () => {
      await expect(caller.requisition.fromBom({ bomId: BOM_ID, quantity: 1.5 })).rejects.toThrow();
      expect(manufacturingService.generateRequisitionFromBom).not.toHaveBeenCalled();
    });
  });

  describe('requisition.fromPlan', () => {
    it('generates a requisition from the plan', async () => {
      manufacturingService.generateRequisitionFromPlan.mockResolvedValue({ items: [] });
      const result = await caller.requisition.fromPlan({ planId: PLAN_ID });
      expect(manufacturingService.generateRequisitionFromPlan).toHaveBeenCalledWith('tenant-1', PLAN_ID);
      expect(result).toEqual({ items: [] });
    });
  });
});
