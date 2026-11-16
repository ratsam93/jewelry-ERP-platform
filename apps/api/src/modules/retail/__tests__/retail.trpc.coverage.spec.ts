import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RepairOrderStatus,
  RetailDiscountType,
  SalePaymentMethod,
} from '@caratflow/shared-types';
import { TrpcService } from '../../../trpc/trpc.service';
import { RetailTrpcRouter } from '../retail.trpc';

// Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
const LOCATION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SALE_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const RETURN_ID = '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f';
const REPAIR_ID = '4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a';
const CUSTOMER_ID = '5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8a9b';
const ORDER_ID = '6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f8a9b0c';
const LAYAWAY_ID = '7a8b9c0d-1e2f-4a3b-8c4d-6e7f8a9b0c1d';
const PURCHASE_ID = '8b9c0d1e-2f3a-4b4c-8d5e-7f8a9b0c1d2e';
const APPRAISAL_ID = '9c0d1e2f-3a4b-4c5d-8e6f-8a9b0c1d2e3f';
const DISCOUNT_ID = '0d1e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a';
const PRODUCT_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
const PRODUCT_ID_2 = '3f1e2d4c-5b6a-4789-9abc-def012345679';

describe('RetailTrpcRouter (coverage)', () => {
  const trpc = new TrpcService();

  const retailService = {
    createSale: vi.fn(),
    getSale: vi.fn(),
    generateSaleReceipt: vi.fn(),
    listSales: vi.fn(),
    voidSale: vi.fn(),
    getPosSession: vi.fn(),
    getDashboard: vi.fn(),
    getStaffDashboard: vi.fn(),
  };
  const returnService = {
    createReturn: vi.fn(),
    getReturn: vi.fn(),
    listReturns: vi.fn(),
    approveReturn: vi.fn(),
    completeReturn: vi.fn(),
    rejectReturn: vi.fn(),
  };
  const repairService = {
    createRepairOrder: vi.fn(),
    getRepairOrder: vi.fn(),
    listRepairOrders: vi.fn(),
    updateRepairStatus: vi.fn(),
    computeRepairProfitability: vi.fn(),
    getRepairQueue: vi.fn(),
  };
  const customOrderService = {
    createCustomOrder: vi.fn(),
    getCustomOrder: vi.fn(),
    listCustomOrders: vi.fn(),
    updateStatus: vi.fn(),
    recordDeposit: vi.fn(),
  };
  const layawayService = {
    createLayaway: vi.fn(),
    getLayaway: vi.fn(),
    listLayaways: vi.fn(),
    recordPayment: vi.fn(),
    cancelLayaway: vi.fn(),
  };
  const oldGoldService = {
    createPurchase: vi.fn(),
    getPurchase: vi.fn(),
    listPurchases: vi.fn(),
    updateStatus: vi.fn(),
    updateTestResults: vi.fn(),
    linkToSale: vi.fn(),
  };
  const appraisalService = {
    createAppraisal: vi.fn(),
    getAppraisal: vi.fn(),
    listAppraisals: vi.fn(),
  };
  const discountService = {
    createDiscount: vi.fn(),
    getDiscount: vi.fn(),
    listDiscounts: vi.fn(),
    updateDiscount: vi.fn(),
    getActiveDiscounts: vi.fn(),
  };
  const pricingService = {
    calculateLineItemPrice: vi.fn(),
    applyDiscount: vi.fn(),
  };
  const giftCardService = {
    issueGiftCard: vi.fn(),
    getBalance: vi.fn(),
    redeem: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new RetailTrpcRouter(
    trpc,
    retailService as never,
    returnService as never,
    repairService as never,
    customOrderService as never,
    layawayService as never,
    oldGoldService as never,
    appraisalService as never,
    discountService as never,
    pricingService as never,
    giftCardService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validSaleInput = {
    locationId: LOCATION_ID,
    lineItems: [{ description: 'Gold ring', unitPricePaise: 150000 }],
    payments: [{ method: SalePaymentMethod.CASH, amountPaise: 150000 }],
  };

  const validReturnInput = {
    originalSaleId: SALE_ID,
    locationId: LOCATION_ID,
    items: [{ originalLineItemId: PRODUCT_ID, returnPricePaise: 1000 }],
  };

  const validRepairInput = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    itemDescription: 'Bangle clasp repair',
  };

  const validCustomOrderInput = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    description: 'Custom necklace',
  };

  const validLayawayInput = {
    saleId: SALE_ID,
    customerId: CUSTOMER_ID,
    totalPaise: 500000,
    installmentCount: 4,
  };

  const validOldGoldInput = {
    locationId: LOCATION_ID,
    metalType: 'GOLD',
    grossWeightMg: 10000,
    netWeightMg: 9000,
    purityFineness: 916,
    ratePaisePer10g: 6000000,
  };

  const validAppraisalInput = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    itemDescription: 'Diamond solitaire',
    appraisedValuePaise: 2500000,
    appraisedBy: 'Asha Verma',
  };

  const validDiscountInput = {
    name: 'Diwali 10%',
    discountType: RetailDiscountType.PERCENTAGE,
    value: 10,
    startDate: '2026-10-01',
    endDate: '2026-11-30',
  };

  // ─── Sales ────────────────────────────────────────────────
  describe('createSale', () => {
    it('delegates to retailService.createSale with tenant and user context', async () => {
      retailService.createSale.mockResolvedValue({ id: SALE_ID });
      const result = await caller.createSale(validSaleInput);
      expect(retailService.createSale).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ locationId: LOCATION_ID }),
      );
      expect(result).toEqual({ id: SALE_ID });
    });

    it('rejects a sale with no line items', async () => {
      await expect(
        caller.createSale({ ...validSaleInput, lineItems: [] }),
      ).rejects.toThrow();
      expect(retailService.createSale).not.toHaveBeenCalled();
    });
  });

  describe('getSale', () => {
    it('delegates to retailService.getSale', async () => {
      retailService.getSale.mockResolvedValue({ id: SALE_ID });
      const result = await caller.getSale({ saleId: SALE_ID });
      expect(retailService.getSale).toHaveBeenCalledWith('tenant-1', SALE_ID);
      expect(result).toEqual({ id: SALE_ID });
    });

    it('rejects a non-uuid saleId', async () => {
      await expect(caller.getSale({ saleId: 'nope' })).rejects.toThrow();
    });
  });

  describe('downloadReceipt', () => {
    it('returns a base64 PDF descriptor built from the generated receipt', async () => {
      const pdf = Buffer.from('%PDF-1.4 fake');
      retailService.generateSaleReceipt.mockResolvedValue(pdf);
      const result = await caller.downloadReceipt({ saleId: SALE_ID });
      expect(retailService.generateSaleReceipt).toHaveBeenCalledWith('tenant-1', SALE_ID);
      expect(result).toEqual({
        filename: `receipt-${SALE_ID}.pdf`,
        mimeType: 'application/pdf',
        base64: pdf.toString('base64'),
        size: pdf.length,
      });
    });
  });

  describe('listSales', () => {
    it('uses default pagination when none is supplied', async () => {
      retailService.listSales.mockResolvedValue({ items: [], total: 0 });
      await caller.listSales({});
      expect(retailService.listSales).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });

    it('forwards filters and pagination', async () => {
      retailService.listSales.mockResolvedValue({ items: [], total: 0 });
      await caller.listSales({
        filters: { locationId: LOCATION_ID, search: 'ring' },
        pagination: { page: 2, limit: 5, sortOrder: 'asc' },
      });
      expect(retailService.listSales).toHaveBeenCalledWith(
        'tenant-1',
        { locationId: LOCATION_ID, search: 'ring' },
        { page: 2, limit: 5, sortOrder: 'asc' },
      );
    });
  });

  describe('voidSale', () => {
    it('delegates to retailService.voidSale with reason', async () => {
      retailService.voidSale.mockResolvedValue({});
      await caller.voidSale({ saleId: SALE_ID, reason: 'duplicate' });
      expect(retailService.voidSale).toHaveBeenCalledWith('tenant-1', 'user-1', SALE_ID, 'duplicate');
    });

    it('rejects an empty reason', async () => {
      await expect(caller.voidSale({ saleId: SALE_ID, reason: '' })).rejects.toThrow();
    });
  });

  // ─── POS / Dashboard ──────────────────────────────────────
  describe('getPosSession', () => {
    it('delegates to retailService.getPosSession', async () => {
      retailService.getPosSession.mockResolvedValue({ todaySalesCount: 0 });
      const result = await caller.getPosSession({ locationId: LOCATION_ID });
      expect(retailService.getPosSession).toHaveBeenCalledWith('tenant-1', LOCATION_ID);
      expect(result).toEqual({ todaySalesCount: 0 });
    });
  });

  describe('getDashboard', () => {
    it('delegates without a location when input is omitted', async () => {
      retailService.getDashboard.mockResolvedValue({ todaySalesCount: 3 });
      const result = await caller.getDashboard();
      expect(retailService.getDashboard).toHaveBeenCalledWith('tenant-1', undefined);
      expect(result).toEqual({ todaySalesCount: 3 });
    });

    it('passes the locationId when supplied', async () => {
      retailService.getDashboard.mockResolvedValue({});
      await caller.getDashboard({ locationId: LOCATION_ID });
      expect(retailService.getDashboard).toHaveBeenCalledWith('tenant-1', LOCATION_ID);
    });
  });

  describe('staffDashboard', () => {
    it('delegates with tenant, user and undefined date when no input', async () => {
      retailService.getStaffDashboard.mockResolvedValue({ mySalesCount: 0 });
      const result = await caller.staffDashboard();
      expect(retailService.getStaffDashboard).toHaveBeenCalledWith('tenant-1', 'user-1', undefined);
      expect(result).toEqual({ mySalesCount: 0 });
    });

    it('coerces the date input before delegating', async () => {
      retailService.getStaffDashboard.mockResolvedValue({});
      await caller.staffDashboard({ date: '2026-11-17' });
      expect(retailService.getStaffDashboard).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.any(Date),
      );
    });
  });

  // ─── Pricing ──────────────────────────────────────────────
  describe('calculateLineItemPrice', () => {
    const priceInput = {
      metalRatePaisePerGram: 600000,
      metalWeightMg: 5000,
      makingChargesPaise: 20000,
      wastageChargesPaise: 5000,
      quantity: 1,
    };

    it('delegates all price components to pricingService', async () => {
      pricingService.calculateLineItemPrice.mockResolvedValue({ totalPaise: 350000 });
      const result = await caller.calculateLineItemPrice(priceInput);
      expect(pricingService.calculateLineItemPrice).toHaveBeenCalledWith(
        600000, 5000, 20000, 5000, 1,
      );
      expect(result).toEqual({ totalPaise: 350000 });
    });

    it('rejects a non-positive quantity', async () => {
      await expect(
        caller.calculateLineItemPrice({ ...priceInput, quantity: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('validateDiscount', () => {
    it('delegates to pricingService.applyDiscount with tenant scoping', async () => {
      pricingService.applyDiscount.mockResolvedValue({ isValid: true });
      const cartItems = [{ productId: PRODUCT_ID, quantity: 2, unitPricePaise: 1000 }];
      const result = await caller.validateDiscount({
        discountId: DISCOUNT_ID,
        subtotalPaise: 2000,
        productIds: [PRODUCT_ID, PRODUCT_ID_2],
        cartItems,
      });
      expect(pricingService.applyDiscount).toHaveBeenCalledWith(
        'tenant-1', DISCOUNT_ID, 2000, [PRODUCT_ID, PRODUCT_ID_2], cartItems,
      );
      expect(result).toEqual({ isValid: true });
    });

    it('rejects a negative subtotal', async () => {
      await expect(
        caller.validateDiscount({
          discountId: DISCOUNT_ID,
          subtotalPaise: -1,
          productIds: [],
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Returns ──────────────────────────────────────────────
  describe('createReturn', () => {
    it('delegates to returnService.createReturn', async () => {
      returnService.createReturn.mockResolvedValue({ id: RETURN_ID });
      const result = await caller.createReturn(validReturnInput);
      expect(returnService.createReturn).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ originalSaleId: SALE_ID }),
      );
      expect(result).toEqual({ id: RETURN_ID });
    });

    it('rejects a return with no items', async () => {
      await expect(caller.createReturn({ ...validReturnInput, items: [] })).rejects.toThrow();
    });
  });

  describe('getReturn', () => {
    it('delegates to returnService.getReturn', async () => {
      returnService.getReturn.mockResolvedValue({ id: RETURN_ID });
      await caller.getReturn({ returnId: RETURN_ID });
      expect(returnService.getReturn).toHaveBeenCalledWith('tenant-1', RETURN_ID);
    });
  });

  describe('listReturns', () => {
    it('uses default pagination and empty filters', async () => {
      returnService.listReturns.mockResolvedValue({ items: [], total: 0 });
      await caller.listReturns({});
      expect(returnService.listReturns).toHaveBeenCalledWith(
        'tenant-1', {}, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });

    it('forwards filters and pagination', async () => {
      returnService.listReturns.mockResolvedValue({ items: [], total: 0 });
      await caller.listReturns({
        filters: { status: 'PENDING', originalSaleId: SALE_ID },
        pagination: { page: 1, limit: 10, sortOrder: 'asc' },
      });
      expect(returnService.listReturns).toHaveBeenCalledWith(
        'tenant-1',
        { status: 'PENDING', originalSaleId: SALE_ID },
        { page: 1, limit: 10, sortOrder: 'asc' },
      );
    });
  });

  describe('approveReturn', () => {
    it('delegates to returnService.approveReturn', async () => {
      returnService.approveReturn.mockResolvedValue({});
      await caller.approveReturn({ returnId: RETURN_ID });
      expect(returnService.approveReturn).toHaveBeenCalledWith('tenant-1', 'user-1', RETURN_ID);
    });
  });

  describe('completeReturn', () => {
    it('delegates to returnService.completeReturn', async () => {
      returnService.completeReturn.mockResolvedValue({});
      await caller.completeReturn({ returnId: RETURN_ID });
      expect(returnService.completeReturn).toHaveBeenCalledWith('tenant-1', 'user-1', RETURN_ID);
    });
  });

  describe('rejectReturn', () => {
    it('delegates to returnService.rejectReturn with reason', async () => {
      returnService.rejectReturn.mockResolvedValue({});
      await caller.rejectReturn({ returnId: RETURN_ID, reason: 'item used' });
      expect(returnService.rejectReturn).toHaveBeenCalledWith(
        'tenant-1', 'user-1', RETURN_ID, 'item used',
      );
    });

    it('rejects an empty reason', async () => {
      await expect(caller.rejectReturn({ returnId: RETURN_ID, reason: '' })).rejects.toThrow();
    });
  });

  // ─── Repairs ──────────────────────────────────────────────
  describe('createRepairOrder', () => {
    it('delegates to repairService.createRepairOrder', async () => {
      repairService.createRepairOrder.mockResolvedValue({ id: REPAIR_ID });
      const result = await caller.createRepairOrder(validRepairInput);
      expect(repairService.createRepairOrder).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ itemDescription: 'Bangle clasp repair' }),
      );
      expect(result).toEqual({ id: REPAIR_ID });
    });

    it('rejects an empty item description', async () => {
      await expect(
        caller.createRepairOrder({ ...validRepairInput, itemDescription: '' }),
      ).rejects.toThrow();
    });
  });

  describe('getRepairOrder', () => {
    it('delegates to repairService.getRepairOrder', async () => {
      repairService.getRepairOrder.mockResolvedValue({ id: REPAIR_ID });
      await caller.getRepairOrder({ repairId: REPAIR_ID });
      expect(repairService.getRepairOrder).toHaveBeenCalledWith('tenant-1', REPAIR_ID);
    });
  });

  describe('listRepairOrders', () => {
    it('uses default pagination when none is supplied', async () => {
      repairService.listRepairOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.listRepairOrders({});
      expect(repairService.listRepairOrders).toHaveBeenCalledWith(
        'tenant-1', {}, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });

    it('forwards status filter', async () => {
      repairService.listRepairOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.listRepairOrders({ filters: { status: RepairOrderStatus.RECEIVED } });
      expect(repairService.listRepairOrders).toHaveBeenCalledWith(
        'tenant-1',
        { status: RepairOrderStatus.RECEIVED },
        { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });
  });

  describe('updateRepairStatus', () => {
    it('delegates to repairService.updateRepairStatus with the update payload', async () => {
      repairService.updateRepairStatus.mockResolvedValue({});
      await caller.updateRepairStatus({
        repairId: REPAIR_ID,
        update: { status: RepairOrderStatus.IN_PROGRESS, laborPaise: 5000 },
      });
      expect(repairService.updateRepairStatus).toHaveBeenCalledWith(
        'tenant-1', 'user-1', REPAIR_ID,
        expect.objectContaining({ status: RepairOrderStatus.IN_PROGRESS, laborPaise: 5000 }),
      );
    });
  });

  describe('getRepairProfitability', () => {
    it('delegates to repairService.computeRepairProfitability', async () => {
      repairService.computeRepairProfitability.mockResolvedValue({ profitPaise: 100 });
      const result = await caller.getRepairProfitability({ repairId: REPAIR_ID });
      expect(repairService.computeRepairProfitability).toHaveBeenCalledWith('tenant-1', REPAIR_ID);
      expect(result).toEqual({ profitPaise: 100 });
    });
  });

  describe('getRepairQueue', () => {
    it('delegates to repairService.getRepairQueue', async () => {
      repairService.getRepairQueue.mockResolvedValue([]);
      await caller.getRepairQueue({ locationId: LOCATION_ID });
      expect(repairService.getRepairQueue).toHaveBeenCalledWith('tenant-1', LOCATION_ID);
    });
  });

  // ─── Custom Orders ────────────────────────────────────────
  describe('createCustomOrder', () => {
    it('delegates to customOrderService.createCustomOrder', async () => {
      customOrderService.createCustomOrder.mockResolvedValue({ id: ORDER_ID });
      await caller.createCustomOrder(validCustomOrderInput);
      expect(customOrderService.createCustomOrder).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ description: 'Custom necklace' }),
      );
    });

    it('rejects an empty description', async () => {
      await expect(
        caller.createCustomOrder({ ...validCustomOrderInput, description: '' }),
      ).rejects.toThrow();
    });
  });

  describe('getCustomOrder', () => {
    it('delegates to customOrderService.getCustomOrder', async () => {
      customOrderService.getCustomOrder.mockResolvedValue({ id: ORDER_ID });
      await caller.getCustomOrder({ orderId: ORDER_ID });
      expect(customOrderService.getCustomOrder).toHaveBeenCalledWith('tenant-1', ORDER_ID);
    });
  });

  describe('listCustomOrders', () => {
    it('uses default pagination and forwards customer filter', async () => {
      customOrderService.listCustomOrders.mockResolvedValue({ items: [], total: 0 });
      await caller.listCustomOrders({ filters: { customerId: CUSTOMER_ID } });
      expect(customOrderService.listCustomOrders).toHaveBeenCalledWith(
        'tenant-1', { customerId: CUSTOMER_ID }, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });
  });

  describe('updateCustomOrderStatus', () => {
    it('delegates status update to customOrderService.updateStatus', async () => {
      customOrderService.updateStatus.mockResolvedValue({});
      await caller.updateCustomOrderStatus({ orderId: ORDER_ID, status: 'IN_PRODUCTION' });
      expect(customOrderService.updateStatus).toHaveBeenCalledWith(
        'tenant-1', 'user-1', ORDER_ID, 'IN_PRODUCTION',
      );
    });
  });

  describe('recordCustomOrderDeposit', () => {
    it('delegates to customOrderService.recordDeposit', async () => {
      customOrderService.recordDeposit.mockResolvedValue({});
      await caller.recordCustomOrderDeposit({ orderId: ORDER_ID, depositPaise: 50000 });
      expect(customOrderService.recordDeposit).toHaveBeenCalledWith(
        'tenant-1', 'user-1', ORDER_ID, 50000,
      );
    });

    it('rejects a non-positive deposit', async () => {
      await expect(
        caller.recordCustomOrderDeposit({ orderId: ORDER_ID, depositPaise: 0 }),
      ).rejects.toThrow();
    });
  });

  // ─── Layaway ──────────────────────────────────────────────
  describe('createLayaway', () => {
    it('delegates to layawayService.createLayaway', async () => {
      layawayService.createLayaway.mockResolvedValue({ id: LAYAWAY_ID });
      await caller.createLayaway(validLayawayInput);
      expect(layawayService.createLayaway).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ installmentCount: 4 }),
      );
    });

    it('rejects fewer than two installments', async () => {
      await expect(
        caller.createLayaway({ ...validLayawayInput, installmentCount: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('getLayaway', () => {
    it('delegates to layawayService.getLayaway', async () => {
      layawayService.getLayaway.mockResolvedValue({ id: LAYAWAY_ID });
      await caller.getLayaway({ layawayId: LAYAWAY_ID });
      expect(layawayService.getLayaway).toHaveBeenCalledWith('tenant-1', LAYAWAY_ID);
    });
  });

  describe('listLayaways', () => {
    it('uses default pagination when none is supplied', async () => {
      layawayService.listLayaways.mockResolvedValue({ items: [], total: 0 });
      await caller.listLayaways({});
      expect(layawayService.listLayaways).toHaveBeenCalledWith(
        'tenant-1', {}, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });
  });

  describe('recordLayawayPayment', () => {
    it('delegates to layawayService.recordPayment', async () => {
      layawayService.recordPayment.mockResolvedValue({});
      await caller.recordLayawayPayment({
        layawayId: LAYAWAY_ID,
        amountPaise: 125000,
        method: 'CASH',
      });
      expect(layawayService.recordPayment).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ layawayId: LAYAWAY_ID, amountPaise: 125000 }),
      );
    });
  });

  describe('cancelLayaway', () => {
    it('delegates to layawayService.cancelLayaway', async () => {
      layawayService.cancelLayaway.mockResolvedValue({});
      await caller.cancelLayaway({ layawayId: LAYAWAY_ID });
      expect(layawayService.cancelLayaway).toHaveBeenCalledWith('tenant-1', 'user-1', LAYAWAY_ID);
    });
  });

  // ─── Old Gold ─────────────────────────────────────────────
  describe('createOldGoldPurchase', () => {
    it('delegates to oldGoldService.createPurchase', async () => {
      oldGoldService.createPurchase.mockResolvedValue({ id: PURCHASE_ID });
      await caller.createOldGoldPurchase(validOldGoldInput);
      expect(oldGoldService.createPurchase).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ purityFineness: 916 }),
      );
    });

    it('rejects purity above 999', async () => {
      await expect(
        caller.createOldGoldPurchase({ ...validOldGoldInput, purityFineness: 1000 }),
      ).rejects.toThrow();
    });
  });

  describe('getOldGoldPurchase', () => {
    it('delegates to oldGoldService.getPurchase', async () => {
      oldGoldService.getPurchase.mockResolvedValue({ id: PURCHASE_ID });
      await caller.getOldGoldPurchase({ purchaseId: PURCHASE_ID });
      expect(oldGoldService.getPurchase).toHaveBeenCalledWith('tenant-1', PURCHASE_ID);
    });
  });

  describe('listOldGoldPurchases', () => {
    it('uses default pagination and forwards status filter', async () => {
      oldGoldService.listPurchases.mockResolvedValue({ items: [], total: 0 });
      await caller.listOldGoldPurchases({ filters: { status: 'OPEN' } });
      expect(oldGoldService.listPurchases).toHaveBeenCalledWith(
        'tenant-1', { status: 'OPEN' }, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });
  });

  describe('updateOldGoldStatus', () => {
    it('delegates to oldGoldService.updateStatus', async () => {
      oldGoldService.updateStatus.mockResolvedValue({});
      await caller.updateOldGoldStatus({ purchaseId: PURCHASE_ID, status: 'PAID' });
      expect(oldGoldService.updateStatus).toHaveBeenCalledWith(
        'tenant-1', 'user-1', PURCHASE_ID, 'PAID',
      );
    });
  });

  describe('updateOldGoldTestResults', () => {
    it('delegates purity and net weight to oldGoldService.updateTestResults', async () => {
      oldGoldService.updateTestResults.mockResolvedValue({});
      await caller.updateOldGoldTestResults({
        purchaseId: PURCHASE_ID,
        purityFineness: 750,
        netWeightMg: 8000,
      });
      expect(oldGoldService.updateTestResults).toHaveBeenCalledWith(
        'tenant-1', 'user-1', PURCHASE_ID, 750, 8000,
      );
    });

    it('rejects a non-positive net weight', async () => {
      await expect(
        caller.updateOldGoldTestResults({
          purchaseId: PURCHASE_ID,
          purityFineness: 750,
          netWeightMg: 0,
        }),
      ).rejects.toThrow();
    });
  });

  describe('linkOldGoldToSale', () => {
    it('delegates to oldGoldService.linkToSale', async () => {
      oldGoldService.linkToSale.mockResolvedValue({});
      await caller.linkOldGoldToSale({ purchaseId: PURCHASE_ID, saleId: SALE_ID });
      expect(oldGoldService.linkToSale).toHaveBeenCalledWith(
        'tenant-1', 'user-1', PURCHASE_ID, SALE_ID,
      );
    });
  });

  // ─── Appraisals ───────────────────────────────────────────
  describe('createAppraisal', () => {
    it('delegates to appraisalService.createAppraisal', async () => {
      appraisalService.createAppraisal.mockResolvedValue({ id: APPRAISAL_ID });
      await caller.createAppraisal(validAppraisalInput);
      expect(appraisalService.createAppraisal).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ appraisedBy: 'Asha Verma' }),
      );
    });

    it('rejects a missing appraiser', async () => {
      await expect(
        caller.createAppraisal({ ...validAppraisalInput, appraisedBy: '' }),
      ).rejects.toThrow();
    });
  });

  describe('getAppraisal', () => {
    it('delegates to appraisalService.getAppraisal', async () => {
      appraisalService.getAppraisal.mockResolvedValue({ id: APPRAISAL_ID });
      await caller.getAppraisal({ appraisalId: APPRAISAL_ID });
      expect(appraisalService.getAppraisal).toHaveBeenCalledWith('tenant-1', APPRAISAL_ID);
    });
  });

  describe('listAppraisals', () => {
    it('uses default pagination and forwards customer filter', async () => {
      appraisalService.listAppraisals.mockResolvedValue({ items: [], total: 0 });
      await caller.listAppraisals({ filters: { customerId: CUSTOMER_ID } });
      expect(appraisalService.listAppraisals).toHaveBeenCalledWith(
        'tenant-1', { customerId: CUSTOMER_ID }, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });
  });

  // ─── Gift Cards ───────────────────────────────────────────
  describe('issueGiftCard', () => {
    it('delegates to giftCardService.issueGiftCard', async () => {
      giftCardService.issueGiftCard.mockResolvedValue({ cardNumber: 'GC-1' });
      const result = await caller.issueGiftCard({ initialValuePaise: 100000 });
      expect(giftCardService.issueGiftCard).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ initialValuePaise: 100000 }),
      );
      expect(result).toEqual({ cardNumber: 'GC-1' });
    });

    it('rejects a non-positive value', async () => {
      await expect(caller.issueGiftCard({ initialValuePaise: 0 })).rejects.toThrow();
    });
  });

  describe('getGiftCardBalance', () => {
    it('delegates to giftCardService.getBalance', async () => {
      giftCardService.getBalance.mockResolvedValue({ balancePaise: 5000 });
      const result = await caller.getGiftCardBalance({ cardNumber: 'GC-1' });
      expect(giftCardService.getBalance).toHaveBeenCalledWith('tenant-1', 'GC-1');
      expect(result).toEqual({ balancePaise: 5000 });
    });

    it('rejects an empty card number', async () => {
      await expect(caller.getGiftCardBalance({ cardNumber: '' })).rejects.toThrow();
    });
  });

  describe('redeemGiftCard', () => {
    it('delegates to giftCardService.redeem', async () => {
      giftCardService.redeem.mockResolvedValue({});
      await caller.redeemGiftCard({ cardNumber: 'GC-1', amountPaise: 2000 });
      expect(giftCardService.redeem).toHaveBeenCalledWith('tenant-1', 'user-1', 'GC-1', 2000);
    });
  });

  // ─── Discounts ────────────────────────────────────────────
  describe('createDiscount', () => {
    it('delegates to discountService.createDiscount', async () => {
      discountService.createDiscount.mockResolvedValue({ id: DISCOUNT_ID });
      await caller.createDiscount(validDiscountInput);
      expect(discountService.createDiscount).toHaveBeenCalledWith(
        'tenant-1', 'user-1', expect.objectContaining({ name: 'Diwali 10%', value: 10 }),
      );
    });

    it('rejects an unknown discount type', async () => {
      await expect(
        caller.createDiscount({ ...validDiscountInput, discountType: 'BOGUS' } as never),
      ).rejects.toThrow();
    });
  });

  describe('getDiscount', () => {
    it('delegates to discountService.getDiscount', async () => {
      discountService.getDiscount.mockResolvedValue({ id: DISCOUNT_ID });
      await caller.getDiscount({ discountId: DISCOUNT_ID });
      expect(discountService.getDiscount).toHaveBeenCalledWith('tenant-1', DISCOUNT_ID);
    });
  });

  describe('listDiscounts', () => {
    it('uses default pagination and forwards isActive filter', async () => {
      discountService.listDiscounts.mockResolvedValue({ items: [], total: 0 });
      await caller.listDiscounts({ filters: { isActive: true } });
      expect(discountService.listDiscounts).toHaveBeenCalledWith(
        'tenant-1', { isActive: true }, { page: 1, limit: 20, sortOrder: 'desc' },
      );
    });
  });

  describe('updateDiscount', () => {
    it('delegates partial update data to discountService.updateDiscount', async () => {
      discountService.updateDiscount.mockResolvedValue({});
      await caller.updateDiscount({ discountId: DISCOUNT_ID, data: { isActive: false } });
      expect(discountService.updateDiscount).toHaveBeenCalledWith(
        'tenant-1', 'user-1', DISCOUNT_ID, { isActive: false },
      );
    });
  });

  describe('getActiveDiscounts', () => {
    it('delegates to discountService.getActiveDiscounts', async () => {
      discountService.getActiveDiscounts.mockResolvedValue([]);
      const result = await caller.getActiveDiscounts();
      expect(discountService.getActiveDiscounts).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([]);
    });
  });

  // ─── Auth ─────────────────────────────────────────────────
  it('rejects unauthenticated calls', async () => {
    const unauth = routerInstance.router.createCaller({});
    await expect(unauth.getActiveDiscounts()).rejects.toThrow();
  });
});
