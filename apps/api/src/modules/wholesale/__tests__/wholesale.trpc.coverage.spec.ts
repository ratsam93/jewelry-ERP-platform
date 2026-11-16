import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WholesaleCommissionRefType,
  WholesaleCommissionType,
  WholesaleCreditEntityType,
  WholesalePOStatus,
} from '@caratflow/shared-types';
import { TrpcService } from '../../../trpc/trpc.service';
import { WholesaleTrpcRouter } from '../wholesale.trpc';

// Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
const LOCATION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SUPPLIER_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
const PRODUCT_ID = '3f1e2d4c-5b6a-4789-9abc-def012345679';
const PO_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const RECEIPT_ID = '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f';
const CONSIGNMENT_ID = '4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a';
const ITEM_ID = '5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8a9b';
const CUSTOMER_ID = '6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f8a9b0c';
const AGENT_ID = '7a8b9c0d-1e2f-4a3b-8c4d-6e7f8a9b0c1d';
const COMMISSION_ID = '8b9c0d1e-2f3a-4b4c-8d5e-7f8a9b0c1d2e';
const OUTSTANDING_ID = '9c0d1e2f-3a4b-4c5d-8e6f-8a9b0c1d2e3f';
const RATE_CONTRACT_ID = '0d1e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a';
const VISIT_CUSTOMER_ID = '1e2f3a4b-5c6d-4e7f-8a8b-0c1d2e3f4a5b';

