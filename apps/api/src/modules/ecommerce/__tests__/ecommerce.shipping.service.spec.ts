import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EcommerceShippingService } from '../ecommerce.shipping.service';
import { createMockPrismaService, TEST_TENANT_ID, TEST_USER_ID } from '../../../__tests__/setup';

function extendPrisma(base: ReturnType<typeof createMockPrismaService>) {
  return {
    ...base,
    onlineOrder: { findFirst: vi.fn(), update: vi.fn() },
    shipment: {
      findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(),
    },
  };
}

describe('EcommerceShippingService (Unit)', () => {
  let service: EcommerceShippingService;
  let mockPrisma: ReturnType<typeof extendPrisma>;

  const shipment = {
    id: 'sh-1', tenantId: TEST_TENANT_ID, orderId: 'o-1',
    shipmentNumber: 'SH/2604/0001', carrier: 'Delhivery',
    trackingNumber: 'TRK123', trackingUrl: null, status: 'LABEL_CREATED',
    estimatedDeliveryDate: null, actualDeliveryDate: null, weightGrams: 50,
    shippingCostPaise: 15000n, labelUrl: null,
    createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = extendPrisma(createMockPrismaService());
    service = new EcommerceShippingService(mockPrisma as any);
  });

  describe('createShipment', () => {
    it('creates a shipment and updates CONFIRMED order to PROCESSING', async () => {
      mockPrisma.onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', status: 'CONFIRMED', orderNumber: 'ON/1' });
      mockPrisma.shipment.count.mockResolvedValue(0);
      mockPrisma.shipment.create.mockResolvedValue(shipment);
      mockPrisma.onlineOrder.update.mockResolvedValue({});

      const result = await service.createShipment(TEST_TENANT_ID, TEST_USER_ID, {
        orderId: 'o-1', carrier: 'Delhivery',
      });

      expect(result.shipmentNumber).toBeDefined();
      expect(mockPrisma.onlineOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
      );
    });

    it('throws BadRequestException for CANCELLED order', async () => {
      mockPrisma.onlineOrder.findFirst.mockResolvedValue({ id: 'o-1', status: 'CANCELLED' });
      await expect(
        service.createShipment(TEST_TENANT_ID, TEST_USER_ID, { orderId: 'o-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing order', async () => {
      mockPrisma.onlineOrder.findFirst.mockResolvedValue(null);
      await expect(
        service.createShipment(TEST_TENANT_ID, TEST_USER_ID, { orderId: 'bad' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTracking', () => {
    it('updates order to DELIVERED when shipment is delivered', async () => {
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, orderId: 'o-1' });
      mockPrisma.shipment.update.mockResolvedValue({ ...shipment, status: 'DELIVERED' });
      mockPrisma.onlineOrder.update.mockResolvedValue({});

      await service.updateTracking(TEST_TENANT_ID, TEST_USER_ID, {
        shipmentId: 'sh-1', status: 'DELIVERED' as any,
      });

      expect(mockPrisma.onlineOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DELIVERED', deliveredAt: expect.any(Date) }),
        }),
      );
    });

    it('updates order to SHIPPED on PICKED_UP', async () => {
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, orderId: 'o-1' });
      mockPrisma.shipment.update.mockResolvedValue({ ...shipment, status: 'PICKED_UP' });
      mockPrisma.onlineOrder.update.mockResolvedValue({});

      await service.updateTracking(TEST_TENANT_ID, TEST_USER_ID, {
        shipmentId: 'sh-1', status: 'PICKED_UP' as any,
      });

      expect(mockPrisma.onlineOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SHIPPED' }),
        }),
      );
    });
  });

  describe('generateLabel', () => {
    const envKeys = ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHIPPING_MOCK', 'NODE_ENV', 'DELHIVERY_API_TOKEN', 'DELHIVERY_PICKUP_LOCATION'];
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const k of envKeys) { saved[k] = process.env[k]; delete process.env[k]; }
    });
    afterEach(() => {
      for (const k of envKeys) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    });

    it('throws NOT_CONFIGURED for Shiprocket without credentials (no fake label)', async () => {
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, order: {} });
      await expect(service.generateLabel(TEST_TENANT_ID, 'sh-1', 'Shiprocket')).rejects.toMatchObject({
        response: { status: 'NOT_CONFIGURED' },
      });
      expect(mockPrisma.shipment.update).not.toHaveBeenCalled();
    });

    it('throws NOT_CONFIGURED for Delhivery without token', async () => {
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, order: {} });
      await expect(service.generateLabel(TEST_TENANT_ID, 'sh-1', 'DELHIVERY')).rejects.toMatchObject({
        response: { status: 'NOT_CONFIGURED' },
      });
    });

    it('throws for unknown carriers without a mock override', async () => {
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, order: {} });
      await expect(service.generateLabel(TEST_TENANT_ID, 'sh-1', 'BLUEDART')).rejects.toMatchObject({
        response: { status: 'NOT_CONFIGURED' },
      });
    });

    it('returns a non-HTTP mock label only when SHIPPING_MOCK=true outside production', async () => {
      process.env.SHIPPING_MOCK = 'true';
      process.env.NODE_ENV = 'development';
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, order: {} });
      mockPrisma.shipment.update.mockImplementation(async ({ data }: any) => ({ ...shipment, ...data }));

      const result = await service.generateLabel(TEST_TENANT_ID, 'sh-1', 'Shiprocket');
      expect(result.labelUrl).toBe('mock://shipping-label/SH/2604/0001');
      expect(result.labelUrl).not.toContain('example.com');
    });

    it('ignores SHIPPING_MOCK=true in production', async () => {
      process.env.SHIPPING_MOCK = 'true';
      process.env.NODE_ENV = 'production';
      mockPrisma.shipment.findFirst.mockResolvedValue({ ...shipment, order: {} });
      await expect(service.generateLabel(TEST_TENANT_ID, 'sh-1', 'Shiprocket')).rejects.toMatchObject({
        response: { status: 'NOT_CONFIGURED' },
      });
    });
  });

  describe('getShipmentsByOrder', () => {
    it('returns all shipments for an order', async () => {
      mockPrisma.shipment.findMany.mockResolvedValue([shipment]);
      const result = await service.getShipmentsByOrder(TEST_TENANT_ID, 'o-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getShipment', () => {
    it('throws NotFoundException when not found', async () => {
      mockPrisma.shipment.findFirst.mockResolvedValue(null);
      await expect(service.getShipment(TEST_TENANT_ID, 'bad')).rejects.toThrow(NotFoundException);
    });
  });
});
