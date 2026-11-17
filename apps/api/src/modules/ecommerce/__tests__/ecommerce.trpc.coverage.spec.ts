import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { TrpcService } from '../../../trpc/trpc.service';
import { EcommerceTrpcRouter } from '../ecommerce.trpc';

// Deterministic ids for records created by the router.
vi.mock('uuid', () => ({ v4: () => 'generated-uuid' }));

// Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits).
const CHANNEL_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
const PRODUCT_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const ORDER_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
const SHIPMENT_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const GATEWAY_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
const PAYMENT_ID = '3e4f5a6b-7c8d-4e9f-9a0b-2c3d4e5f6a7b';
const CATALOG_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';
const REVIEW_ID = '5a6b7c8d-9e0f-4a1b-8c2d-4e5f6a7b8c9d';
const LOCATION_ID = '6b7c8d9e-0f1a-4b2c-9d3e-5f6a7b8c9d0e';
const WEBHOOK_LOG_ID = '8d9e0f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a';
const CLICK_ID = '9e0f1a2b-3c4d-4e5f-9a6b-8c9d0e1f2a3b';

const DEFAULT_PAGINATION = { page: 1, limit: 20, sortOrder: 'desc' };

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected promise to reject');
    },
    (err: unknown) => err,
  );
}

describe('EcommerceTrpcRouter (function coverage)', () => {
  const trpc = new TrpcService();

  const prisma = {
    salesChannel: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    productReview: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  };
  const orderService = {
    getDashboard: vi.fn(),
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    listOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
    cancelOrder: vi.fn(),
    refundOrder: vi.fn(),
  };
  const catalogService = {
    syncProduct: vi.fn(),
    bulkSync: vi.fn(),
    bulkSyncAll: vi.fn(),
    getCatalogItem: vi.fn(),
    listCatalogItems: vi.fn(),
    deleteCatalogItem: vi.fn(),
  };
  const shippingService = {
    createShipment: vi.fn(),
    getShipment: vi.fn(),
    listShipments: vi.fn(),
    updateTracking: vi.fn(),
    getShipmentsByOrder: vi.fn(),
    generateLabel: vi.fn(),
  };
  const paymentService = {
    createGateway: vi.fn(),
    getGateway: vi.fn(),
    listGateways: vi.fn(),
    updateGateway: vi.fn(),
    initiatePayment: vi.fn(),
    listPayments: vi.fn(),
    refundPayment: vi.fn(),
  };
  const webhookService = {
    verifyInboundSignature: vi.fn(),
    handleWebhook: vi.fn(),
    retryWebhook: vi.fn(),
    listWebhookLogs: vi.fn(),
  };
  const clickCollectService = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    markNotified: vi.fn(),
    confirmPickup: vi.fn(),
    cancel: vi.fn(),
    getQueue: vi.fn(),
  };
  const shopifyService = {
    syncProductToShopify: vi.fn(),
    pullOrdersFromShopify: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new EcommerceTrpcRouter(
    trpc,
    prisma as never,
    orderService as never,
    catalogService as never,
    shippingService as never,
    paymentService as never,
    webhookService as never,
    clickCollectService as never,
    shopifyService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  const channelRow = {
    id: CHANNEL_ID,
    tenantId: 'tenant-1',
    name: 'Main Store',
    channelType: 'SHOPIFY',
    storeUrl: 'https://store.example.com',
    settings: null,
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    apiKey: 'secret',
    apiSecret: 'secret',
    webhookSecret: null,
  };

  const reviewRow = {
    id: REVIEW_ID,
    tenantId: 'tenant-1',
    productId: PRODUCT_ID,
    channelId: null,
    customerName: 'Asha',
    rating: 5,
    title: 'Lovely',
    body: 'Great piece',
    isVerified: false,
    isPublished: false,
    publishedAt: null,
    createdAt: new Date('2026-01-03T00:00:00Z'),
    updatedAt: new Date('2026-01-03T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Dashboard ──────────────────────────────────────────
  describe('getDashboard', () => {
    it('delegates to orderService.getDashboard with tenantId', async () => {
      orderService.getDashboard.mockResolvedValue({ totalOnlineOrders: 3 });
      const result = await caller.getDashboard();
      expect(orderService.getDashboard).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ totalOnlineOrders: 3 });
    });

    it('rejects callers without any permission', async () => {
      const noPerms = routerInstance.router.createCaller({ ...ctx, userPermissions: [] });
      await expect(noPerms.getDashboard()).rejects.toThrow();
      expect(orderService.getDashboard).not.toHaveBeenCalled();
    });
  });

  // ─── Sales channels ─────────────────────────────────────
  describe('createChannel', () => {
    it('creates the channel scoped to tenant and returns the mapped record', async () => {
      prisma.salesChannel.create.mockResolvedValue(channelRow);
      const result = await caller.createChannel({ name: 'Main Store', channelType: 'SHOPIFY' });
      expect(prisma.salesChannel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'generated-uuid',
          tenantId: 'tenant-1',
          name: 'Main Store',
          channelType: 'SHOPIFY',
          apiKey: null,
          apiSecret: null,
          storeUrl: null,
          webhookSecret: null,
          settings: undefined,
          isActive: true,
          createdBy: 'user-1',
          updatedBy: 'user-1',
        }),
      });
      expect(result).toEqual({
        id: CHANNEL_ID,
        tenantId: 'tenant-1',
        name: 'Main Store',
        channelType: 'SHOPIFY',
        storeUrl: 'https://store.example.com',
        settings: null,
        isActive: true,
        lastSyncAt: null,
        createdAt: channelRow.createdAt,
        updatedAt: channelRow.updatedAt,
      });
      // Secrets are never echoed back.
      expect(result).not.toHaveProperty('apiKey');
    });

    it('rejects an unknown channel type', async () => {
      await expect(
        caller.createChannel({ name: 'Bad', channelType: 'MYSPACE' as never }),
      ).rejects.toThrow();
      expect(prisma.salesChannel.create).not.toHaveBeenCalled();
    });
  });

  describe('getChannel', () => {
    it('returns the mapped channel for the tenant', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue(channelRow);
      const result = await caller.getChannel({ channelId: CHANNEL_ID });
      expect(prisma.salesChannel.findFirst).toHaveBeenCalledWith({
        where: { id: CHANNEL_ID, tenantId: 'tenant-1' },
      });
      expect(result.id).toBe(CHANNEL_ID);
      expect(result.name).toBe('Main Store');
    });

    it('throws when the channel is not found for the tenant', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue(null);
      await expect(caller.getChannel({ channelId: CHANNEL_ID })).rejects.toThrow('Channel not found');
    });

    it('rejects a non-uuid channelId', async () => {
      await expect(caller.getChannel({ channelId: 'nope' })).rejects.toThrow();
    });
  });

  describe('listChannels', () => {
    it('applies every filter and maps each channel', async () => {
      prisma.salesChannel.findMany.mockResolvedValue([channelRow]);
      const result = await caller.listChannels({
        filters: { channelType: 'SHOPIFY', isActive: true, search: 'Main' },
        pagination: { page: 1, limit: 20, sortOrder: 'desc' },
      });
      expect(prisma.salesChannel.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          channelType: 'SHOPIFY',
          isActive: true,
          OR: [{ name: { contains: 'Main' } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('apiSecret');
    });

    it('lists all tenant channels when no filters are supplied', async () => {
      prisma.salesChannel.findMany.mockResolvedValue([]);
      const result = await caller.listChannels({});
      expect(prisma.salesChannel.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([]);
    });

    it('filters on isActive=false without dropping the falsy value', async () => {
      prisma.salesChannel.findMany.mockResolvedValue([]);
      await caller.listChannels({ filters: { isActive: false } });
      expect(prisma.salesChannel.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', isActive: false },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateChannel', () => {
    it('updates the channel with the supplied fields and audit user', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue({ id: CHANNEL_ID });
      prisma.salesChannel.update.mockResolvedValue({ ...channelRow, name: 'Renamed' });
      const result = await caller.updateChannel({
        channelId: CHANNEL_ID,
        data: { name: 'Renamed' },
      });
      expect(prisma.salesChannel.update).toHaveBeenCalledWith({
        where: { id: CHANNEL_ID },
        data: expect.objectContaining({ name: 'Renamed', updatedBy: 'user-1', settings: undefined }),
      });
      expect(result.name).toBe('Renamed');
      expect(result.id).toBe(CHANNEL_ID);
    });

    it('refuses to update a channel that belongs to another tenant', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue(null);
      await expect(
        caller.updateChannel({ channelId: CHANNEL_ID, data: { name: 'Hijack' } }),
      ).rejects.toThrow(/not found/i);
      expect(prisma.salesChannel.findFirst).toHaveBeenCalledWith({
        where: { id: CHANNEL_ID, tenantId: 'tenant-1' },
        select: { id: true },
      });
      expect(prisma.salesChannel.update).not.toHaveBeenCalled();
    });

    it('rejects a payload with an invalid channel type', async () => {
      await expect(
        caller.updateChannel({ channelId: CHANNEL_ID, data: { channelType: 'NOPE' as never } }),
      ).rejects.toThrow();
      expect(prisma.salesChannel.update).not.toHaveBeenCalled();
    });
  });

  // ─── Catalog ────────────────────────────────────────────
  describe('syncAllProducts', () => {
    it('delegates to catalogService.bulkSyncAll with tenant and user', async () => {
      catalogService.bulkSyncAll.mockResolvedValue({ totalItems: 2, synced: 2, failed: 0, skipped: 0, errors: [] });
      const result = await caller.syncAllProducts({ channelId: CHANNEL_ID });
      expect(catalogService.bulkSyncAll).toHaveBeenCalledWith('tenant-1', 'user-1', CHANNEL_ID);
      expect(result.synced).toBe(2);
    });
  });

  describe('syncProduct', () => {
    it('delegates to catalogService.syncProduct with tenant and user', async () => {
      catalogService.syncProduct.mockResolvedValue({ id: CATALOG_ID });
      const input = {
        productId: PRODUCT_ID,
        channelId: CHANNEL_ID,
        title: 'Gold Necklace',
        pricePaise: 4500000,
      };
      const result = await caller.syncProduct(input);
      expect(catalogService.syncProduct).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ ...input, currencyCode: 'INR' }),
      );
      expect(result).toEqual({ id: CATALOG_ID });
    });

    it('rejects a negative price', async () => {
      await expect(
        caller.syncProduct({ productId: PRODUCT_ID, channelId: CHANNEL_ID, title: 'X', pricePaise: -1 }),
      ).rejects.toThrow();
      expect(catalogService.syncProduct).not.toHaveBeenCalled();
    });
  });

  describe('bulkSyncProducts', () => {
    it('forwards channel and product ids to catalogService.bulkSync', async () => {
      catalogService.bulkSync.mockResolvedValue({ synced: 2 });
      const result = await caller.bulkSyncProducts({
        channelId: CHANNEL_ID,
        productIds: [PRODUCT_ID, CATALOG_ID],
      });
      expect(catalogService.bulkSync).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        CHANNEL_ID,
        [PRODUCT_ID, CATALOG_ID],
      );
      expect(result).toEqual({ synced: 2 });
    });

    it('rejects a non-uuid product id in the batch', async () => {
      await expect(
        caller.bulkSyncProducts({ channelId: CHANNEL_ID, productIds: ['bad'] }),
      ).rejects.toThrow();
    });
  });

  describe('getCatalogItem', () => {
    it('delegates to catalogService.getCatalogItem', async () => {
      catalogService.getCatalogItem.mockResolvedValue({ id: CATALOG_ID });
      const result = await caller.getCatalogItem({ catalogItemId: CATALOG_ID });
      expect(catalogService.getCatalogItem).toHaveBeenCalledWith('tenant-1', CATALOG_ID);
      expect(result).toEqual({ id: CATALOG_ID });
    });
  });

  describe('listCatalogItems', () => {
    it('applies default pagination when none is supplied', async () => {
      catalogService.listCatalogItems.mockResolvedValue({ items: [] });
      await caller.listCatalogItems({});
      expect(catalogService.listCatalogItems).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards filters and explicit pagination', async () => {
      catalogService.listCatalogItems.mockResolvedValue({ items: [{ id: CATALOG_ID }] });
      const result = await caller.listCatalogItems({
        filters: { channelId: CHANNEL_ID, status: 'ACTIVE', syncStatus: 'SYNCED', search: 'ring' },
        pagination: { page: 2, limit: 5, sortOrder: 'asc' },
      });
      expect(catalogService.listCatalogItems).toHaveBeenCalledWith(
        'tenant-1',
        { channelId: CHANNEL_ID, status: 'ACTIVE', syncStatus: 'SYNCED', search: 'ring' },
        { page: 2, limit: 5, sortOrder: 'asc' },
      );
      expect(result).toEqual({ items: [{ id: CATALOG_ID }] });
    });

    it('rejects a pagination limit above 100', async () => {
      await expect(
        caller.listCatalogItems({ pagination: { page: 1, limit: 500, sortOrder: 'desc' } }),
      ).rejects.toThrow();
    });
  });

  describe('deleteCatalogItem', () => {
    it('delegates to catalogService.deleteCatalogItem', async () => {
      catalogService.deleteCatalogItem.mockResolvedValue({ success: true });
      const result = await caller.deleteCatalogItem({ catalogItemId: CATALOG_ID });
      expect(catalogService.deleteCatalogItem).toHaveBeenCalledWith('tenant-1', CATALOG_ID);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Orders ─────────────────────────────────────────────
  const orderInput = {
    channelId: CHANNEL_ID,
    subtotalPaise: 100000,
    totalPaise: 100000,
    items: [{ title: 'Ring', quantity: 1, unitPricePaise: 100000, totalPaise: 100000 }],
  };

  describe('createOrder', () => {
    it('creates the order via orderService with defaults applied', async () => {
      orderService.createOrder.mockResolvedValue({ id: ORDER_ID });
      const result = await caller.createOrder(orderInput);
      expect(orderService.createOrder).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ channelId: CHANNEL_ID, status: 'PENDING', currencyCode: 'INR' }),
      );
      expect(result).toEqual({ id: ORDER_ID });
    });

    it('rejects an order with no line items', async () => {
      await expect(caller.createOrder({ ...orderInput, items: [] })).rejects.toThrow();
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });
  });

  describe('getOrder', () => {
    it('delegates to orderService.getOrder', async () => {
      orderService.getOrder.mockResolvedValue({ id: ORDER_ID });
      const result = await caller.getOrder({ orderId: ORDER_ID });
      expect(orderService.getOrder).toHaveBeenCalledWith('tenant-1', ORDER_ID);
      expect(result).toEqual({ id: ORDER_ID });
    });
  });

  describe('listOrders', () => {
    it('applies default pagination when none is supplied', async () => {
      orderService.listOrders.mockResolvedValue({ items: [] });
      await caller.listOrders({});
      expect(orderService.listOrders).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards order filters and explicit pagination', async () => {
      orderService.listOrders.mockResolvedValue({ items: [] });
      await caller.listOrders({
        filters: { status: 'SHIPPED', channelId: CHANNEL_ID, search: 'INV' },
        pagination: { page: 3, limit: 10, sortOrder: 'asc' },
      });
      expect(orderService.listOrders).toHaveBeenCalledWith(
        'tenant-1',
        { status: 'SHIPPED', channelId: CHANNEL_ID, search: 'INV' },
        { page: 3, limit: 10, sortOrder: 'asc' },
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('forwards the status update with tenant and user', async () => {
      orderService.updateOrderStatus.mockResolvedValue({ id: ORDER_ID, status: 'CONFIRMED' });
      const result = await caller.updateOrderStatus({ orderId: ORDER_ID, status: 'CONFIRMED' });
      expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { orderId: ORDER_ID, status: 'CONFIRMED' },
      );
      expect(result).toEqual({ id: ORDER_ID, status: 'CONFIRMED' });
    });

    it('rejects an unknown order status', async () => {
      await expect(
        caller.updateOrderStatus({ orderId: ORDER_ID, status: 'LOST' as never }),
      ).rejects.toThrow();
    });
  });

  describe('cancelOrder', () => {
    it('passes the order id and reason to orderService.cancelOrder', async () => {
      orderService.cancelOrder.mockResolvedValue({ id: ORDER_ID, status: 'CANCELLED' });
      const result = await caller.cancelOrder({ orderId: ORDER_ID, reason: 'Customer request' });
      expect(orderService.cancelOrder).toHaveBeenCalledWith('tenant-1', 'user-1', ORDER_ID, 'Customer request');
      expect(result).toEqual({ id: ORDER_ID, status: 'CANCELLED' });
    });

    it('rejects an empty cancellation reason', async () => {
      await expect(caller.cancelOrder({ orderId: ORDER_ID, reason: '' })).rejects.toThrow();
      expect(orderService.cancelOrder).not.toHaveBeenCalled();
    });
  });

  describe('refundOrder', () => {
    it('delegates to orderService.refundOrder', async () => {
      orderService.refundOrder.mockResolvedValue({ id: ORDER_ID, status: 'REFUNDED' });
      const result = await caller.refundOrder({ orderId: ORDER_ID });
      expect(orderService.refundOrder).toHaveBeenCalledWith('tenant-1', 'user-1', ORDER_ID);
      expect(result).toEqual({ id: ORDER_ID, status: 'REFUNDED' });
    });
  });

  // ─── Shipments ──────────────────────────────────────────
  describe('createShipment', () => {
    it('creates a shipment with the default shipping cost applied', async () => {
      shippingService.createShipment.mockResolvedValue({ id: SHIPMENT_ID });
      const result = await caller.createShipment({ orderId: ORDER_ID, carrier: 'Delhivery' });
      expect(shippingService.createShipment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ orderId: ORDER_ID, carrier: 'Delhivery', shippingCostPaise: 0 }),
      );
      expect(result).toEqual({ id: SHIPMENT_ID });
    });

    it('rejects a non-positive weight', async () => {
      await expect(
        caller.createShipment({ orderId: ORDER_ID, weightGrams: 0 }),
      ).rejects.toThrow();
    });
  });

  describe('getShipment', () => {
    it('delegates to shippingService.getShipment', async () => {
      shippingService.getShipment.mockResolvedValue({ id: SHIPMENT_ID });
      const result = await caller.getShipment({ shipmentId: SHIPMENT_ID });
      expect(shippingService.getShipment).toHaveBeenCalledWith('tenant-1', SHIPMENT_ID);
      expect(result).toEqual({ id: SHIPMENT_ID });
    });
  });

  describe('listShipments', () => {
    it('applies default pagination when none is supplied', async () => {
      shippingService.listShipments.mockResolvedValue({ items: [] });
      await caller.listShipments({});
      expect(shippingService.listShipments).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards shipment filters and explicit pagination', async () => {
      shippingService.listShipments.mockResolvedValue({ items: [] });
      await caller.listShipments({
        filters: { orderId: ORDER_ID, status: 'IN_TRANSIT', carrier: 'Delhivery' },
        pagination: { page: 1, limit: 50, sortOrder: 'asc' },
      });
      expect(shippingService.listShipments).toHaveBeenCalledWith(
        'tenant-1',
        { orderId: ORDER_ID, status: 'IN_TRANSIT', carrier: 'Delhivery' },
        { page: 1, limit: 50, sortOrder: 'asc' },
      );
    });
  });

  describe('updateTracking', () => {
    it('forwards the tracking update with tenant and user', async () => {
      shippingService.updateTracking.mockResolvedValue({ id: SHIPMENT_ID });
      const result = await caller.updateTracking({
        shipmentId: SHIPMENT_ID,
        status: 'DELIVERED',
        trackingNumber: 'TRK-1',
        trackingUrl: 'https://track.example.com/TRK-1',
      });
      expect(shippingService.updateTracking).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ shipmentId: SHIPMENT_ID, status: 'DELIVERED', trackingNumber: 'TRK-1' }),
      );
      expect(result).toEqual({ id: SHIPMENT_ID });
    });

    it('rejects a malformed tracking url', async () => {
      await expect(
        caller.updateTracking({ shipmentId: SHIPMENT_ID, status: 'DELIVERED', trackingUrl: 'not a url' }),
      ).rejects.toThrow();
    });
  });

  describe('getShipmentsByOrder', () => {
    it('delegates to shippingService.getShipmentsByOrder', async () => {
      shippingService.getShipmentsByOrder.mockResolvedValue([{ id: SHIPMENT_ID }]);
      const result = await caller.getShipmentsByOrder({ orderId: ORDER_ID });
      expect(shippingService.getShipmentsByOrder).toHaveBeenCalledWith('tenant-1', ORDER_ID);
      expect(result).toEqual([{ id: SHIPMENT_ID }]);
    });
  });

  describe('generateLabel', () => {
    it('generates a label for the shipment via the named carrier', async () => {
      shippingService.generateLabel.mockResolvedValue({ labelUrl: 'https://labels.example.com/1.pdf' });
      const result = await caller.generateLabel({ shipmentId: SHIPMENT_ID, carrier: 'Delhivery' });
      expect(shippingService.generateLabel).toHaveBeenCalledWith('tenant-1', SHIPMENT_ID, 'Delhivery');
      expect(result).toEqual({ labelUrl: 'https://labels.example.com/1.pdf' });
    });

    it('rejects a missing carrier', async () => {
      await expect(
        caller.generateLabel({ shipmentId: SHIPMENT_ID } as never),
      ).rejects.toThrow();
      expect(shippingService.generateLabel).not.toHaveBeenCalled();
    });
  });

  // ─── Payment gateways ───────────────────────────────────
  describe('createGateway', () => {
    it('creates the gateway with defaults applied', async () => {
      paymentService.createGateway.mockResolvedValue({ id: GATEWAY_ID });
      const result = await caller.createGateway({ name: 'Razorpay Live', gatewayType: 'RAZORPAY' });
      expect(paymentService.createGateway).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ name: 'Razorpay Live', gatewayType: 'RAZORPAY', isActive: true, isDefault: false }),
      );
      expect(result).toEqual({ id: GATEWAY_ID });
    });

    it('rejects an unsupported gateway type', async () => {
      await expect(
        caller.createGateway({ name: 'X', gatewayType: 'BITCOIN' as never }),
      ).rejects.toThrow();
    });
  });

  describe('getGateway', () => {
    it('delegates to paymentService.getGateway', async () => {
      paymentService.getGateway.mockResolvedValue({ id: GATEWAY_ID });
      const result = await caller.getGateway({ gatewayId: GATEWAY_ID });
      expect(paymentService.getGateway).toHaveBeenCalledWith('tenant-1', GATEWAY_ID);
      expect(result).toEqual({ id: GATEWAY_ID });
    });
  });

  describe('listGateways', () => {
    it('delegates to paymentService.listGateways with tenant only', async () => {
      paymentService.listGateways.mockResolvedValue([{ id: GATEWAY_ID }]);
      const result = await caller.listGateways();
      expect(paymentService.listGateways).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([{ id: GATEWAY_ID }]);
    });
  });

  describe('updateGateway', () => {
    it('applies a partial update to the gateway', async () => {
      paymentService.updateGateway.mockResolvedValue({ id: GATEWAY_ID, isActive: false });
      const result = await caller.updateGateway({ gatewayId: GATEWAY_ID, data: { isActive: false } });
      expect(paymentService.updateGateway).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        GATEWAY_ID,
        expect.objectContaining({ isActive: false }),
      );
      expect(result).toEqual({ id: GATEWAY_ID, isActive: false });
    });
  });

  // ─── Online payments ────────────────────────────────────
  describe('initiatePayment', () => {
    it('initiates a payment with the parsed input', async () => {
      paymentService.initiatePayment.mockResolvedValue({ id: PAYMENT_ID });
      const input = { orderId: ORDER_ID, gatewayId: GATEWAY_ID, amountPaise: 50000 };
      const result = await caller.initiatePayment(input);
      expect(paymentService.initiatePayment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ ...input, currencyCode: 'INR' }),
      );
      expect(result).toEqual({ id: PAYMENT_ID });
    });

    it('rejects a zero payment amount', async () => {
      await expect(
        caller.initiatePayment({ orderId: ORDER_ID, gatewayId: GATEWAY_ID, amountPaise: 0 }),
      ).rejects.toThrow();
      expect(paymentService.initiatePayment).not.toHaveBeenCalled();
    });
  });

  describe('listPayments', () => {
    it('applies default pagination when none is supplied', async () => {
      paymentService.listPayments.mockResolvedValue({ items: [] });
      await caller.listPayments({});
      expect(paymentService.listPayments).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards payment filters and explicit pagination', async () => {
      paymentService.listPayments.mockResolvedValue({ items: [] });
      await caller.listPayments({
        filters: { orderId: ORDER_ID, gatewayId: GATEWAY_ID, status: 'CAPTURED' },
        pagination: { page: 2, limit: 10, sortOrder: 'desc' },
      });
      expect(paymentService.listPayments).toHaveBeenCalledWith(
        'tenant-1',
        { orderId: ORDER_ID, gatewayId: GATEWAY_ID, status: 'CAPTURED' },
        { page: 2, limit: 10, sortOrder: 'desc' },
      );
    });
  });

  describe('refundPayment', () => {
    it('refunds a partial amount when provided', async () => {
      paymentService.refundPayment.mockResolvedValue({ id: PAYMENT_ID, status: 'PARTIALLY_REFUNDED' });
      const result = await caller.refundPayment({ paymentId: PAYMENT_ID, refundAmountPaise: 1000 });
      expect(paymentService.refundPayment).toHaveBeenCalledWith('tenant-1', PAYMENT_ID, 1000);
      expect(result).toEqual({ id: PAYMENT_ID, status: 'PARTIALLY_REFUNDED' });
    });

    it('refunds the full amount when no refund amount is supplied', async () => {
      paymentService.refundPayment.mockResolvedValue({ id: PAYMENT_ID, status: 'REFUNDED' });
      await caller.refundPayment({ paymentId: PAYMENT_ID });
      expect(paymentService.refundPayment).toHaveBeenCalledWith('tenant-1', PAYMENT_ID, undefined);
    });

    it('rejects a non-positive refund amount', async () => {
      await expect(
        caller.refundPayment({ paymentId: PAYMENT_ID, refundAmountPaise: 0 }),
      ).rejects.toThrow();
      expect(paymentService.refundPayment).not.toHaveBeenCalled();
    });
  });

  // ─── Webhooks ───────────────────────────────────────────
  describe('handleWebhook', () => {
    const webhookInput = {
      source: 'razorpay',
      eventType: 'payment.captured',
      payload: { event: 'payment.captured' },
      rawBody: '{"event":"payment.captured"}',
      signature: 'sig-abc',
      channelId: CHANNEL_ID,
      gatewayId: GATEWAY_ID,
    };

    it('processes the webhook once the signature is verified', async () => {
      webhookService.verifyInboundSignature.mockResolvedValue(true);
      webhookService.handleWebhook.mockResolvedValue({ status: 'PROCESSED' });
      const result = await caller.handleWebhook(webhookInput);
      expect(webhookService.verifyInboundSignature).toHaveBeenCalledWith(
        'tenant-1',
        'razorpay',
        '{"event":"payment.captured"}',
        'sig-abc',
        CHANNEL_ID,
      );
      expect(webhookService.handleWebhook).toHaveBeenCalledWith(
        'tenant-1',
        'razorpay',
        'payment.captured',
        { event: 'payment.captured' },
        CHANNEL_ID,
        GATEWAY_ID,
      );
      expect(result).toEqual({ status: 'PROCESSED' });
    });

    it('rejects with UNAUTHORIZED and does not process when the signature is invalid', async () => {
      webhookService.verifyInboundSignature.mockResolvedValue(false);
      const err = await rejectionOf(caller.handleWebhook(webhookInput));
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('UNAUTHORIZED');
      expect(webhookService.handleWebhook).not.toHaveBeenCalled();
    });

    it('rejects an empty raw body before verification runs', async () => {
      await expect(caller.handleWebhook({ ...webhookInput, rawBody: '' })).rejects.toThrow();
      expect(webhookService.verifyInboundSignature).not.toHaveBeenCalled();
    });
  });

  // ─── Shopify (admin-triggered) ──────────────────────────
  describe('syncProductToShopify', () => {
    it('syncs after confirming the channel is a Shopify channel of this tenant', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue({ id: CHANNEL_ID });
      shopifyService.syncProductToShopify.mockResolvedValue({ externalProductId: 'gid://1' });
      const result = await caller.syncProductToShopify({ channelId: CHANNEL_ID, productId: PRODUCT_ID });
      expect(prisma.salesChannel.findFirst).toHaveBeenCalledWith({
        where: { id: CHANNEL_ID, tenantId: 'tenant-1', channelType: 'SHOPIFY' },
        select: { id: true },
      });
      expect(shopifyService.syncProductToShopify).toHaveBeenCalledWith('tenant-1', CHANNEL_ID, PRODUCT_ID);
      expect(result).toEqual({ externalProductId: 'gid://1' });
    });

    it('throws NOT_FOUND and never calls Shopify for a non-Shopify or foreign channel', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue(null);
      const err = await rejectionOf(caller.syncProductToShopify({ channelId: CHANNEL_ID, productId: PRODUCT_ID }));
      expect((err as TRPCError).code).toBe('NOT_FOUND');
      expect(shopifyService.syncProductToShopify).not.toHaveBeenCalled();
    });
  });

  describe('pullOrdersFromShopify', () => {
    it('pulls orders for a verified Shopify channel', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue({ id: CHANNEL_ID });
      shopifyService.pullOrdersFromShopify.mockResolvedValue({ imported: 4 });
      const result = await caller.pullOrdersFromShopify({ channelId: CHANNEL_ID });
      expect(shopifyService.pullOrdersFromShopify).toHaveBeenCalledWith('tenant-1', CHANNEL_ID);
      expect(result).toEqual({ imported: 4 });
    });

    it('throws NOT_FOUND when the channel is not a Shopify channel', async () => {
      prisma.salesChannel.findFirst.mockResolvedValue(null);
      const err = await rejectionOf(caller.pullOrdersFromShopify({ channelId: CHANNEL_ID }));
      expect((err as TRPCError).code).toBe('NOT_FOUND');
      expect(shopifyService.pullOrdersFromShopify).not.toHaveBeenCalled();
    });
  });

  describe('retryWebhook', () => {
    it('retries the webhook log for the tenant', async () => {
      webhookService.retryWebhook.mockResolvedValue({ status: 'PROCESSED' });
      const result = await caller.retryWebhook({ webhookLogId: WEBHOOK_LOG_ID });
      expect(webhookService.retryWebhook).toHaveBeenCalledWith('tenant-1', WEBHOOK_LOG_ID);
      expect(result).toEqual({ status: 'PROCESSED' });
    });
  });

  describe('listWebhookLogs', () => {
    it('applies default pagination when none is supplied', async () => {
      webhookService.listWebhookLogs.mockResolvedValue({ items: [] });
      await caller.listWebhookLogs({});
      expect(webhookService.listWebhookLogs).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards webhook log filters and explicit pagination', async () => {
      webhookService.listWebhookLogs.mockResolvedValue({ items: [] });
      await caller.listWebhookLogs({
        filters: { source: 'shopify', status: 'FAILED', channelId: CHANNEL_ID, gatewayId: GATEWAY_ID },
        pagination: { page: 1, limit: 5, sortOrder: 'asc' },
      });
      expect(webhookService.listWebhookLogs).toHaveBeenCalledWith(
        'tenant-1',
        { source: 'shopify', status: 'FAILED', channelId: CHANNEL_ID, gatewayId: GATEWAY_ID },
        { page: 1, limit: 5, sortOrder: 'asc' },
      );
    });
  });

  // ─── Click & collect ────────────────────────────────────
  describe('createClickCollect', () => {
    it('creates a click & collect request for the order', async () => {
      clickCollectService.create.mockResolvedValue({ id: CLICK_ID });
      const result = await caller.createClickCollect({ orderId: ORDER_ID, locationId: LOCATION_ID });
      expect(clickCollectService.create).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { orderId: ORDER_ID, locationId: LOCATION_ID },
      );
      expect(result).toEqual({ id: CLICK_ID });
    });

    it('rejects a request missing the pickup location', async () => {
      await expect(
        caller.createClickCollect({ orderId: ORDER_ID } as never),
      ).rejects.toThrow();
      expect(clickCollectService.create).not.toHaveBeenCalled();
    });
  });

  describe('getClickCollect', () => {
    it('delegates to clickCollectService.get', async () => {
      clickCollectService.get.mockResolvedValue({ id: CLICK_ID });
      const result = await caller.getClickCollect({ id: CLICK_ID });
      expect(clickCollectService.get).toHaveBeenCalledWith('tenant-1', CLICK_ID);
      expect(result).toEqual({ id: CLICK_ID });
    });
  });

  describe('listClickCollects', () => {
    it('applies default pagination when none is supplied', async () => {
      clickCollectService.list.mockResolvedValue({ items: [] });
      await caller.listClickCollects({});
      expect(clickCollectService.list).toHaveBeenCalledWith('tenant-1', {}, DEFAULT_PAGINATION);
    });

    it('forwards filters and explicit pagination', async () => {
      clickCollectService.list.mockResolvedValue({ items: [] });
      await caller.listClickCollects({
        filters: { locationId: LOCATION_ID, status: 'READY_FOR_PICKUP' },
        pagination: { page: 4, limit: 15, sortOrder: 'asc' },
      });
      expect(clickCollectService.list).toHaveBeenCalledWith(
        'tenant-1',
        { locationId: LOCATION_ID, status: 'READY_FOR_PICKUP' },
        { page: 4, limit: 15, sortOrder: 'asc' },
      );
    });
  });

  describe('markClickCollectNotified', () => {
    it('marks the pickup as notified by the acting user', async () => {
      clickCollectService.markNotified.mockResolvedValue({ id: CLICK_ID, status: 'NOTIFIED' });
      const result = await caller.markClickCollectNotified({ id: CLICK_ID });
      expect(clickCollectService.markNotified).toHaveBeenCalledWith('tenant-1', 'user-1', CLICK_ID);
      expect(result).toEqual({ id: CLICK_ID, status: 'NOTIFIED' });
    });
  });

  describe('confirmClickCollectPickup', () => {
    it('confirms the pickup for the acting user', async () => {
      clickCollectService.confirmPickup.mockResolvedValue({ id: CLICK_ID, status: 'PICKED_UP' });
      const result = await caller.confirmClickCollectPickup({ id: CLICK_ID });
      expect(clickCollectService.confirmPickup).toHaveBeenCalledWith('tenant-1', 'user-1', CLICK_ID);
      expect(result).toEqual({ id: CLICK_ID, status: 'PICKED_UP' });
    });

    it('rejects a non-uuid id', async () => {
      await expect(caller.confirmClickCollectPickup({ id: 'x' })).rejects.toThrow();
    });
  });

  describe('cancelClickCollect', () => {
    it('cancels the click & collect request for the acting user', async () => {
      clickCollectService.cancel.mockResolvedValue({ id: CLICK_ID, status: 'CANCELLED' });
      const result = await caller.cancelClickCollect({ id: CLICK_ID });
      expect(clickCollectService.cancel).toHaveBeenCalledWith('tenant-1', 'user-1', CLICK_ID);
      expect(result).toEqual({ id: CLICK_ID, status: 'CANCELLED' });
    });
  });

  describe('getClickCollectQueue', () => {
    it('returns the queue for the requested location', async () => {
      clickCollectService.getQueue.mockResolvedValue([{ id: CLICK_ID }]);
      const result = await caller.getClickCollectQueue({ locationId: LOCATION_ID });
      expect(clickCollectService.getQueue).toHaveBeenCalledWith('tenant-1', LOCATION_ID);
      expect(result).toEqual([{ id: CLICK_ID }]);
    });
  });

  // ─── Product reviews ────────────────────────────────────
  describe('createReview', () => {
    it('creates an unpublished, unverified review by default', async () => {
      prisma.productReview.create.mockResolvedValue(reviewRow);
      const result = await caller.createReview({
        productId: PRODUCT_ID,
        customerName: 'Asha',
        rating: 5,
        title: 'Lovely',
        body: 'Great piece',
      });
      expect(prisma.productReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'generated-uuid',
          tenantId: 'tenant-1',
          productId: PRODUCT_ID,
          channelId: null,
          customerName: 'Asha',
          rating: 5,
          isVerified: false,
          isPublished: false,
          createdBy: 'user-1',
          updatedBy: 'user-1',
        }),
      });
      expect(result).toEqual({
        id: REVIEW_ID,
        tenantId: 'tenant-1',
        productId: PRODUCT_ID,
        channelId: null,
        customerName: 'Asha',
        rating: 5,
        title: 'Lovely',
        body: 'Great piece',
        isVerified: false,
        isPublished: false,
        publishedAt: null,
        createdAt: reviewRow.createdAt,
        updatedAt: reviewRow.updatedAt,
      });
    });

    it('rejects a rating outside 1..5', async () => {
      await expect(
        caller.createReview({ productId: PRODUCT_ID, customerName: 'Asha', rating: 6 }),
      ).rejects.toThrow();
      expect(prisma.productReview.create).not.toHaveBeenCalled();
    });
  });

  describe('listReviews', () => {
    it('applies every filter and default pagination, then maps items', async () => {
      prisma.productReview.findMany.mockResolvedValue([reviewRow]);
      prisma.productReview.count.mockResolvedValue(1);
      const result = await caller.listReviews({
        filters: {
          productId: PRODUCT_ID,
          channelId: CHANNEL_ID,
          isPublished: false,
          rating: 5,
          search: 'lovely',
        },
      });
      const expectedWhere = {
        tenantId: 'tenant-1',
        productId: PRODUCT_ID,
        channelId: CHANNEL_ID,
        isPublished: false,
        rating: 5,
        OR: [
          { title: { contains: 'lovely' } },
          { body: { contains: 'lovely' } },
          { customerName: { contains: 'lovely' } },
        ],
      };
      expect(prisma.productReview.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.productReview.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(result).toEqual({
        items: [expect.objectContaining({ id: REVIEW_ID, customerName: 'Asha' })],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      });
    });

    it('computes skip, take and paging flags for a middle page', async () => {
      prisma.productReview.findMany.mockResolvedValue([reviewRow]);
      prisma.productReview.count.mockResolvedValue(25);
      const result = await caller.listReviews({
        pagination: { page: 2, limit: 10, sortOrder: 'asc' },
      });
      expect(prisma.productReview.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'asc' },
        skip: 10,
        take: 10,
      });
      expect(result).toMatchObject({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      });
    });

    it('returns an empty page without mapping any items', async () => {
      prisma.productReview.findMany.mockResolvedValue([]);
      prisma.productReview.count.mockResolvedValue(0);
      const result = await caller.listReviews({});
      expect(result).toMatchObject({ items: [], total: 0, totalPages: 0, hasNext: false, hasPrevious: false });
    });
  });

  describe('publishReview', () => {
    it('publishes only the tenant-scoped review and stamps the time', async () => {
      prisma.productReview.updateMany.mockResolvedValue({ count: 1 });
      const result = await caller.publishReview({ reviewId: REVIEW_ID });
      expect(prisma.productReview.updateMany).toHaveBeenCalledWith({
        where: { id: REVIEW_ID, tenantId: 'tenant-1' },
        data: { isPublished: true, publishedAt: expect.any(Date), updatedBy: 'user-1' },
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('unpublishReview', () => {
    it('unpublishes the tenant-scoped review and clears the publish time', async () => {
      prisma.productReview.updateMany.mockResolvedValue({ count: 1 });
      const result = await caller.unpublishReview({ reviewId: REVIEW_ID });
      expect(prisma.productReview.updateMany).toHaveBeenCalledWith({
        where: { id: REVIEW_ID, tenantId: 'tenant-1' },
        data: { isPublished: false, publishedAt: null, updatedBy: 'user-1' },
      });
      expect(result).toEqual({ success: true });
    });

    it('rejects a missing reviewId', async () => {
      await expect(caller.unpublishReview({} as never)).rejects.toThrow();
      expect(prisma.productReview.updateMany).not.toHaveBeenCalled();
    });
  });
});
