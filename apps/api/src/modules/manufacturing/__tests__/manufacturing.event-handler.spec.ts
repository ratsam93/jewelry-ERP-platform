import { describe, it, expect, beforeEach } from 'vitest';
import { ManufacturingEventHandler } from '../manufacturing.event-handler';
import { createMockEventBus, createMockPrismaService, TEST_TENANT_ID, TEST_USER_ID } from '../../../__tests__/setup';

describe('ManufacturingEventHandler', () => {
  let handler: ManufacturingEventHandler;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockMfgService: { createJobOrder: ReturnType<typeof vi.fn> };
  let subscribedHandlers: Map<string, (...args: any[]) => any>;

  const customOrderEvent = (payload: Record<string, unknown>) => ({
    type: 'retail.custom_order.created',
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    payload,
  });

  const fullPayload = {
    orderId: 'order-1',
    customerId: 'cust-1',
    description: 'Gold necklace, 22K',
    estimatePaise: 4500000,
    productId: '11111111-1111-4111-8111-111111111111',
    locationId: '22222222-2222-4222-8222-222222222222',
    targetWeightMg: 15000,
    metalPurity: '916',
  };

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockPrisma = createMockPrismaService();
    (mockPrisma as any).jobOrder = { findFirst: vi.fn().mockResolvedValue(null) };
    mockMfgService = {
      createJobOrder: vi.fn().mockResolvedValue({ id: 'job-1', jobNumber: 'JO-000001', status: 'DRAFT' }),
    };
    subscribedHandlers = new Map();
    mockEventBus.subscribe.mockImplementation((eventType: string, handlerFn: (...args: any[]) => any) => {
      subscribedHandlers.set(eventType, handlerFn);
    });

    handler = new ManufacturingEventHandler(
      mockEventBus as any,
      mockPrisma as any,
      mockMfgService as any,
    );
    handler.onModuleInit();
  });

  it('subscribes to the correct event types', () => {
    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(2);
    expect(subscribedHandlers.has('retail.custom_order.created')).toBe(true);
    expect(subscribedHandlers.has('inventory.stock.adjusted')).toBe(true);
  });

  it('creates a draft job order from a custom order with the reference marker in notes', async () => {
    await subscribedHandlers.get('retail.custom_order.created')!(customOrderEvent(fullPayload));

    expect(mockMfgService.createJobOrder).toHaveBeenCalledTimes(1);
    const [tenantId, userId, input] = mockMfgService.createJobOrder.mock.calls[0];
    expect(tenantId).toBe(TEST_TENANT_ID);
    expect(userId).toBe(TEST_USER_ID);
    expect(input).toMatchObject({
      productId: fullPayload.productId,
      locationId: fullPayload.locationId,
      customerId: 'cust-1',
      quantity: 1,
    });
    expect(input.notes).toContain('[custom-order-ref:order-1]');
    expect(input.notes).toContain('Target weight (mg): 15000');
    expect(input.notes).toContain('Metal purity: 916');
    expect(input.specialInstructions).toBe('Gold necklace, 22K');
  });

  it('looks up existing job orders by the custom order marker (idempotency check)', async () => {
    await subscribedHandlers.get('retail.custom_order.created')!(customOrderEvent(fullPayload));

    const where = (mockPrisma as any).jobOrder.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TEST_TENANT_ID, notes: { contains: '[custom-order-ref:order-1]' } });
  });

  it('does not create a second job order when one already references the custom order', async () => {
    (mockPrisma as any).jobOrder.findFirst.mockResolvedValue({ id: 'job-1', jobNumber: 'JO-000001' });

    await subscribedHandlers.get('retail.custom_order.created')!(customOrderEvent(fullPayload));

    expect(mockMfgService.createJobOrder).not.toHaveBeenCalled();
  });

  it('skips creation when productId or locationId is missing from the event', async () => {
    const { productId: _productId, ...withoutProduct } = fullPayload;
    await subscribedHandlers.get('retail.custom_order.created')!(customOrderEvent(withoutProduct));

    expect(mockMfgService.createJobOrder).not.toHaveBeenCalled();
  });

  it('handles malformed events without throwing', async () => {
    await expect(
      subscribedHandlers.get('retail.custom_order.created')!(customOrderEvent({})),
    ).resolves.toBeUndefined();
    expect(mockMfgService.createJobOrder).not.toHaveBeenCalled();
  });

  it('logs and swallows errors from job order creation', async () => {
    mockMfgService.createJobOrder.mockRejectedValue(new Error('db down'));

    await expect(
      subscribedHandlers.get('retail.custom_order.created')!(customOrderEvent(fullPayload)),
    ).resolves.toBeUndefined();
  });

  it('handles inventory.stock.adjusted by logging material availability check', async () => {
    const event = {
      type: 'inventory.stock.adjusted',
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      payload: {
        productId: 'prod-1',
        locationId: 'loc-1',
        quantityChange: 5,
        reason: 'receipt',
      },
    };

    await expect(
      subscribedHandlers.get('inventory.stock.adjusted')!(event),
    ).resolves.not.toThrow();
  });

  it('ignores unknown event types gracefully', () => {
    expect(subscribedHandlers.has('unknown.event')).toBe(false);
  });
});