describe('WholesaleTrpcRouter (coverage)', () => {
  const trpc = new TrpcService();

  const wholesaleService = {
    getDashboard: vi.fn(),
    createPurchaseOrder: vi.fn(),
    getPurchaseOrder: vi.fn(),
    listPurchaseOrders: vi.fn(),
    sendPurchaseOrder: vi.fn(),
    cancelPurchaseOrder: vi.fn(),
    createGoodsReceipt: vi.fn(),
    getGoodsReceipt: vi.fn(),
    listGoodsReceipts: vi.fn(),
    inspectGoodsReceipt: vi.fn(),
    acceptGoodsReceipt: vi.fn(),
    rejectGoodsReceipt: vi.fn(),
  };
  const consignmentService = {
    createConsignmentOut: vi.fn(),
    getConsignmentOut: vi.fn(),
    listConsignmentsOut: vi.fn(),
    issueConsignmentOut: vi.fn(),
    returnConsignmentOutItems: vi.fn(),
    convertConsignmentOutToSale: vi.fn(),
    expireConsignmentOut: vi.fn(),
    createConsignmentIn: vi.fn(),
    getConsignmentIn: vi.fn(),
    listConsignmentsIn: vi.fn(),
    returnConsignmentInItems: vi.fn(),
    purchaseConsignmentInItems: vi.fn(),
    expireConsignmentIn: vi.fn(),
    getExpiredConsignments: vi.fn(),
  };
  const agentService = {
    createAgent: vi.fn(),
    getAgent: vi.fn(),
    listAgents: vi.fn(),
    updateAgent: vi.fn(),
    calculateCommission: vi.fn(),
    approveCommission: vi.fn(),
    markCommissionPaid: vi.fn(),
    listCommissions: vi.fn(),
    getAgentDashboard: vi.fn(),
    recordAgentVisit: vi.fn(),
  };
  const creditService = {
    setCreditLimit: vi.fn(),
    getCreditLimit: vi.fn(),
    listCreditLimits: vi.fn(),
    checkCredit: vi.fn(),
    listOutstandingBalances: vi.fn(),
    recordPaymentOnOutstanding: vi.fn(),
    updateAgingStatuses: vi.fn(),
    getAgingSummary: vi.fn(),
  };
  const rateContractService = {
    createRateContract: vi.fn(),
    getRateContract: vi.fn(),
    listRateContracts: vi.fn(),
    updateRateContract: vi.fn(),
    findApplicableRate: vi.fn(),
  };
  const supplierService = {
    listSuppliers: vi.fn(),
    getSupplier: vi.fn(),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    deactivateSupplier: vi.fn(),
    getSupplierPerformance: vi.fn(),
    listSuppliersWithPerformance: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new WholesaleTrpcRouter(
    trpc,
    wholesaleService as never,
    consignmentService as never,
    agentService as never,
    creditService as never,
    rateContractService as never,
    supplierService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const DEFAULT_PAGINATION = { page: 1, limit: 20, sortOrder: 'desc' };

  const validPoInput = {
    supplierId: SUPPLIER_ID,
    locationId: LOCATION_ID,
    items: [{ description: 'Gold chain 22K', quantity: 2, unitPricePaise: 450000 }],
  };

  // ─── Dashboard ────────────────────────────────────────────
  describe('getDashboard', () => {
    it('delegates to wholesaleService.getDashboard with tenant', async () => {
      wholesaleService.getDashboard.mockResolvedValue({ openPurchaseOrders: 1 });
      const result = await caller.getDashboard();
      expect(wholesaleService.getDashboard).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ openPurchaseOrders: 1 });
    });
  });

  // ─── Purchase Orders ──────────────────────────────────────
  describe('createPurchaseOrder', () => {
    it('delegates to wholesaleService.createPurchaseOrder', async () => {
      wholesaleService.createPurchaseOrder.mockResolvedValue({ id: PO_ID });
      const result = await caller.createPurchaseOrder(validPoInput);
      expect(wholesaleService.createPurchaseOrder).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ supplierId: SUPPLIER_ID }),
      );
      expect(result).toEqual({ id: PO_ID });
    });

    it('rejects a PO with no items', async () => {
      await expect(caller.createPurchaseOrder({ ...validPoInput, items: [] })).rejects.toThrow();
    });
  });

  describe('getPurchaseOrder', () => {
    it('delegates to wholesaleService.getPurchaseOrder', async () => {
      wholesaleService.getPurchaseOrder.mockResolvedValue({ id: PO_ID });
      await caller.getPurchaseOrder({ poId: PO_ID });
      expect(wholesaleService.getPurchaseOrder).toHaveBeenCalledWith('tenant-1', PO_ID);
    });

    it('rejects a non-uuid poId', async () => {
      await expect(caller.getPurchaseOrder({ poId: 'x' })).rejects.toThrow();
    });
  });

  describe('listPurchaseOrders', () => {
    it('uses default filters and pagination', async () => {
      wholesaleService.listPurchaseOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.listPurchaseOrders({});
      expect(wholesaleService.listPurchaseOrders).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards status filter and pagination', async () => {
      wholesaleService.listPurchaseOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.listPurchaseOrders({
        filters: { status: WholesalePOStatus.SENT },
        pagination: { page: 2, limit: 10, sortOrder: 'asc' },
      });
      expect(wholesaleService.listPurchaseOrders).toHaveBeenCalledWith(
        'tenant-1',
        { status: WholesalePOStatus.SENT },
        { page: 2, limit: 10, sortOrder: 'asc' },
      );
    });
  });

  describe('sendPurchaseOrder', () => {
    it('delegates to wholesaleService.sendPurchaseOrder', async () => {
      wholesaleService.sendPurchaseOrder.mockResolvedValue({});
      await caller.sendPurchaseOrder({ poId: PO_ID });
      expect(wholesaleService.sendPurchaseOrder).toHaveBeenCalledWith('tenant-1', 'user-1', PO_ID);
    });
  });

  describe('cancelPurchaseOrder', () => {
    it('delegates to wholesaleService.cancelPurchaseOrder with reason', async () => {
      wholesaleService.cancelPurchaseOrder.mockResolvedValue({});
      await caller.cancelPurchaseOrder({ poId: PO_ID, reason: 'supplier delay' });
      expect(wholesaleService.cancelPurchaseOrder).toHaveBeenCalledWith(
        'tenant-1', 'user-1', PO_ID, 'supplier delay',
      );
    });

    it('rejects an empty reason', async () => {
      await expect(caller.cancelPurchaseOrder({ poId: PO_ID, reason: '' })).rejects.toThrow();
    });
  });

  // ─── Goods Receipts ───────────────────────────────────────
  const validReceiptInput = {
    purchaseOrderId: PO_ID,
    items: [{
      productId: PRODUCT_ID,
      receivedQuantity: 2,
      acceptedQuantity: 2,
      rejectedQuantity: 0,
      weightMg: 40000,
    }],
  };

  describe('createGoodsReceipt', () => {
    it('delegates to wholesaleService.createGoodsReceipt', async () => {
      wholesaleService.createGoodsReceipt.mockResolvedValue({ id: RECEIPT_ID });
      const result = await caller.createGoodsReceipt(validReceiptInput);
      expect(wholesaleService.createGoodsReceipt).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ purchaseOrderId: PO_ID }),
      );
      expect(result).toEqual({ id: RECEIPT_ID });
    });

    it('rejects a receipt with no items', async () => {
      await expect(
        caller.createGoodsReceipt({ ...validReceiptInput, items: [] }),
      ).rejects.toThrow();
    });
  });

  describe('getGoodsReceipt', () => {
    it('delegates to wholesaleService.getGoodsReceipt', async () => {
      wholesaleService.getGoodsReceipt.mockResolvedValue({ id: RECEIPT_ID });
      await caller.getGoodsReceipt({ receiptId: RECEIPT_ID });
      expect(wholesaleService.getGoodsReceipt).toHaveBeenCalledWith('tenant-1', RECEIPT_ID);
    });
  });

  describe('listGoodsReceipts', () => {
    it('passes undefined poId and default pagination when omitted', async () => {
      wholesaleService.listGoodsReceipts.mockResolvedValue({ items: [], total: 0 });
      await caller.listGoodsReceipts({});
      expect(wholesaleService.listGoodsReceipts).toHaveBeenCalledWith(
        'tenant-1', undefined, DEFAULT_PAGINATION,
      );
    });

    it('forwards poId and pagination', async () => {
      wholesaleService.listGoodsReceipts.mockResolvedValue({ items: [], total: 0 });
      await caller.listGoodsReceipts({
        poId: PO_ID,
        pagination: { page: 1, limit: 5, sortOrder: 'asc' },
      });
      expect(wholesaleService.listGoodsReceipts).toHaveBeenCalledWith(
        'tenant-1', PO_ID, { page: 1, limit: 5, sortOrder: 'asc' },
      );
    });
  });

  describe('inspectGoodsReceipt', () => {
    it('delegates to wholesaleService.inspectGoodsReceipt', async () => {
      wholesaleService.inspectGoodsReceipt.mockResolvedValue({});
      await caller.inspectGoodsReceipt({ receiptId: RECEIPT_ID });
      expect(wholesaleService.inspectGoodsReceipt).toHaveBeenCalledWith(
        'tenant-1', 'user-1', RECEIPT_ID,
      );
    });
  });

  describe('acceptGoodsReceipt', () => {
    it('delegates to wholesaleService.acceptGoodsReceipt', async () => {
      wholesaleService.acceptGoodsReceipt.mockResolvedValue({});
      await caller.acceptGoodsReceipt({ receiptId: RECEIPT_ID });
      expect(wholesaleService.acceptGoodsReceipt).toHaveBeenCalledWith(
        'tenant-1', 'user-1', RECEIPT_ID,
      );
    });
  });

  describe('rejectGoodsReceipt', () => {
    it('delegates to wholesaleService.rejectGoodsReceipt with reason', async () => {
      wholesaleService.rejectGoodsReceipt.mockResolvedValue({});
      await caller.rejectGoodsReceipt({ receiptId: RECEIPT_ID, reason: 'purity short' });
      expect(wholesaleService.rejectGoodsReceipt).toHaveBeenCalledWith(
        'tenant-1', 'user-1', RECEIPT_ID, 'purity short',
      );
    });

    it('rejects an empty reason', async () => {
      await expect(
        caller.rejectGoodsReceipt({ receiptId: RECEIPT_ID, reason: '' }),
      ).rejects.toThrow();
    });
  });

  // ─── Consignment Out ──────────────────────────────────────
  const validConsignmentOut = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1, weightMg: 5000, valuePaise: 300000 }],
  };

  describe('createConsignmentOut', () => {
    it('delegates to consignmentService.createConsignmentOut', async () => {
      consignmentService.createConsignmentOut.mockResolvedValue({ id: CONSIGNMENT_ID });
      const result = await caller.createConsignmentOut(validConsignmentOut);
      expect(consignmentService.createConsignmentOut).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ customerId: CUSTOMER_ID }),
      );
      expect(result).toEqual({ id: CONSIGNMENT_ID });
    });

    it('rejects a consignment with no items', async () => {
      await expect(
        caller.createConsignmentOut({ ...validConsignmentOut, items: [] }),
      ).rejects.toThrow();
    });
  });

  describe('getConsignmentOut', () => {
    it('delegates to consignmentService.getConsignmentOut', async () => {
      consignmentService.getConsignmentOut.mockResolvedValue({ id: CONSIGNMENT_ID });
      await caller.getConsignmentOut({ id: CONSIGNMENT_ID });
      expect(consignmentService.getConsignmentOut).toHaveBeenCalledWith('tenant-1', CONSIGNMENT_ID);
    });
  });

  describe('listConsignmentsOut', () => {
    it('uses default filters and pagination', async () => {
      consignmentService.listConsignmentsOut.mockResolvedValue({ items: [], total: 0 });
      await caller.listConsignmentsOut({});
      expect(consignmentService.listConsignmentsOut).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards customer filter', async () => {
      consignmentService.listConsignmentsOut.mockResolvedValue({ items: [], total: 0 });
      await caller.listConsignmentsOut({ filters: { customerId: CUSTOMER_ID } });
      expect(consignmentService.listConsignmentsOut).toHaveBeenCalledWith(
        'tenant-1', { customerId: CUSTOMER_ID }, DEFAULT_PAGINATION,
      );
    });
  });

  describe('issueConsignmentOut', () => {
    it('delegates to consignmentService.issueConsignmentOut', async () => {
      consignmentService.issueConsignmentOut.mockResolvedValue({});
      await caller.issueConsignmentOut({ id: CONSIGNMENT_ID });
      expect(consignmentService.issueConsignmentOut).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID,
      );
    });
  });

  describe('returnConsignmentOutItems', () => {
    it('delegates returned item lines to consignmentService', async () => {
      consignmentService.returnConsignmentOutItems.mockResolvedValue({});
      const items = [{ itemId: ITEM_ID, returnedQuantity: 1 }];
      await caller.returnConsignmentOutItems({ consignmentId: CONSIGNMENT_ID, items });
      expect(consignmentService.returnConsignmentOutItems).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID, items,
      );
    });

    it('rejects an empty items list', async () => {
      await expect(
        caller.returnConsignmentOutItems({ consignmentId: CONSIGNMENT_ID, items: [] }),
      ).rejects.toThrow();
    });
  });

  describe('convertConsignmentOutToSale', () => {
    it('delegates sold item lines to consignmentService', async () => {
      consignmentService.convertConsignmentOutToSale.mockResolvedValue({});
      const items = [{ itemId: ITEM_ID, soldQuantity: 1 }];
      await caller.convertConsignmentOutToSale({ consignmentId: CONSIGNMENT_ID, items });
      expect(consignmentService.convertConsignmentOutToSale).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID, items,
      );
    });

    it('rejects a non-positive sold quantity', async () => {
      await expect(
        caller.convertConsignmentOutToSale({
          consignmentId: CONSIGNMENT_ID,
          items: [{ itemId: ITEM_ID, soldQuantity: 0 }],
        }),
      ).rejects.toThrow();
    });
  });

  describe('expireConsignmentOut', () => {
    it('delegates to consignmentService.expireConsignmentOut', async () => {
      consignmentService.expireConsignmentOut.mockResolvedValue({});
      await caller.expireConsignmentOut({ id: CONSIGNMENT_ID });
      expect(consignmentService.expireConsignmentOut).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID,
      );
    });
  });

  // ─── Consignment In ───────────────────────────────────────
  const validConsignmentIn = {
    supplierId: SUPPLIER_ID,
    locationId: LOCATION_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1, weightMg: 3000, valuePaise: 150000 }],
  };

  describe('createConsignmentIn', () => {
    it('delegates to consignmentService.createConsignmentIn', async () => {
      consignmentService.createConsignmentIn.mockResolvedValue({ id: CONSIGNMENT_ID });
      await caller.createConsignmentIn(validConsignmentIn);
      expect(consignmentService.createConsignmentIn).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ supplierId: SUPPLIER_ID }),
      );
    });

    it('rejects a consignment with no items', async () => {
      await expect(
        caller.createConsignmentIn({ ...validConsignmentIn, items: [] }),
      ).rejects.toThrow();
    });
  });

  describe('getConsignmentIn', () => {
    it('delegates to consignmentService.getConsignmentIn', async () => {
      consignmentService.getConsignmentIn.mockResolvedValue({ id: CONSIGNMENT_ID });
      await caller.getConsignmentIn({ id: CONSIGNMENT_ID });
      expect(consignmentService.getConsignmentIn).toHaveBeenCalledWith('tenant-1', CONSIGNMENT_ID);
    });
  });

  describe('listConsignmentsIn', () => {
    it('uses default filters and pagination', async () => {
      consignmentService.listConsignmentsIn.mockResolvedValue({ items: [], total: 0 });
      await caller.listConsignmentsIn({});
      expect(consignmentService.listConsignmentsIn).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards supplier filter', async () => {
      consignmentService.listConsignmentsIn.mockResolvedValue({ items: [], total: 0 });
      await caller.listConsignmentsIn({ filters: { supplierId: SUPPLIER_ID, status: 'OPEN' } });
      expect(consignmentService.listConsignmentsIn).toHaveBeenCalledWith(
        'tenant-1', { supplierId: SUPPLIER_ID, status: 'OPEN' }, DEFAULT_PAGINATION,
      );
    });
  });

  describe('returnConsignmentInItems', () => {
    it('delegates returned item lines to consignmentService', async () => {
      consignmentService.returnConsignmentInItems.mockResolvedValue({});
      const items = [{ itemId: ITEM_ID, returnedQuantity: 1 }];
      await caller.returnConsignmentInItems({ consignmentId: CONSIGNMENT_ID, items });
      expect(consignmentService.returnConsignmentInItems).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID, items,
      );
    });
  });

  describe('purchaseConsignmentInItems', () => {
    it('delegates purchased item lines to consignmentService', async () => {
      consignmentService.purchaseConsignmentInItems.mockResolvedValue({});
      const items = [{ itemId: ITEM_ID, purchasedQuantity: 1 }];
      await caller.purchaseConsignmentInItems({ consignmentId: CONSIGNMENT_ID, items });
      expect(consignmentService.purchaseConsignmentInItems).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID, items,
      );
    });
  });

  describe('expireConsignmentIn', () => {
    it('delegates to consignmentService.expireConsignmentIn', async () => {
      consignmentService.expireConsignmentIn.mockResolvedValue({});
      await caller.expireConsignmentIn({ id: CONSIGNMENT_ID });
      expect(consignmentService.expireConsignmentIn).toHaveBeenCalledWith(
        'tenant-1', 'user-1', CONSIGNMENT_ID,
      );
    });
  });

  describe('getExpiredConsignments', () => {
    it('delegates to consignmentService.getExpiredConsignments', async () => {
      consignmentService.getExpiredConsignments.mockResolvedValue([]);
      const result = await caller.getExpiredConsignments();
      expect(consignmentService.getExpiredConsignments).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([]);
    });
  });

  // ─── Rate Contracts ───────────────────────────────────────
  const validRateContract = {
    supplierId: SUPPLIER_ID,
    validFrom: '2026-04-01',
    validTo: '2027-03-31',
    ratePerGramPaise: 6000,
  };

  describe('createRateContract', () => {
    it('delegates to rateContractService.createRateContract', async () => {
      rateContractService.createRateContract.mockResolvedValue({ id: RATE_CONTRACT_ID });
      await caller.createRateContract(validRateContract);
      expect(rateContractService.createRateContract).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ supplierId: SUPPLIER_ID, ratePerGramPaise: 6000 }),
      );
    });

    it('rejects a non-positive rate', async () => {
      await expect(
        caller.createRateContract({ ...validRateContract, ratePerGramPaise: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('getRateContract', () => {
    it('delegates to rateContractService.getRateContract', async () => {
      rateContractService.getRateContract.mockResolvedValue({ id: RATE_CONTRACT_ID });
      await caller.getRateContract({ id: RATE_CONTRACT_ID });
      expect(rateContractService.getRateContract).toHaveBeenCalledWith('tenant-1', RATE_CONTRACT_ID);
    });
  });

  describe('listRateContracts', () => {
    it('uses default filters and pagination', async () => {
      rateContractService.listRateContracts.mockResolvedValue({ items: [], total: 0 });
      await caller.listRateContracts({});
      expect(rateContractService.listRateContracts).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards supplier and active filters', async () => {
      rateContractService.listRateContracts.mockResolvedValue({ items: [], total: 0 });
      await caller.listRateContracts({ filters: { supplierId: SUPPLIER_ID, isActive: true } });
      expect(rateContractService.listRateContracts).toHaveBeenCalledWith(
        'tenant-1', { supplierId: SUPPLIER_ID, isActive: true }, DEFAULT_PAGINATION,
      );
    });
  });

  describe('updateRateContract', () => {
    it('delegates partial update data to rateContractService', async () => {
      rateContractService.updateRateContract.mockResolvedValue({});
      await caller.updateRateContract({ id: RATE_CONTRACT_ID, data: { ratePerGramPaise: 6500 } });
      expect(rateContractService.updateRateContract).toHaveBeenCalledWith(
        'tenant-1', 'user-1', RATE_CONTRACT_ID, { ratePerGramPaise: 6500 },
      );
    });
  });

  describe('findApplicableRate', () => {
    it('delegates with optional category and metal type', async () => {
      rateContractService.findApplicableRate.mockResolvedValue({ ratePerGramPaise: 6000 });
      const result = await caller.findApplicableRate({
        supplierId: SUPPLIER_ID,
        categoryId: PRODUCT_ID,
        metalType: 'GOLD',
      });
      expect(rateContractService.findApplicableRate).toHaveBeenCalledWith(
        'tenant-1', SUPPLIER_ID, PRODUCT_ID, 'GOLD',
      );
      expect(result).toEqual({ ratePerGramPaise: 6000 });
    });

    it('passes undefined optional fields when omitted', async () => {
      rateContractService.findApplicableRate.mockResolvedValue(null);
      await caller.findApplicableRate({ supplierId: SUPPLIER_ID });
      expect(rateContractService.findApplicableRate).toHaveBeenCalledWith(
        'tenant-1', SUPPLIER_ID, undefined, undefined,
      );
    });
  });

  // ─── Agents / Brokers ─────────────────────────────────────
  const validAgent = {
    name: 'Ravi Broker',
    commissionType: WholesaleCommissionType.PERCENTAGE,
    commissionRate: 200,
  };

  describe('createAgent', () => {
    it('delegates to agentService.createAgent', async () => {
      agentService.createAgent.mockResolvedValue({ id: AGENT_ID });
      const result = await caller.createAgent(validAgent);
      expect(agentService.createAgent).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ name: 'Ravi Broker' }),
      );
      expect(result).toEqual({ id: AGENT_ID });
    });

    it('rejects an empty name', async () => {
      await expect(caller.createAgent({ ...validAgent, name: '' })).rejects.toThrow();
    });
  });

  describe('getAgent', () => {
    it('delegates to agentService.getAgent', async () => {
      agentService.getAgent.mockResolvedValue({ id: AGENT_ID });
      await caller.getAgent({ agentId: AGENT_ID });
      expect(agentService.getAgent).toHaveBeenCalledWith('tenant-1', AGENT_ID);
    });
  });

  describe('listAgents', () => {
    it('uses default filters and pagination', async () => {
      agentService.listAgents.mockResolvedValue({ items: [], total: 0 });
      await caller.listAgents({});
      expect(agentService.listAgents).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards isActive filter', async () => {
      agentService.listAgents.mockResolvedValue({ items: [], total: 0 });
      await caller.listAgents({ filters: { isActive: false } });
      expect(agentService.listAgents).toHaveBeenCalledWith(
        'tenant-1', { isActive: false }, DEFAULT_PAGINATION,
      );
    });
  });

  describe('updateAgent', () => {
    it('delegates partial update data to agentService.updateAgent', async () => {
      agentService.updateAgent.mockResolvedValue({});
      await caller.updateAgent({ agentId: AGENT_ID, data: { isActive: false } });
      expect(agentService.updateAgent).toHaveBeenCalledWith(
        'tenant-1', 'user-1', AGENT_ID, { isActive: false },
      );
    });
  });

  describe('calculateCommission', () => {
    it('delegates commission input to agentService.calculateCommission', async () => {
      agentService.calculateCommission.mockResolvedValue({ id: COMMISSION_ID });
      const input = {
        agentBrokerId: AGENT_ID,
        referenceType: WholesaleCommissionRefType.SALE,
        referenceId: PO_ID,
        amountPaise: 10000,
      };
      await caller.calculateCommission(input);
      expect(agentService.calculateCommission).toHaveBeenCalledWith('tenant-1', 'user-1', input);
    });
  });

  describe('approveCommission', () => {
    it('delegates to agentService.approveCommission', async () => {
      agentService.approveCommission.mockResolvedValue({});
      await caller.approveCommission({ commissionId: COMMISSION_ID });
      expect(agentService.approveCommission).toHaveBeenCalledWith(
        'tenant-1', 'user-1', COMMISSION_ID,
      );
    });
  });

  describe('markCommissionPaid', () => {
    it('delegates with payment reference', async () => {
      agentService.markCommissionPaid.mockResolvedValue({});
      await caller.markCommissionPaid({ commissionId: COMMISSION_ID, paymentReference: 'UTR123' });
      expect(agentService.markCommissionPaid).toHaveBeenCalledWith(
        'tenant-1', 'user-1', COMMISSION_ID, 'UTR123',
      );
    });

    it('passes undefined reference when omitted', async () => {
      agentService.markCommissionPaid.mockResolvedValue({});
      await caller.markCommissionPaid({ commissionId: COMMISSION_ID });
      expect(agentService.markCommissionPaid).toHaveBeenCalledWith(
        'tenant-1', 'user-1', COMMISSION_ID, undefined,
      );
    });
  });

  describe('listCommissions', () => {
    it('uses default filters and pagination', async () => {
      agentService.listCommissions.mockResolvedValue({ items: [], total: 0 });
      await caller.listCommissions({});
      expect(agentService.listCommissions).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards agent and status filters', async () => {
      agentService.listCommissions.mockResolvedValue({ items: [], total: 0 });
      await caller.listCommissions({ filters: { agentBrokerId: AGENT_ID, status: 'PENDING' } });
      expect(agentService.listCommissions).toHaveBeenCalledWith(
        'tenant-1', { agentBrokerId: AGENT_ID, status: 'PENDING' }, DEFAULT_PAGINATION,
      );
    });
  });

  describe('agentDashboard', () => {
    it('delegates to agentService.getAgentDashboard', async () => {
      agentService.getAgentDashboard.mockResolvedValue({ visitsToday: 2 });
      const result = await caller.agentDashboard({ agentId: AGENT_ID });
      expect(agentService.getAgentDashboard).toHaveBeenCalledWith('tenant-1', AGENT_ID);
      expect(result).toEqual({ visitsToday: 2 });
    });
  });

  describe('recordAgentVisit', () => {
    it('coerces visitDate and delegates to agentService.recordAgentVisit', async () => {
      agentService.recordAgentVisit.mockResolvedValue({});
      await caller.recordAgentVisit({
        agentId: AGENT_ID,
        customerId: VISIT_CUSTOMER_ID,
        visitDate: '2026-11-17',
        notes: 'Showed bridal sets',
        outcome: 'follow-up',
      });
      expect(agentService.recordAgentVisit).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          agentId: AGENT_ID,
          customerId: VISIT_CUSTOMER_ID,
          visitDate: expect.any(Date),
          notes: 'Showed bridal sets',
        }),
      );
    });

    it('rejects notes longer than 2000 characters', async () => {
      await expect(
        caller.recordAgentVisit({
          agentId: AGENT_ID,
          customerId: VISIT_CUSTOMER_ID,
          visitDate: '2026-11-17',
          notes: 'x'.repeat(2001),
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Credit Limits ────────────────────────────────────────
  describe('setCreditLimit', () => {
    it('delegates to creditService.setCreditLimit', async () => {
      creditService.setCreditLimit.mockResolvedValue({});
      const input = {
        entityType: WholesaleCreditEntityType.CUSTOMER,
        entityId: CUSTOMER_ID,
        creditLimitPaise: 5000000,
      };
      await caller.setCreditLimit(input);
      expect(creditService.setCreditLimit).toHaveBeenCalledWith('tenant-1', 'user-1', input);
    });
  });

  describe('getCreditLimit', () => {
    it('delegates entity type and id to creditService.getCreditLimit', async () => {
      creditService.getCreditLimit.mockResolvedValue({ creditLimitPaise: 5000000 });
      const result = await caller.getCreditLimit({
        entityType: WholesaleCreditEntityType.SUPPLIER,
        entityId: SUPPLIER_ID,
      });
      expect(creditService.getCreditLimit).toHaveBeenCalledWith(
        'tenant-1', WholesaleCreditEntityType.SUPPLIER, SUPPLIER_ID,
      );
      expect(result).toEqual({ creditLimitPaise: 5000000 });
    });

    it('rejects an unknown entity type', async () => {
      await expect(
        caller.getCreditLimit({ entityType: 'BANK' as never, entityId: CUSTOMER_ID }),
      ).rejects.toThrow();
    });
  });

  describe('listCreditLimits', () => {
    it('uses default filters and pagination', async () => {
      creditService.listCreditLimits.mockResolvedValue({ items: [], total: 0 });
      await caller.listCreditLimits({});
      expect(creditService.listCreditLimits).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards entityType filter', async () => {
      creditService.listCreditLimits.mockResolvedValue({ items: [], total: 0 });
      await caller.listCreditLimits({
        filters: { entityType: WholesaleCreditEntityType.CUSTOMER },
      });
      expect(creditService.listCreditLimits).toHaveBeenCalledWith(
        'tenant-1', { entityType: WholesaleCreditEntityType.CUSTOMER }, DEFAULT_PAGINATION,
      );
    });
  });

  describe('checkCredit', () => {
    it('delegates the required amount to creditService.checkCredit', async () => {
      creditService.checkCredit.mockResolvedValue({ allowed: true });
      const result = await caller.checkCredit({
        entityType: WholesaleCreditEntityType.CUSTOMER,
        entityId: CUSTOMER_ID,
        requiredAmountPaise: 100000,
      });
      expect(creditService.checkCredit).toHaveBeenCalledWith(
        'tenant-1', WholesaleCreditEntityType.CUSTOMER, CUSTOMER_ID, 100000,
      );
      expect(result).toEqual({ allowed: true });
    });

    it('rejects a negative required amount', async () => {
      await expect(
        caller.checkCredit({
          entityType: WholesaleCreditEntityType.CUSTOMER,
          entityId: CUSTOMER_ID,
          requiredAmountPaise: -5,
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Outstanding Balances ─────────────────────────────────
  describe('listOutstandingBalances', () => {
    it('uses default filters and pagination', async () => {
      creditService.listOutstandingBalances.mockResolvedValue({ items: [], total: 0 });
      await caller.listOutstandingBalances({});
      expect(creditService.listOutstandingBalances).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });

    it('forwards entity and status filters', async () => {
      creditService.listOutstandingBalances.mockResolvedValue({ items: [], total: 0 });
      await caller.listOutstandingBalances({
        filters: {
          entityType: WholesaleCreditEntityType.CUSTOMER,
          entityId: CUSTOMER_ID,
          status: 'OVERDUE',
        },
      });
      expect(creditService.listOutstandingBalances).toHaveBeenCalledWith(
        'tenant-1',
        { entityType: WholesaleCreditEntityType.CUSTOMER, entityId: CUSTOMER_ID, status: 'OVERDUE' },
        DEFAULT_PAGINATION,
      );
    });
  });

  describe('recordOutstandingPayment', () => {
    it('delegates to creditService.recordPaymentOnOutstanding', async () => {
      creditService.recordPaymentOnOutstanding.mockResolvedValue({});
      await caller.recordOutstandingPayment({
        outstandingId: OUTSTANDING_ID,
        paymentPaise: 25000,
      });
      expect(creditService.recordPaymentOnOutstanding).toHaveBeenCalledWith(
        'tenant-1', 'user-1', OUTSTANDING_ID, 25000,
      );
    });

    it('rejects a non-positive payment', async () => {
      await expect(
        caller.recordOutstandingPayment({ outstandingId: OUTSTANDING_ID, paymentPaise: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('updateAgingStatuses', () => {
    it('delegates to creditService.updateAgingStatuses', async () => {
      creditService.updateAgingStatuses.mockResolvedValue({ updated: 4 });
      const result = await caller.updateAgingStatuses();
      expect(creditService.updateAgingStatuses).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ updated: 4 });
    });
  });

  describe('getAgingSummary', () => {
    it('passes undefined entity type when no input is supplied', async () => {
      creditService.getAgingSummary.mockResolvedValue({ buckets: [] });
      await caller.getAgingSummary();
      expect(creditService.getAgingSummary).toHaveBeenCalledWith('tenant-1', undefined);
    });

    it('forwards the entity type filter', async () => {
      creditService.getAgingSummary.mockResolvedValue({ buckets: [] });
      await caller.getAgingSummary({ entityType: WholesaleCreditEntityType.SUPPLIER });
      expect(creditService.getAgingSummary).toHaveBeenCalledWith(
        'tenant-1', WholesaleCreditEntityType.SUPPLIER,
      );
    });
  });

  // ─── Suppliers ────────────────────────────────────────────
  describe('listSuppliers', () => {
    it('uses default filters and ascending pagination', async () => {
      supplierService.listSuppliers.mockResolvedValue({ items: [], total: 0 });
      await caller.listSuppliers({});
      expect(supplierService.listSuppliers).toHaveBeenCalledWith(
        'tenant-1', {}, { page: 1, limit: 20, sortOrder: 'asc' },
      );
    });

    it('forwards search filter', async () => {
      supplierService.listSuppliers.mockResolvedValue({ items: [], total: 0 });
      await caller.listSuppliers({ filters: { search: 'gold' } });
      expect(supplierService.listSuppliers).toHaveBeenCalledWith(
        'tenant-1', { search: 'gold' }, { page: 1, limit: 20, sortOrder: 'asc' },
      );
    });
  });

  describe('getSupplier', () => {
    it('delegates to supplierService.getSupplier', async () => {
      supplierService.getSupplier.mockResolvedValue({ id: SUPPLIER_ID });
      await caller.getSupplier({ id: SUPPLIER_ID });
      expect(supplierService.getSupplier).toHaveBeenCalledWith('tenant-1', SUPPLIER_ID);
    });
  });

  describe('createSupplier', () => {
    it('delegates to supplierService.createSupplier', async () => {
      supplierService.createSupplier.mockResolvedValue({ id: SUPPLIER_ID });
      const result = await caller.createSupplier({ name: 'Mehta Gold', isActive: true });
      expect(supplierService.createSupplier).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ name: 'Mehta Gold' }),
      );
      expect(result).toEqual({ id: SUPPLIER_ID });
    });
  });

  describe('updateSupplier', () => {
    it('delegates partial update data to supplierService.updateSupplier', async () => {
      supplierService.updateSupplier.mockResolvedValue({});
      await caller.updateSupplier({ id: SUPPLIER_ID, data: { rating: 4 } });
      expect(supplierService.updateSupplier).toHaveBeenCalledWith(
        'tenant-1', 'user-1', SUPPLIER_ID, { rating: 4 },
      );
    });
  });

  describe('deactivateSupplier', () => {
    it('delegates to supplierService.deactivateSupplier', async () => {
      supplierService.deactivateSupplier.mockResolvedValue({});
      await caller.deactivateSupplier({ id: SUPPLIER_ID });
      expect(supplierService.deactivateSupplier).toHaveBeenCalledWith(
        'tenant-1', 'user-1', SUPPLIER_ID,
      );
    });
  });

  describe('getSupplierPerformance', () => {
    it('delegates to supplierService.getSupplierPerformance', async () => {
      supplierService.getSupplierPerformance.mockResolvedValue({ totalOrders: 7 });
      const result = await caller.getSupplierPerformance({ id: SUPPLIER_ID });
      expect(supplierService.getSupplierPerformance).toHaveBeenCalledWith('tenant-1', SUPPLIER_ID);
      expect(result).toEqual({ totalOrders: 7 });
    });
  });

  describe('listSuppliersWithPerformance', () => {
    it('uses default filters and ascending pagination', async () => {
      supplierService.listSuppliersWithPerformance.mockResolvedValue({ items: [], total: 0 });
      await caller.listSuppliersWithPerformance({});
      expect(supplierService.listSuppliersWithPerformance).toHaveBeenCalledWith(
        'tenant-1', {}, { page: 1, limit: 20, sortOrder: 'asc' },
      );
    });
  });

  // ─── Nested purchaseOrders router (mobile) ────────────────
  describe('purchaseOrders.list', () => {
    it('maps createdByAgentId onto createdBy in the PO filters', async () => {
      wholesaleService.listPurchaseOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.purchaseOrders.list({
        createdByAgentId: AGENT_ID,
        filters: { status: WholesalePOStatus.DRAFT },
      });
      expect(wholesaleService.listPurchaseOrders).toHaveBeenCalledWith(
        'tenant-1',
        { status: WholesalePOStatus.DRAFT, createdBy: AGENT_ID },
        DEFAULT_PAGINATION,
      );
    });

    it('passes empty filters when no agent is given', async () => {
      wholesaleService.listPurchaseOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.purchaseOrders.list({});
      expect(wholesaleService.listPurchaseOrders).toHaveBeenCalledWith(
        'tenant-1', {}, DEFAULT_PAGINATION,
      );
    });
  });

  // ─── Auth ─────────────────────────────────────────────────
  it('rejects unauthenticated calls', async () => {
    const unauth = routerInstance.router.createCaller({});
    await expect(unauth.getDashboard()).rejects.toThrow();
  });
});
