import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockPrismaService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
import { CustomerPortalOrdersService } from '../customer-portal.orders.service';

describe('CustomerPortalOrdersService (coverage)', () => {
  let service: CustomerPortalOrdersService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  const { tenantId } = mockTenantContext;
  const customerId = 'cust-1';
  const db = () => prisma as any;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    // Models not present in the shared mock
    db().onlineOrder = { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() };
    db().shipment = { findMany: vi.fn() };
    db().metalRateHistory = { findFirst: vi.fn() };
    // Transaction client is a separate model set; add the delegates the service uses inside $transaction
    db()._tx.saleReturn = { create: vi.fn() };
    db()._tx.onlineOrder = { update: vi.fn() };
    service = new CustomerPortalOrdersService(prisma as never);
  });

  const baseOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'o-1',
    tenantId,
    customerId,
    orderNumber: 'ON-001',
    status: 'DELIVERED',
    subtotalPaise: 50000n,
    shippingPaise: 200n,
    taxPaise: 1500n,
    discountPaise: 0n,
    totalPaise: 51700n,
    currencyCode: 'INR',
    shippingAddress: { city: 'Mumbai' },
    billingAddress: { city: 'Mumbai' },
    notes: null,
    cancelReason: null,
    placedAt: new Date('2026-01-01T00:00:00Z'),
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    items: [],
    shipments: [],
    payments: [],
    _count: { items: 0 },
    ...overrides,
  });

  const shipment = (overrides: Record<string, unknown> = {}) => ({
    id: 'sh-1',
    shipmentNumber: 'SH-1',
    carrier: 'BlueDart',
    trackingNumber: 'TN1',
    trackingUrl: 'https://track.example/TN1',
    status: 'IN_TRANSIT',
    estimatedDeliveryDate: new Date('2026-02-01'),
    actualDeliveryDate: null,
    createdAt: new Date('2026-01-05'),
    ...overrides,
  });

  describe('getMyOrders', () => {
    it('lists orders scoped to tenant and customer with thumbnail and item count', async () => {
      db().onlineOrder.findMany.mockResolvedValue([
        baseOrder({
          items: [{ product: { images: ['a.jpg', 'b.jpg'] } }],
          _count: { items: 3 },
          totalPaise: 51700n,
        }),
      ]);
      db().onlineOrder.count.mockResolvedValue(1);

      const result = await service.getMyOrders(tenantId, customerId, { page: 1, limit: 10 } as any);

      expect(db().onlineOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, customerId },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(db().onlineOrder.count).toHaveBeenCalledWith({ where: { tenantId, customerId } });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrevious).toBe(false);
      expect(result.items[0]).toEqual({
        id: 'o-1',
        orderNumber: 'ON-001',
        status: 'DELIVERED',
        totalPaise: 51700,
        currencyCode: 'INR',
        itemCount: 3,
        thumbnail: 'a.jpg',
        placedAt: baseOrder().placedAt,
        createdAt: baseOrder().createdAt,
      });
    });

    it('applies status and date range filters', async () => {
      db().onlineOrder.findMany.mockResolvedValue([]);
      db().onlineOrder.count.mockResolvedValue(0);
      const from = new Date('2026-01-01');
      const to = new Date('2026-03-31');

      await service.getMyOrders(tenantId, customerId, {
        page: 1,
        limit: 5,
        status: 'SHIPPED',
        dateFrom: from,
        dateTo: to,
      } as any);

      const where = db().onlineOrder.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        tenantId,
        customerId,
        status: 'SHIPPED',
        placedAt: { gte: from, lte: to },
      });
      expect(db().onlineOrder.count).toHaveBeenCalledWith({ where });
    });

    it('applies only a dateFrom bound', async () => {
      db().onlineOrder.findMany.mockResolvedValue([]);
      db().onlineOrder.count.mockResolvedValue(0);
      const from = new Date('2026-01-01');
      await service.getMyOrders(tenantId, customerId, { dateFrom: from } as any);
      expect(db().onlineOrder.findMany.mock.calls[0][0].where.placedAt).toEqual({ gte: from });
    });

    it('applies only a dateTo bound', async () => {
      db().onlineOrder.findMany.mockResolvedValue([]);
      db().onlineOrder.count.mockResolvedValue(0);
      const to = new Date('2026-03-31');
      await service.getMyOrders(tenantId, customerId, { dateTo: to } as any);
      expect(db().onlineOrder.findMany.mock.calls[0][0].where.placedAt).toEqual({ lte: to });
    });

    it('computes pagination skip and flags for a middle page', async () => {
      db().onlineOrder.findMany.mockResolvedValue([]);
      db().onlineOrder.count.mockResolvedValue(25);

      const result = await service.getMyOrders(tenantId, customerId, { page: 2, limit: 10 } as any);

      expect(db().onlineOrder.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrevious).toBe(true);
    });

    it('returns null thumbnail when the item has no product, images are missing or empty', async () => {
      db().onlineOrder.findMany.mockResolvedValue([
        baseOrder({ id: 'o-a', items: [] }),
        baseOrder({ id: 'o-b', items: [{ product: null }] }),
        baseOrder({ id: 'o-c', items: [{ product: { images: null } }] }),
        baseOrder({ id: 'o-d', items: [{ product: { images: [] } }] }),
      ]);
      db().onlineOrder.count.mockResolvedValue(4);

      const result = await service.getMyOrders(tenantId, customerId, {} as any);

      expect(result.items.map((i) => i.thumbnail)).toEqual([null, null, null, null]);
    });
  });

  describe('getOrderDetail', () => {
    it('throws NotFoundException when the order is not owned by the customer', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(null);
      await expect(service.getOrderDetail(tenantId, customerId, 'missing')).rejects.toThrow(NotFoundException);
      expect(db().onlineOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'missing', tenantId, customerId } }),
      );
    });

    it('maps the full order including items, payments, shipments and invoice url', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(
        baseOrder({
          status: 'SHIPPED',
          shippedAt: new Date('2026-01-03'),
          notes: 'gift wrap',
          items: [
            {
              id: 'i-1',
              title: 'Gold Ring',
              sku: 'ITEM-SKU',
              quantity: 1,
              unitPricePaise: 50000n,
              totalPaise: 50000n,
              weightMg: 5000n,
              product: { images: ['ring.jpg'], sku: 'PROD-SKU' },
            },
            {
              id: 'i-2',
              title: 'Chain',
              sku: null,
              quantity: 2,
              unitPricePaise: 100n,
              totalPaise: 200n,
              weightMg: null,
              product: { images: [], sku: 'CHAIN-SKU' },
            },
            {
              id: 'i-3',
              title: 'Custom',
              sku: null,
              quantity: 1,
              unitPricePaise: 1n,
              totalPaise: 1n,
              weightMg: null,
              product: null,
            },
          ],
          payments: [
            {
              id: 'pay-1',
              method: 'UPI',
              amountPaise: 51700n,
              currencyCode: 'INR',
              status: 'COMPLETED',
              completedAt: new Date('2026-01-01'),
            },
          ],
          shipments: [shipment()],
        }),
      );

      const r = await service.getOrderDetail(tenantId, customerId, 'o-1');

      expect(r.id).toBe('o-1');
      expect(r.status).toBe('SHIPPED');
      expect(r.subtotalPaise).toBe(50000);
      expect(r.shippingPaise).toBe(200);
      expect(r.taxPaise).toBe(1500);
      expect(r.discountPaise).toBe(0);
      expect(r.totalPaise).toBe(51700);
      expect(r.notes).toBe('gift wrap');
      expect(r.cancelReason).toBeNull();
      expect(r.shippedAt).toEqual(new Date('2026-01-03'));
      expect(r.invoiceUrl).toBe('/api/v1/store/account/orders/o-1/invoice');

      expect(r.items).toEqual([
        {
          id: 'i-1',
          title: 'Gold Ring',
          sku: 'ITEM-SKU',
          quantity: 1,
          unitPricePaise: 50000,
          totalPaise: 50000,
          weightMg: 5000,
          image: 'ring.jpg',
        },
        {
          id: 'i-2',
          title: 'Chain',
          sku: 'CHAIN-SKU',
          quantity: 2,
          unitPricePaise: 100,
          totalPaise: 200,
          weightMg: null,
          image: null,
        },
        {
          id: 'i-3',
          title: 'Custom',
          sku: null,
          quantity: 1,
          unitPricePaise: 1,
          totalPaise: 1,
          weightMg: null,
          image: null,
        },
      ]);

      expect(r.payments).toEqual([
        {
          id: 'pay-1',
          method: 'UPI',
          amountPaise: 51700,
          currencyCode: 'INR',
          status: 'COMPLETED',
          completedAt: new Date('2026-01-01'),
        },
      ]);

      expect(r.shipments).toEqual([
        {
          id: 'sh-1',
          shipmentNumber: 'SH-1',
          carrier: 'BlueDart',
          trackingNumber: 'TN1',
          trackingUrl: 'https://track.example/TN1',
          status: 'IN_TRANSIT',
          estimatedDeliveryDate: new Date('2026-02-01'),
          actualDeliveryDate: null,
          createdAt: new Date('2026-01-05'),
        },
      ]);
    });

    it('handles an order with no items, payments or shipments', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(baseOrder({ items: [], payments: [], shipments: [] }));
      const r = await service.getOrderDetail(tenantId, customerId, 'o-1');
      expect(r.items).toEqual([]);
      expect(r.payments).toEqual([]);
      expect(r.shipments).toEqual([]);
    });
  });

  describe('getOrderTrackingLive', () => {
    it('throws NotFoundException when the order does not belong to the customer', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(null);
      await expect(service.getOrderTrackingLive(tenantId, customerId, 'o-x')).rejects.toThrow(NotFoundException);
      expect(db().shipment.findMany).not.toHaveBeenCalled();
    });

    it('returns mapped shipments for the order, newest first', async () => {
      db().onlineOrder.findFirst.mockResolvedValue({ id: 'o-1' });
      db().shipment.findMany.mockResolvedValue([
        shipment({ id: 'sh-2', status: 'DELIVERED', actualDeliveryDate: new Date('2026-01-10') }),
        shipment({ id: 'sh-1' }),
      ]);

      const r = await service.getOrderTrackingLive(tenantId, customerId, 'o-1');

      expect(db().onlineOrder.findFirst).toHaveBeenCalledWith({
        where: { id: 'o-1', tenantId, customerId },
        select: { id: true },
      });
      expect(db().shipment.findMany).toHaveBeenCalledWith({
        where: { tenantId, orderId: 'o-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(r.map((s) => s.id)).toEqual(['sh-2', 'sh-1']);
      expect(r[0].status).toBe('DELIVERED');
      expect(r[0].actualDeliveryDate).toEqual(new Date('2026-01-10'));
      expect(r[1].trackingUrl).toBe('https://track.example/TN1');
    });

    it('returns an empty list when the order has no shipments', async () => {
      db().onlineOrder.findFirst.mockResolvedValue({ id: 'o-1' });
      db().shipment.findMany.mockResolvedValue([]);
      expect(await service.getOrderTrackingLive(tenantId, customerId, 'o-1')).toEqual([]);
    });
  });

  describe('downloadInvoice', () => {
    it('throws NotFoundException when the order is not found', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(null);
      await expect(service.downloadInvoice(tenantId, customerId, 'x')).rejects.toThrow(NotFoundException);
    });

    it('rejects invoices for pending orders', async () => {
      db().onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', orderNumber: 'ON-1', status: 'PENDING' });
      await expect(service.downloadInvoice(tenantId, customerId, 'o-1')).rejects.toThrow(BadRequestException);
    });

    it('returns the invoice url for a confirmed order', async () => {
      db().onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', orderNumber: 'ON-1', status: 'CONFIRMED' });
      const r = await service.downloadInvoice(tenantId, customerId, 'o-1');
      expect(r).toEqual({ invoiceUrl: '/api/v1/store/invoices/o-1/pdf', orderNumber: 'ON-1' });
    });
  });

  describe('requestReturn', () => {
    const deliveredOrder = (overrides: Record<string, unknown> = {}) =>
      baseOrder({
        status: 'DELIVERED',
        items: [
          {
            id: 'oi-1',
            productId: 'prod-1',
            title: 'Gold Ring',
            quantity: 2,
            totalPaise: 100000n,
          },
          {
            id: 'oi-2',
            productId: null,
            title: 'Custom Piece',
            quantity: 1,
            totalPaise: 30000n,
          },
        ],
        ...overrides,
      });

    const input = (items: Array<{ orderItemId: string; quantity: number; reason: string }>) => ({
      orderId: 'o-1',
      items,
      reason: 'Damaged',
      preferredRefundMethod: 'STORE_CREDIT',
    });

    const returnRecord = () => ({
      id: 'ret-1',
      returnNumber: 'RET-000001',
      status: 'DRAFT',
      reason: 'Damaged',
      subtotalPaise: 50000n,
      refundAmountPaise: 50000n,
      refundMethod: 'STORE_CREDIT',
      metalRateDifferencePaise: 0n,
      createdAt: new Date('2026-02-01'),
      items: [
        {
          id: 'ri-1',
          productId: 'prod-1',
          quantity: 1,
          returnPricePaise: 50000n,
          reason: 'Damaged',
        },
      ],
    });

    it('throws NotFoundException when the order is not found', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(null);
      await expect(
        service.requestReturn(tenantId, customerId, input([{ orderItemId: 'oi-1', quantity: 1, reason: 'x' }]) as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects returns for orders that are not delivered', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(deliveredOrder({ status: 'SHIPPED' }));
      await expect(
        service.requestReturn(tenantId, customerId, input([{ orderItemId: 'oi-1', quantity: 1, reason: 'x' }]) as any),
      ).rejects.toThrow(/only be requested for delivered/);
      expect(db().saleReturn.count).not.toHaveBeenCalled();
    });

    it('rejects a return item that is not part of the order', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(deliveredOrder());
      await expect(
        service.requestReturn(tenantId, customerId, input([{ orderItemId: 'nope', quantity: 1, reason: 'x' }]) as any),
      ).rejects.toThrow(/not found in this order/);
    });

    it('rejects a return quantity greater than the ordered quantity', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(deliveredOrder());
      await expect(
        service.requestReturn(tenantId, customerId, input([{ orderItemId: 'oi-2', quantity: 2, reason: 'x' }]) as any),
      ).rejects.toThrow(/exceeds order quantity/);
    });

    it('fails with a support message when no linked sale exists', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce(null); // computeMetalRateDifferencePaise lookup
      db().sale.findFirst.mockResolvedValue(null);
      db().saleReturn.count.mockResolvedValue(0);

      await expect(
        service.requestReturn(tenantId, customerId, input([{ orderItemId: 'oi-1', quantity: 1, reason: 'x' }]) as any),
      ).rejects.toThrow(/no linked sale record found/);
      expect(db()._tx.saleReturn.create).not.toHaveBeenCalled();
      expect(db().onlineOrder.update).not.toHaveBeenCalled();
    });

    it('creates a return with prorated refund and marks the order RETURNED', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce(null); // no metal product: metal rate difference is 0
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(4);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());
      db()._tx.onlineOrder.update.mockResolvedValue({});

      const r = await service.requestReturn(
        tenantId,
        customerId,
        input([
          { orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' },
          { orderItemId: 'oi-2', quantity: 1, reason: 'Other' },
        ]) as any,
      );

      // oi-1: 100000 / 2 * 1 = 50000; oi-2: 30000 / 1 * 1 = 30000 -> subtotal 80000
      const createArgs = db()._tx.saleReturn.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
        tenantId,
        returnNumber: 'RET-000005',
        originalSaleId: 'sale-1',
        customerId,
        locationId: 'loc-1',
        reason: 'Damaged',
        status: 'DRAFT',
        subtotalPaise: 80000n,
        refundAmountPaise: 80000n,
        refundMethod: 'STORE_CREDIT',
        metalRateDifferencePaise: 0n,
        createdBy: customerId,
        updatedBy: customerId,
      });
      expect(createArgs.data.items.create).toEqual([
        {
          tenantId,
          originalLineItemId: 'oi-1',
          productId: 'prod-1',
          quantity: 1,
          returnPricePaise: 50000n,
          reason: 'Damaged',
        },
        {
          tenantId,
          originalLineItemId: 'oi-2',
          productId: null,
          quantity: 1,
          returnPricePaise: 30000n,
          reason: 'Other',
        },
      ]);
      expect(db()._tx.onlineOrder.update).toHaveBeenCalledWith({
        where: { id: 'o-1' },
        data: { status: 'RETURNED', updatedBy: customerId },
      });

      expect(r).toEqual({
        id: 'ret-1',
        returnNumber: 'RET-000001',
        status: 'DRAFT',
        reason: 'Damaged',
        subtotalPaise: 50000,
        refundAmountPaise: 50000,
        refundMethod: 'STORE_CREDIT',
        metalRateDifferencePaise: 0,
        createdAt: new Date('2026-02-01'),
        items: [
          {
            id: 'ri-1',
            productId: 'prod-1',
            quantity: 1,
            returnPricePaise: 50000,
            reason: 'Damaged',
          },
        ],
      });
    });

    it('reduces the refund by the metal rate drop when the current rate is lower than at purchase', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce({
          placedAt: new Date('2026-01-01'),
          items: [{ product: { productType: 'GOLD', metalPurity: 916 } }],
        });
      db().metalRateHistory.findFirst.mockImplementation(async (args: any) =>
        args.where.recordedAt
          ? { ratePerGramPaise: 10000n } // rate at order time
          : { ratePerGramPaise: 9000n }, // current rate
      );
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      // subtotal 50000, delta 1000 of purchase 10000 -> diff = 50000 * 1000 / 10000 = 5000
      const data = db()._tx.saleReturn.create.mock.calls[0][0].data;
      expect(data.metalRateDifferencePaise).toBe(5000n);
      expect(data.refundAmountPaise).toBe(45000n);
      expect(db().metalRateHistory.findFirst).toHaveBeenCalledWith({
        where: { metalType: 'GOLD', purity: 916, recordedAt: { lte: new Date('2026-01-01') } },
        orderBy: { recordedAt: 'desc' },
      });
    });

    it('defaults to zero metal difference when the metal rate has not dropped', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce({
          placedAt: new Date('2026-01-01'),
          items: [{ product: { productType: 'SILVER', metalPurity: 999 } }],
        });
      db().metalRateHistory.findFirst.mockImplementation(async (args: any) =>
        args.where.recordedAt ? { ratePerGramPaise: 9000n } : { ratePerGramPaise: 9500n },
      );
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      const data = db()._tx.saleReturn.create.mock.calls[0][0].data;
      expect(data.metalRateDifferencePaise).toBe(0n);
      expect(data.refundAmountPaise).toBe(50000n);
    });

    it('treats metal rate difference as zero when the order has no placedAt', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce({ placedAt: null, items: [] });
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      expect(db().metalRateHistory.findFirst).not.toHaveBeenCalled();
      expect(db()._tx.saleReturn.create.mock.calls[0][0].data.metalRateDifferencePaise).toBe(0n);
    });

    it('treats metal rate difference as zero for non-metal products', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce({
          placedAt: new Date('2026-01-01'),
          items: [{ product: { productType: 'FINISHED_GOODS', metalPurity: 916 } }],
        });
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      expect(db().metalRateHistory.findFirst).not.toHaveBeenCalled();
    });

    it('treats metal rate difference as zero when rate history is missing', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce({
          placedAt: new Date('2026-01-01'),
          items: [{ product: { productType: 'GOLD', metalPurity: 916 } }],
        });
      db().metalRateHistory.findFirst.mockResolvedValue(null);
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      expect(db()._tx.saleReturn.create.mock.calls[0][0].data.metalRateDifferencePaise).toBe(0n);
    });

    it('treats metal rate difference as zero when the purchase rate is zero', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockResolvedValueOnce({
          placedAt: new Date('2026-01-01'),
          items: [{ product: { productType: 'PLATINUM', metalPurity: 950 } }],
        });
      db().metalRateHistory.findFirst.mockImplementation(async (args: any) =>
        args.where.recordedAt ? { ratePerGramPaise: 0n } : { ratePerGramPaise: 100n },
      );
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      expect(db()._tx.saleReturn.create.mock.calls[0][0].data.metalRateDifferencePaise).toBe(0n);
    });

    it('falls back to zero metal difference when the rate lookup throws', async () => {
      db().onlineOrder.findFirst
        .mockResolvedValueOnce(deliveredOrder())
        .mockRejectedValueOnce(new Error('db down'));
      db().sale.findFirst.mockResolvedValue({ id: 'sale-1', locationId: 'loc-1' });
      db().saleReturn.count.mockResolvedValue(0);
      db()._tx.saleReturn.create.mockResolvedValue(returnRecord());

      await service.requestReturn(
        tenantId,
        customerId,
        input([{ orderItemId: 'oi-1', quantity: 1, reason: 'Damaged' }]) as any,
      );

      expect(db()._tx.saleReturn.create.mock.calls[0][0].data.metalRateDifferencePaise).toBe(0n);
    });
  });

  describe('getReturnStatus', () => {
    it('throws NotFoundException when the return is not found for this customer', async () => {
      db().saleReturn.findFirst.mockResolvedValue(null);
      await expect(service.getReturnStatus(tenantId, customerId, 'ret-x')).rejects.toThrow(NotFoundException);
      expect(db().saleReturn.findFirst).toHaveBeenCalledWith({
        where: { id: 'ret-x', tenantId, customerId },
        include: { items: true },
      });
    });

    it('returns the mapped return with its items', async () => {
      db().saleReturn.findFirst.mockResolvedValue({
        id: 'ret-1',
        returnNumber: 'RET-000002',
        status: 'APPROVED',
        reason: 'Size',
        subtotalPaise: 12000n,
        refundAmountPaise: 11000n,
        refundMethod: 'ORIGINAL_PAYMENT',
        metalRateDifferencePaise: 1000n,
        createdAt: new Date('2026-02-02'),
        items: [
          { id: 'ri-1', productId: null, quantity: 2, returnPricePaise: 12000n, reason: 'Size' },
        ],
      });

      const r = await service.getReturnStatus(tenantId, customerId, 'ret-1');

      expect(r).toEqual({
        id: 'ret-1',
        returnNumber: 'RET-000002',
        status: 'APPROVED',
        reason: 'Size',
        subtotalPaise: 12000,
        refundAmountPaise: 11000,
        refundMethod: 'ORIGINAL_PAYMENT',
        metalRateDifferencePaise: 1000,
        createdAt: new Date('2026-02-02'),
        items: [{ id: 'ri-1', productId: null, quantity: 2, returnPricePaise: 12000, reason: 'Size' }],
      });
    });
  });

  describe('cancelOrder', () => {
    it('throws NotFoundException when the order is not found', async () => {
      db().onlineOrder.findFirst.mockResolvedValue(null);
      await expect(service.cancelOrder(tenantId, customerId, 'x')).rejects.toThrow(NotFoundException);
      expect(db().onlineOrder.update).not.toHaveBeenCalled();
    });

    it.each(['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'])(
      'rejects cancellation for a %s order',
      async (status) => {
        db().onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', orderNumber: 'ON-1', status });
        await expect(service.cancelOrder(tenantId, customerId, 'o-1')).rejects.toThrow(BadRequestException);
        expect(db().onlineOrder.update).not.toHaveBeenCalled();
      },
    );

    it.each(['PENDING', 'CONFIRMED'])('cancels a %s order', async (status) => {
      db().onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', orderNumber: 'ON-1', status });
      db().onlineOrder.update.mockResolvedValue({});

      const r = await service.cancelOrder(tenantId, customerId, 'o-1');

      expect(db().onlineOrder.update).toHaveBeenCalledWith({
        where: { id: 'o-1' },
        data: { status: 'CANCELLED', cancelReason: 'Cancelled by customer', updatedBy: customerId },
      });
      expect(r).toEqual({
        success: true,
        message: 'Order ON-1 has been cancelled successfully.',
      });
    });
  });
});
