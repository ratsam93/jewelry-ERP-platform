import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { ReportingTrpcRouter } from '../reporting.trpc';

describe('ReportingTrpcRouter (procedure coverage)', () => {
  const trpc = new TrpcService();

  const salesService = {
    dailySalesSummary: vi.fn(),
    salesByPeriod: vi.fn(),
    salesByProduct: vi.fn(),
    salesBySalesperson: vi.fn(),
    salesByCategory: vi.fn(),
    salesByLocation: vi.fn(),
    salesComparison: vi.fn(),
  };
  const inventoryService = {
    stockSummary: vi.fn(),
    stockByLocation: vi.fn(),
    lowStockAlert: vi.fn(),
    deadStockReport: vi.fn(),
    fastSlowMovers: vi.fn(),
    stockAgingReport: vi.fn(),
    stockValuationReport: vi.fn(),
    metalStockSummary: vi.fn(),
  };
  const manufacturingService = {
    jobSummary: vi.fn(),
    karigarPerformance: vi.fn(),
    materialUsageReport: vi.fn(),
    wastageReport: vi.fn(),
    productionTimeline: vi.fn(),
    costAnalysis: vi.fn(),
  };
  const crmService = {
    customerAcquisition: vi.fn(),
    customerRetention: vi.fn(),
    customerLifetimeValue: vi.fn(),
    loyaltyMetrics: vi.fn(),
    leadConversion: vi.fn(),
    campaignPerformance: vi.fn(),
    crmOverview: vi.fn(),
  };
  const forecastService = {
    demandForecast: vi.fn(),
    reorderPointCalculation: vi.fn(),
    seasonalityAnalysis: vi.fn(),
  };
  const customService = {
    executeCustomReport: vi.fn(),
    validateReportConfig: vi.fn(),
    getSupportedEntities: vi.fn(),
  };
  const dashboardService = {
    getAnalyticsDashboard: vi.fn(),
    saveDashboardLayout: vi.fn(),
    getDashboardLayout: vi.fn(),
    getWidgetData: vi.fn(),
  };
  const prisma = {
    savedReport: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    scheduledReport: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    reportExecution: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new ReportingTrpcRouter(
    trpc,
    salesService as never,
    inventoryService as never,
    manufacturingService as never,
    crmService as never,
    forecastService as never,
    customService as never,
    dashboardService as never,
    prisma as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  // Valid RFC 9562 v4 UUIDs (Zod 4 validates version/variant nibbles)
  const LOCATION_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const PRODUCT_ID = '4a2f3e5d-6c7b-489a-8bcd-ef0123456789';
  const CATEGORY_ID = '5b3a4f6e-7d8c-49ab-9cde-f01234567890';
  const REPORT_ID = '6c4b5a7f-8e9d-4abc-8def-012345678901';
  const SCHEDULE_ID = '7d5c6b8a-9fae-4bcd-9ef0-123456789012';

  const RANGE = { from: '2026-01-01', to: '2026-01-31' };
  const EXPECTED_RANGE = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };
  const RESULT = { ok: true };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Sales ──────────────────────────────────────────────
  describe('sales reports', () => {
    it('dailySalesSummary coerces date and passes locationId', async () => {
      salesService.dailySalesSummary.mockResolvedValue(RESULT);
      const result = await caller.dailySalesSummary({ date: '2026-01-15', locationId: LOCATION_ID });
      expect(salesService.dailySalesSummary).toHaveBeenCalledWith(
        'tenant-1',
        new Date('2026-01-15'),
        LOCATION_ID,
      );
      expect(result).toEqual(RESULT);
    });

    it('dailySalesSummary rejects an invalid locationId', async () => {
      await expect(
        caller.dailySalesSummary({ date: '2026-01-15', locationId: 'not-a-uuid' }),
      ).rejects.toThrow();
      expect(salesService.dailySalesSummary).not.toHaveBeenCalled();
    });

    it('salesByPeriod applies groupBy default', async () => {
      salesService.salesByPeriod.mockResolvedValue(RESULT);
      const result = await caller.salesByPeriod({ dateRange: RANGE });
      expect(salesService.salesByPeriod).toHaveBeenCalledWith(
        'tenant-1',
        EXPECTED_RANGE,
        'day',
        undefined,
      );
      expect(result).toEqual(RESULT);
    });

    it('salesByPeriod forwards explicit groupBy and locationId', async () => {
      salesService.salesByPeriod.mockResolvedValue(RESULT);
      await caller.salesByPeriod({ dateRange: RANGE, groupBy: 'month', locationId: LOCATION_ID });
      expect(salesService.salesByPeriod).toHaveBeenCalledWith(
        'tenant-1',
        EXPECTED_RANGE,
        'month',
        LOCATION_ID,
      );
    });

    it('salesByProduct applies limit default of 50', async () => {
      salesService.salesByProduct.mockResolvedValue(RESULT);
      const result = await caller.salesByProduct({ dateRange: RANGE });
      expect(salesService.salesByProduct).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE, undefined, 50);
      expect(result).toEqual(RESULT);
    });

    it('salesBySalesperson delegates with optional location', async () => {
      salesService.salesBySalesperson.mockResolvedValue(RESULT);
      const result = await caller.salesBySalesperson({ dateRange: RANGE, locationId: LOCATION_ID });
      expect(salesService.salesBySalesperson).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE, LOCATION_ID);
      expect(result).toEqual(RESULT);
    });

    it('salesByCategory delegates with date range', async () => {
      salesService.salesByCategory.mockResolvedValue(RESULT);
      const result = await caller.salesByCategory({ dateRange: RANGE });
      expect(salesService.salesByCategory).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('salesByLocation delegates with date range', async () => {
      salesService.salesByLocation.mockResolvedValue(RESULT);
      const result = await caller.salesByLocation({ dateRange: RANGE });
      expect(salesService.salesByLocation).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('salesComparison delegates both periods and location', async () => {
      salesService.salesComparison.mockResolvedValue(RESULT);
      const result = await caller.salesComparison({
        period1: RANGE,
        period2: { from: '2025-01-01', to: '2025-01-31' },
        locationId: LOCATION_ID,
      });
      expect(salesService.salesComparison).toHaveBeenCalledWith(
        'tenant-1',
        EXPECTED_RANGE,
        { from: new Date('2025-01-01'), to: new Date('2025-01-31') },
        LOCATION_ID,
      );
      expect(result).toEqual(RESULT);
    });
  });

  // ─── Inventory ──────────────────────────────────────────
  describe('inventory reports', () => {
    it('stockSummary forwards optional location', async () => {
      inventoryService.stockSummary.mockResolvedValue(RESULT);
      const result = await caller.stockSummary({ locationId: LOCATION_ID });
      expect(inventoryService.stockSummary).toHaveBeenCalledWith('tenant-1', LOCATION_ID);
      expect(result).toEqual(RESULT);
    });

    it('stockByLocation delegates with tenant only', async () => {
      inventoryService.stockByLocation.mockResolvedValue(RESULT);
      const result = await caller.stockByLocation();
      expect(inventoryService.stockByLocation).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual(RESULT);
    });

    it('lowStockAlert delegates with tenant only', async () => {
      inventoryService.lowStockAlert.mockResolvedValue(RESULT);
      const result = await caller.lowStockAlert();
      expect(inventoryService.lowStockAlert).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual(RESULT);
    });

    it('deadStockReport applies 90-day default', async () => {
      inventoryService.deadStockReport.mockResolvedValue(RESULT);
      const result = await caller.deadStockReport({});
      expect(inventoryService.deadStockReport).toHaveBeenCalledWith('tenant-1', 90);
      expect(result).toEqual(RESULT);
    });

    it('deadStockReport rejects a non-positive window', async () => {
      await expect(caller.deadStockReport({ daysSinceLastMovement: 0 })).rejects.toThrow();
    });

    it('fastSlowMovers applies limit default of 20', async () => {
      inventoryService.fastSlowMovers.mockResolvedValue(RESULT);
      const result = await caller.fastSlowMovers({ dateRange: RANGE });
      expect(inventoryService.fastSlowMovers).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE, 20);
      expect(result).toEqual(RESULT);
    });

    it('fastSlowMovers forwards explicit limit', async () => {
      inventoryService.fastSlowMovers.mockResolvedValue(RESULT);
      await caller.fastSlowMovers({ dateRange: RANGE, limit: 5 });
      expect(inventoryService.fastSlowMovers).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE, 5);
    });

    it('stockAgingReport forwards optional location', async () => {
      inventoryService.stockAgingReport.mockResolvedValue(RESULT);
      const result = await caller.stockAgingReport({});
      expect(inventoryService.stockAgingReport).toHaveBeenCalledWith('tenant-1', undefined);
      expect(result).toEqual(RESULT);
    });

    it('stockValuationReport defaults method to cost', async () => {
      inventoryService.stockValuationReport.mockResolvedValue(RESULT);
      const result = await caller.stockValuationReport({});
      expect(inventoryService.stockValuationReport).toHaveBeenCalledWith('tenant-1', 'cost', undefined);
      expect(result).toEqual(RESULT);
    });

    it('stockValuationReport forwards market method and location', async () => {
      inventoryService.stockValuationReport.mockResolvedValue(RESULT);
      await caller.stockValuationReport({ method: 'market', locationId: LOCATION_ID });
      expect(inventoryService.stockValuationReport).toHaveBeenCalledWith('tenant-1', 'market', LOCATION_ID);
    });

    it('metalStockSummary delegates with tenant only', async () => {
      inventoryService.metalStockSummary.mockResolvedValue(RESULT);
      const result = await caller.metalStockSummary();
      expect(inventoryService.metalStockSummary).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual(RESULT);
    });
  });

  // ─── Manufacturing ──────────────────────────────────────
  describe('manufacturing reports', () => {
    it('jobSummary delegates date range and location', async () => {
      manufacturingService.jobSummary.mockResolvedValue(RESULT);
      const result = await caller.jobSummary({ dateRange: RANGE, locationId: LOCATION_ID });
      expect(manufacturingService.jobSummary).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE, LOCATION_ID);
      expect(result).toEqual(RESULT);
    });

    it('karigarPerformance delegates date range', async () => {
      manufacturingService.karigarPerformance.mockResolvedValue(RESULT);
      const result = await caller.karigarPerformance({ dateRange: RANGE });
      expect(manufacturingService.karigarPerformance).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('materialUsageReport delegates date range', async () => {
      manufacturingService.materialUsageReport.mockResolvedValue(RESULT);
      const result = await caller.materialUsageReport({ dateRange: RANGE });
      expect(manufacturingService.materialUsageReport).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('wastageReport delegates date range', async () => {
      manufacturingService.wastageReport.mockResolvedValue(RESULT);
      const result = await caller.wastageReport({ dateRange: RANGE });
      expect(manufacturingService.wastageReport).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('productionTimeline delegates date range', async () => {
      manufacturingService.productionTimeline.mockResolvedValue(RESULT);
      const result = await caller.productionTimeline({ dateRange: RANGE });
      expect(manufacturingService.productionTimeline).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('costAnalysis delegates date range', async () => {
      manufacturingService.costAnalysis.mockResolvedValue(RESULT);
      const result = await caller.costAnalysis({ dateRange: RANGE });
      expect(manufacturingService.costAnalysis).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });
  });

  // ─── CRM ────────────────────────────────────────────────
  describe('CRM reports', () => {
    it('customerAcquisition delegates date range', async () => {
      crmService.customerAcquisition.mockResolvedValue(RESULT);
      const result = await caller.customerAcquisition({ dateRange: RANGE });
      expect(crmService.customerAcquisition).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('customerRetention delegates date range', async () => {
      crmService.customerRetention.mockResolvedValue(RESULT);
      const result = await caller.customerRetention({ dateRange: RANGE });
      expect(crmService.customerRetention).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('customerLifetimeValue applies limit default of 50', async () => {
      crmService.customerLifetimeValue.mockResolvedValue(RESULT);
      const result = await caller.customerLifetimeValue({ dateRange: RANGE });
      expect(crmService.customerLifetimeValue).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE, 50);
      expect(result).toEqual(RESULT);
    });

    it('customerLifetimeValue rejects limit above 500', async () => {
      await expect(
        caller.customerLifetimeValue({ dateRange: RANGE, limit: 501 }),
      ).rejects.toThrow();
    });

    it('loyaltyMetrics delegates with tenant only', async () => {
      crmService.loyaltyMetrics.mockResolvedValue(RESULT);
      const result = await caller.loyaltyMetrics();
      expect(crmService.loyaltyMetrics).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual(RESULT);
    });

    it('leadConversion delegates date range', async () => {
      crmService.leadConversion.mockResolvedValue(RESULT);
      const result = await caller.leadConversion({ dateRange: RANGE });
      expect(crmService.leadConversion).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('campaignPerformance delegates date range', async () => {
      crmService.campaignPerformance.mockResolvedValue(RESULT);
      const result = await caller.campaignPerformance({ dateRange: RANGE });
      expect(crmService.campaignPerformance).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });

    it('crmOverview delegates date range', async () => {
      crmService.crmOverview.mockResolvedValue(RESULT);
      const result = await caller.crmOverview({ dateRange: RANGE });
      expect(crmService.crmOverview).toHaveBeenCalledWith('tenant-1', EXPECTED_RANGE);
      expect(result).toEqual(RESULT);
    });
  });

  // ─── Forecasting ────────────────────────────────────────
  describe('forecasting', () => {
    it('demandForecast passes parsed input with periods default', async () => {
      forecastService.demandForecast.mockResolvedValue(RESULT);
      const result = await caller.demandForecast({ productId: PRODUCT_ID });
      expect(forecastService.demandForecast).toHaveBeenCalledWith('tenant-1', {
        productId: PRODUCT_ID,
        periods: 6,
      });
      expect(result).toEqual(RESULT);
    });

    it('reorderPointCalculation applies serviceLevel default of 0.95', async () => {
      forecastService.reorderPointCalculation.mockResolvedValue(RESULT);
      const result = await caller.reorderPointCalculation({ productId: PRODUCT_ID, leadTimeDays: 14 });
      expect(forecastService.reorderPointCalculation).toHaveBeenCalledWith('tenant-1', PRODUCT_ID, 14, 0.95);
      expect(result).toEqual(RESULT);
    });

    it('reorderPointCalculation forwards explicit serviceLevel', async () => {
      forecastService.reorderPointCalculation.mockResolvedValue(RESULT);
      await caller.reorderPointCalculation({ productId: PRODUCT_ID, leadTimeDays: 7, serviceLevel: 0.99 });
      expect(forecastService.reorderPointCalculation).toHaveBeenCalledWith('tenant-1', PRODUCT_ID, 7, 0.99);
    });

    it('reorderPointCalculation rejects serviceLevel of 1', async () => {
      await expect(
        caller.reorderPointCalculation({ productId: PRODUCT_ID, leadTimeDays: 7, serviceLevel: 1 }),
      ).rejects.toThrow();
    });

    it('seasonalityAnalysis applies years default of 2', async () => {
      forecastService.seasonalityAnalysis.mockResolvedValue(RESULT);
      const result = await caller.seasonalityAnalysis({ categoryId: CATEGORY_ID });
      expect(forecastService.seasonalityAnalysis).toHaveBeenCalledWith('tenant-1', CATEGORY_ID, 2);
      expect(result).toEqual(RESULT);
    });

    it('seasonalityAnalysis forwards explicit years', async () => {
      forecastService.seasonalityAnalysis.mockResolvedValue(RESULT);
      await caller.seasonalityAnalysis({ years: 4 });
      expect(forecastService.seasonalityAnalysis).toHaveBeenCalledWith('tenant-1', undefined, 4);
    });
  });

  // ─── Custom reports ─────────────────────────────────────
  describe('custom reports', () => {
    it('executeCustomReport fills array defaults before delegating', async () => {
      customService.executeCustomReport.mockResolvedValue(RESULT);
      const result = await caller.executeCustomReport({ entityType: 'sales', columns: ['id'] });
      expect(customService.executeCustomReport).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          entityType: 'sales',
          columns: ['id'],
          filters: [],
          groupBy: [],
          aggregations: [],
          sortBy: [],
        }),
      );
      expect(result).toEqual(RESULT);
    });

    it('executeCustomReport rejects empty columns', async () => {
      await expect(
        caller.executeCustomReport({ entityType: 'sales', columns: [] }),
      ).rejects.toThrow();
    });

    it('validateReportConfig delegates the parsed config', async () => {
      customService.validateReportConfig.mockResolvedValue(RESULT);
      const result = await caller.validateReportConfig({ entityType: 'stock', columns: ['sku'] });
      expect(customService.validateReportConfig).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'stock', columns: ['sku'], filters: [] }),
      );
      expect(result).toEqual(RESULT);
    });

    it('getSupportedEntities delegates without input', async () => {
      customService.getSupportedEntities.mockReturnValue([{ name: 'sales' }]);
      const result = await caller.getSupportedEntities();
      expect(customService.getSupportedEntities).toHaveBeenCalledWith();
      expect(result).toEqual([{ name: 'sales' }]);
    });
  });

  // ─── Saved reports (direct prisma) ──────────────────────
  describe('saved reports', () => {
    it('createSavedReport writes tenant, creator and defaults via prisma', async () => {
      const created = { id: REPORT_ID, name: 'Daily' };
      prisma.savedReport.create.mockResolvedValue(created);
      const result = await caller.createSavedReport({ name: 'Daily', reportType: 'SALES' });
      expect(prisma.savedReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          name: 'Daily',
          reportType: 'SALES',
          isDefault: false,
          createdBy: 'user-1',
        }),
      });
      expect(result).toEqual(created);
    });

    it('createSavedReport forwards optional fields', async () => {
      prisma.savedReport.create.mockResolvedValue({ id: REPORT_ID });
      await caller.createSavedReport({
        name: 'Stock',
        description: 'Desc',
        reportType: 'INVENTORY',
        filters: { location: 'main' },
        columns: ['sku'],
        groupBy: ['category'],
        sortBy: [{ field: 'sku', order: 'asc' }],
        chartType: 'bar',
        isDefault: true,
      });
      expect(prisma.savedReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'Desc',
          filters: { location: 'main' },
          columns: ['sku'],
          groupBy: ['category'],
          sortBy: [{ field: 'sku', order: 'asc' }],
          chartType: 'bar',
          isDefault: true,
        }),
      });
    });

    it('listSavedReports without input lists all tenant reports', async () => {
      prisma.savedReport.findMany.mockResolvedValue([{ id: REPORT_ID }]);
      const result = await caller.listSavedReports();
      expect(prisma.savedReport.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      });
      expect(result).toEqual([{ id: REPORT_ID }]);
    });

    it('listSavedReports filters by reportType when provided', async () => {
      prisma.savedReport.findMany.mockResolvedValue([]);
      await caller.listSavedReports({ reportType: 'CRM' });
      expect(prisma.savedReport.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', reportType: 'CRM' },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      });
    });

    it('getSavedReport scopes lookup to id and tenant', async () => {
      prisma.savedReport.findFirst.mockResolvedValue({ id: REPORT_ID });
      const result = await caller.getSavedReport({ id: REPORT_ID });
      expect(prisma.savedReport.findFirst).toHaveBeenCalledWith({
        where: { id: REPORT_ID, tenantId: 'tenant-1' },
      });
      expect(result).toEqual({ id: REPORT_ID });
    });

    it('deleteSavedReport refuses with a readable error while schedules use the report', async () => {
      prisma.scheduledReport.count.mockResolvedValue(2);
      await expect(caller.deleteSavedReport({ id: REPORT_ID })).rejects.toThrow(
        'This report is used by 2 scheduled reports. Delete the schedules first.',
      );
      expect(prisma.savedReport.deleteMany).not.toHaveBeenCalled();
    });

    it('deleteScheduledReport removes execution history then the tenant-scoped schedule', async () => {
      prisma.reportExecution.deleteMany.mockResolvedValue({ count: 3 });
      prisma.scheduledReport.deleteMany.mockResolvedValue({ count: 1 });
      const result = await caller.deleteScheduledReport({ id: SCHEDULE_ID });
      expect(prisma.reportExecution.deleteMany).toHaveBeenCalledWith({
        where: { scheduledReportId: SCHEDULE_ID, tenantId: 'tenant-1' },
      });
      expect(prisma.scheduledReport.deleteMany).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID, tenantId: 'tenant-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('deleteSavedReport deletes tenant-scoped row and returns success', async () => {
      prisma.scheduledReport.count.mockResolvedValue(0);
      prisma.savedReport.deleteMany.mockResolvedValue({ count: 1 });
      const result = await caller.deleteSavedReport({ id: REPORT_ID });
      expect(prisma.savedReport.deleteMany).toHaveBeenCalledWith({
        where: { id: REPORT_ID, tenantId: 'tenant-1' },
      });
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Scheduled reports and executions (direct prisma) ───
  describe('scheduled reports', () => {
    const scheduleInput = {
      savedReportId: REPORT_ID,
      frequency: 'WEEKLY' as const,
      dayOfWeek: 1,
      timeOfDay: '09:30',
      recipients: ['owner@example.com'],
    };

    it('createScheduledReport applies format and isActive defaults', async () => {
      const created = { id: SCHEDULE_ID };
      prisma.scheduledReport.create.mockResolvedValue(created);
      const result = await caller.createScheduledReport(scheduleInput);
      expect(prisma.scheduledReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          savedReportId: REPORT_ID,
          frequency: 'WEEKLY',
          dayOfWeek: 1,
          timeOfDay: '09:30',
          format: 'PDF',
          recipients: ['owner@example.com'],
          isActive: true,
          createdBy: 'user-1',
        }),
      });
      expect(result).toEqual(created);
    });

    it('createScheduledReport rejects malformed timeOfDay', async () => {
      await expect(
        caller.createScheduledReport({ ...scheduleInput, timeOfDay: '9am' }),
      ).rejects.toThrow();
      expect(prisma.scheduledReport.create).not.toHaveBeenCalled();
    });

    it('listScheduledReports includes the saved report, newest first', async () => {
      prisma.scheduledReport.findMany.mockResolvedValue([{ id: SCHEDULE_ID }]);
      const result = await caller.listScheduledReports();
      expect(prisma.scheduledReport.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        include: { savedReport: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: SCHEDULE_ID }]);
    });

    it('toggleScheduledReport updates tenant-scoped row and records updater', async () => {
      prisma.scheduledReport.updateMany.mockResolvedValue({ count: 1 });
      const result = await caller.toggleScheduledReport({ id: SCHEDULE_ID, isActive: false });
      expect(prisma.scheduledReport.updateMany).toHaveBeenCalledWith({
        where: { id: SCHEDULE_ID, tenantId: 'tenant-1' },
        data: { isActive: false, updatedBy: 'user-1' },
      });
      expect(result).toEqual({ count: 1 });
    });

    it('listExecutions without input uses limit 20 and no schedule filter', async () => {
      prisma.reportExecution.findMany.mockResolvedValue([]);
      const result = await caller.listExecutions();
      expect(prisma.reportExecution.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      expect(result).toEqual([]);
    });

    it('listExecutions filters by scheduledReportId with explicit limit', async () => {
      prisma.reportExecution.findMany.mockResolvedValue([{ id: 'exec-1' }]);
      const result = await caller.listExecutions({ scheduledReportId: SCHEDULE_ID, limit: 5 });
      expect(prisma.reportExecution.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', scheduledReportId: SCHEDULE_ID },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      expect(result).toEqual([{ id: 'exec-1' }]);
    });
  });

  // ─── Dashboard ──────────────────────────────────────────
  describe('dashboard', () => {
    it('getAnalyticsDashboard works without input', async () => {
      dashboardService.getAnalyticsDashboard.mockResolvedValue(RESULT);
      const result = await caller.getAnalyticsDashboard();
      expect(dashboardService.getAnalyticsDashboard).toHaveBeenCalledWith('tenant-1', undefined, undefined);
      expect(result).toEqual(RESULT);
    });

    it('getAnalyticsDashboard forwards date range and location', async () => {
      dashboardService.getAnalyticsDashboard.mockResolvedValue(RESULT);
      await caller.getAnalyticsDashboard({ dateRange: RANGE, locationId: LOCATION_ID });
      expect(dashboardService.getAnalyticsDashboard).toHaveBeenCalledWith(
        'tenant-1',
        EXPECTED_RANGE,
        LOCATION_ID,
      );
    });

    it('saveDashboardLayout passes tenant, user and parsed layout', async () => {
      dashboardService.saveDashboardLayout.mockResolvedValue(RESULT);
      const layout = [{ widgetId: 'w1', x: 0, y: 0, w: 4, h: 2 }];
      const result = await caller.saveDashboardLayout({ name: 'Main', layout });
      expect(dashboardService.saveDashboardLayout).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ name: 'Main', isDefault: false, layout }),
      );
      expect(result).toEqual(RESULT);
    });

    it('saveDashboardLayout rejects widget width above 12', async () => {
      await expect(
        caller.saveDashboardLayout({
          name: 'Main',
          layout: [{ widgetId: 'w1', x: 0, y: 0, w: 13, h: 2 }],
        }),
      ).rejects.toThrow();
    });

    it('getDashboardLayout delegates tenant and user', async () => {
      dashboardService.getDashboardLayout.mockResolvedValue(RESULT);
      const result = await caller.getDashboardLayout();
      expect(dashboardService.getDashboardLayout).toHaveBeenCalledWith('tenant-1', 'user-1');
      expect(result).toEqual(RESULT);
    });

    it('getWidgetData applies empty config default', async () => {
      dashboardService.getWidgetData.mockResolvedValue(RESULT);
      const result = await caller.getWidgetData({ widgetType: 'STAT_CARD' });
      expect(dashboardService.getWidgetData).toHaveBeenCalledWith('tenant-1', 'STAT_CARD', {}, undefined);
      expect(result).toEqual(RESULT);
    });

    it('getWidgetData forwards config and date range', async () => {
      dashboardService.getWidgetData.mockResolvedValue(RESULT);
      await caller.getWidgetData({
        widgetType: 'CHART',
        config: { metric: 'revenue' },
        dateRange: RANGE,
      });
      expect(dashboardService.getWidgetData).toHaveBeenCalledWith(
        'tenant-1',
        'CHART',
        { metric: 'revenue' },
        EXPECTED_RANGE,
      );
    });
  });
});
