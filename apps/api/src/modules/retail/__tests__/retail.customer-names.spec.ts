import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetailReturnService } from '../retail.return.service';
import { RetailRepairService } from '../retail.repair.service';
import { RetailCustomOrderService } from '../retail.custom-order.service';
import { createMockPrismaService, createMockEventBusService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';

vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));

const CUSTOMER = { firstName: 'Priya', lastName: 'Sharma', phone: '+919800000001' };
const NOW = new Date('2026-11-17T00:00:00Z');

describe('customer name + item description on retail responses (HK-RET-01 / HK-RET-03)', () => {
  const { tenantId } = mockTenantContext;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    (prisma as any).repairOrder = { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() };
    (prisma as any).customOrder = { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() };
    (prisma as any).saleReturn = { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() };
  });

  it('repair list and get include customerName / customerPhone', async () => {
    const row = { id: 'r1', tenantId, repairNumber: 'RP/1', customerId: 'c1', locationId: 'l1', status: 'RECEIVED', itemDescription: 'Ring', customer: CUSTOMER, createdAt: NOW, updatedAt: NOW };
    (prisma as any).repairOrder.findMany.mockResolvedValue([row]);
    (prisma as any).repairOrder.count.mockResolvedValue(1);
    (prisma as any).repairOrder.findFirst.mockResolvedValue(row);
    const svc = new RetailRepairService(prisma as never, createMockEventBusService() as never);
    const list = await svc.listRepairOrders(tenantId, {} as never, { page: 1, limit: 20 } as never);
    expect(list.items[0]).toMatchObject({ customerName: 'Priya Sharma', customerPhone: '+919800000001' });
    expect((prisma as any).repairOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ customer: expect.anything() }) }));
    expect(await svc.getRepairOrder(tenantId, 'r1')).toMatchObject({ customerName: 'Priya Sharma' });
  });

  it('custom order list and get include customerName', async () => {
    const row = { id: 'o1', tenantId, orderNumber: 'CO/1', customerId: 'c1', locationId: 'l1', status: 'DRAFT', description: 'Necklace', customer: CUSTOMER, createdAt: NOW, updatedAt: NOW };
    (prisma as any).customOrder.findMany.mockResolvedValue([row]);
    (prisma as any).customOrder.count.mockResolvedValue(1);
    (prisma as any).customOrder.findFirst.mockResolvedValue(row);
    const svc = new RetailCustomOrderService(prisma as never, createMockEventBusService() as never);
    const list = await svc.listCustomOrders(tenantId, {}, { page: 1, limit: 20 } as never);
    expect(list.items[0]).toMatchObject({ customerName: 'Priya Sharma' });
    expect(await svc.getCustomOrder(tenantId, 'o1')).toMatchObject({ customerName: 'Priya Sharma' });
  });

  it('return get/list expose item description from the sale line, falling back to product name', async () => {
    const row = {
      id: 'ret1', tenantId, returnNumber: 'RT/1', originalSaleId: 's1', customerId: 'c1', locationId: 'l1', reason: null, status: 'DRAFT',
      subtotalPaise: 12754696n, refundAmountPaise: 12754696n, refundMethod: 'CASH', metalRateDifferencePaise: 0n, customer: CUSTOMER,
      items: [
        { id: 'i1', originalLineItemId: 'li1', productId: 'd6bc4d38-a796-4bb7-8c4c-9867ff8e9282', quantity: 1, returnPricePaise: 12754696n, reason: null, originalLineItem: { description: '18K Mangalsutra B10' }, product: { name: 'Mangalsutra' } },
        { id: 'i2', originalLineItemId: 'li2', productId: 'p2', quantity: 1, returnPricePaise: 1n, reason: null, originalLineItem: null, product: { name: 'Nose Pin' } },
      ],
      createdAt: NOW, updatedAt: NOW,
    };
    (prisma as any).saleReturn.findFirst.mockResolvedValue(row);
    (prisma as any).saleReturn.findMany.mockResolvedValue([row]);
    (prisma as any).saleReturn.count.mockResolvedValue(1);
    const svc = new RetailReturnService(prisma as never, createMockEventBusService() as never);
    const got = await svc.getReturn(tenantId, 'ret1');
    expect(got.customerName).toBe('Priya Sharma');
    expect(got.items.map((i: any) => i.description)).toEqual(['18K Mangalsutra B10', 'Nose Pin']);
    const list = await svc.listReturns(tenantId, {}, { page: 1, limit: 20 } as never);
    expect((list.items[0]!.items[0] as any).description).toBe('18K Mangalsutra B10');
  });
});
