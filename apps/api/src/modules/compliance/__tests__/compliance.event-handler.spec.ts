import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComplianceEventHandler } from '../compliance.event-handler';
import { HuidSaleBlockedError } from '../compliance.huid.service';
import { createMockPrismaService, createMockEventBus, TEST_TENANT_ID, TEST_USER_ID } from '../../../__tests__/setup';

describe('ComplianceEventHandler', () => {
  let handler: ComplianceEventHandler;
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;
  let mockHuidService: {
    checkSaleEligibility: ReturnType<typeof vi.fn>;
  };
  let subscribedHandlers: Map<string, (...args: any[]) => any>;

  const eligible = (productId: string) => ({ productId, eligible: true, reason: 'HUID_PRESENT', huidNumber: 'AB1234' });
  const missing = (productId: string) => ({ productId, eligible: false, reason: 'HUID_MISSING', huidNumber: null });

  const saleEvent = (productIds: string[]) => ({
    type: 'retail.sale.completed',
    tenantId: TEST_TENANT_ID,
    userId: TEST_USER_ID,
    payload: {
      saleId: 'sale-1',
      items: productIds.map((productId) => ({ productId, pricePaise: 500000 })),
    },
  });

  beforeEach(() => {
    vi.stubEnv('HUID_ENFORCEMENT', '');
    mockEventBus = createMockEventBus();
    mockPrisma = createMockPrismaService();
    mockHuidService = {
      checkSaleEligibility: vi.fn().mockImplementation(async (_t: string, productId: string) => eligible(productId)),
    };

    subscribedHandlers = new Map();
    mockEventBus.subscribe.mockImplementation((eventType: string, handlerFn: (...args: any[]) => any) => {
      subscribedHandlers.set(eventType, handlerFn);
    });

    handler = new ComplianceEventHandler(
      mockEventBus as any,
      mockPrisma as any,
      mockHuidService as any,
    );
    handler.onModuleInit();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('subscribes to the correct event types', () => {
    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(2);
    expect(subscribedHandlers.has('retail.sale.completed')).toBe(true);
    expect(subscribedHandlers.has('inventory.item.created')).toBe(true);
  });

  it('checks HUID eligibility for each sold item', async () => {
    await subscribedHandlers.get('retail.sale.completed')!(saleEvent(['prod-1']));

    expect(mockHuidService.checkSaleEligibility).toHaveBeenCalledWith(TEST_TENANT_ID, 'prod-1');
  });

  describe('HUID_ENFORCEMENT=warn (default)', () => {
    it('warns but does not throw when gold product is sold without HUID', async () => {
      mockHuidService.checkSaleEligibility.mockResolvedValue(missing('prod-gold-1'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        subscribedHandlers.get('retail.sale.completed')!(saleEvent(['prod-gold-1'])),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sold without HUID'));
    });

    it('treats an unset env as warn mode', async () => {
      vi.stubEnv('HUID_ENFORCEMENT', 'bogus');
      mockHuidService.checkSaleEligibility.mockResolvedValue(missing('prod-gold-1'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        subscribedHandlers.get('retail.sale.completed')!(saleEvent(['prod-gold-1'])),
      ).resolves.toBeUndefined();
    });
  });

  describe('HUID_ENFORCEMENT=block', () => {
    beforeEach(() => {
      vi.stubEnv('HUID_ENFORCEMENT', 'block');
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('throws HuidSaleBlockedError listing items without HUID', async () => {
      mockHuidService.checkSaleEligibility.mockImplementation(async (_t: string, productId: string) =>
        productId === 'prod-gold-2' ? missing(productId) : eligible(productId),
      );

      const run = subscribedHandlers.get('retail.sale.completed')!(
        saleEvent(['prod-gold-1', 'prod-gold-2']),
      );

      await expect(run).rejects.toBeInstanceOf(HuidSaleBlockedError);
      await expect(run).rejects.toMatchObject({
        code: 'HUID_SALE_BLOCKED',
        blockedItems: [expect.objectContaining({ productId: 'prod-gold-2', reason: 'HUID_MISSING' })],
      });
    });

    it('does not throw when every item has a HUID', async () => {
      await expect(
        subscribedHandlers.get('retail.sale.completed')!(saleEvent(['prod-gold-1'])),
      ).resolves.toBeUndefined();
    });

    it('still checks every item before throwing', async () => {
      mockHuidService.checkSaleEligibility.mockImplementation(async (_t: string, productId: string) => missing(productId));

      await expect(
        subscribedHandlers.get('retail.sale.completed')!(saleEvent(['a', 'b'])),
      ).rejects.toBeInstanceOf(HuidSaleBlockedError);
      expect(mockHuidService.checkSaleEligibility).toHaveBeenCalledTimes(2);
    });
  });

  it('handles inventory.item.created by suggesting HUID for gold products', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      id: 'prod-gold-1',
      tenantId: TEST_TENANT_ID,
      sku: 'GR-22K-001',
      productType: 'GOLD',
      huidNumber: null,
    });
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const event = {
      type: 'inventory.item.created',
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      payload: {
        productId: 'prod-gold-1',
        locationId: 'loc-1',
        quantity: 1,
      },
    };

    await subscribedHandlers.get('inventory.item.created')!(event);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not have HUID'),
    );
  });

  it('does not suggest HUID for non-gold products', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      id: 'prod-silver-1',
      tenantId: TEST_TENANT_ID,
      sku: 'SR-925-001',
      productType: 'SILVER',
      huidNumber: null,
    });
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const event = {
      type: 'inventory.item.created',
      tenantId: TEST_TENANT_ID,
      userId: TEST_USER_ID,
      payload: {
        productId: 'prod-silver-1',
        locationId: 'loc-1',
        quantity: 1,
      },
    };

    await subscribedHandlers.get('inventory.item.created')!(event);

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('handles lookup errors without crashing', async () => {
    mockHuidService.checkSaleEligibility.mockRejectedValue(new Error('HUID service error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      subscribedHandlers.get('retail.sale.completed')!(saleEvent(['prod-1'])),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
