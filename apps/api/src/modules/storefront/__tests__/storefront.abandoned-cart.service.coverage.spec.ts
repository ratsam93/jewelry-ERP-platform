import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaService, createMockEventBusService, mockTenantContext, resetMocks } from '../../../__tests__/mocks';
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
import { StorefrontAbandonedCartService } from '../storefront.abandoned-cart.service';

describe('StorefrontAbandonedCartService (coverage)', () => {
  let service: StorefrontAbandonedCartService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let eventBus: ReturnType<typeof createMockEventBusService>;
  let pricing: { calculateLiveProductPrice: ReturnType<typeof vi.fn> };
  const { tenantId } = mockTenantContext;

  const db = () => prisma as any;

  beforeEach(() => {
    prisma = createMockPrismaService();
    resetMocks(prisma);
    // Models not present in the shared mock
    db().cart = { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
    db().abandonedCart = {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    prisma.product.findMany = vi.fn().mockResolvedValue([]) as any;
    prisma.product.findFirst = vi.fn() as any;
    prisma.customer.findFirst = vi.fn().mockResolvedValue(null) as any;
    eventBus = createMockEventBusService();
    pricing = { calculateLiveProductPrice: vi.fn().mockResolvedValue({ totalPricePaise: 100000 }) };
    service = new StorefrontAbandonedCartService(
      prisma as never,
      eventBus as never,
      pricing as never,
    );
  });

  const product = (overrides: Record<string, unknown> = {}) => ({
    id: 'p-1',
    tenantId,
    name: 'Gold Ring',
    productType: 'GOLD',
    metalPurity: 916,
    metalWeightMg: 5000n,
    makingCharges: 1000n,
    wastagePercent: 8,
    sellingPricePaise: 0n,
    ...overrides,
  });

  const cart = (overrides: Record<string, unknown> = {}) => ({
    id: 'cart-1',
    sessionId: 'sess-1',
    customerId: null,
    tenantId,
    items: [{ productId: 'p-1', quantity: 2 }],
    ...overrides,
  });

  describe('detectAbandoned', () => {
    it('returns 0 when there are no candidate carts', async () => {
      db().cart.findMany.mockResolvedValue([]);
      const count = await service.detectAbandoned(tenantId);
      expect(count).toBe(0);
      expect(db().abandonedCart.create).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('queries carts scoped to tenant with an idle cutoff and unexpired carts', async () => {
      db().cart.findMany.mockResolvedValue([]);
      await service.detectAbandoned(tenantId);
      const args = db().cart.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe(tenantId);
      expect(args.where.updatedAt.lt).toBeInstanceOf(Date);
      expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(args.where.items).toEqual({ some: {} });
      expect(args.include).toEqual({ items: true });
      // cutoff is roughly one hour in the past
      const diff = Date.now() - args.where.updatedAt.lt.getTime();
      expect(diff).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
      expect(diff).toBeLessThan(60 * 60 * 1000 + 5000);
    });

    it('skips candidate carts that have no items', async () => {
      db().cart.findMany.mockResolvedValue([cart({ items: [] })]);
      const count = await service.detectAbandoned(tenantId);
      expect(count).toBe(0);
      expect(db().abandonedCart.findFirst).not.toHaveBeenCalled();
    });

    it('skips carts that are already tracked as abandoned', async () => {
      db().cart.findMany.mockResolvedValue([cart()]);
      db().abandonedCart.findFirst.mockResolvedValue({ id: 'existing' });
      const count = await service.detectAbandoned(tenantId);
      expect(count).toBe(0);
      expect(db().abandonedCart.findFirst).toHaveBeenCalledWith({
        where: { tenantId, cartSessionId: 'sess-1' },
      });
      expect(db().abandonedCart.create).not.toHaveBeenCalled();
    });

    it('creates an abandoned record and publishes an event for a guest cart', async () => {
      db().cart.findMany.mockResolvedValue([cart()]);
      db().abandonedCart.findFirst.mockResolvedValue(null);
      prisma.product.findMany.mockResolvedValue([product()] as any);

      const count = await service.detectAbandoned(tenantId);

      expect(count).toBe(1);
      expect(pricing.calculateLiveProductPrice).toHaveBeenCalledWith(tenantId, {
        productType: 'GOLD',
        metalPurity: 916,
        metalWeightMg: 5000n,
        makingCharges: 1000n,
        wastagePercent: 8,
        sellingPricePaise: 0n,
      });
      // 100000 per unit * quantity 2
      expect(db().abandonedCart.create).toHaveBeenCalledWith({
        data: {
          id: 'mock-uuid',
          tenantId,
          cartSessionId: 'sess-1',
          customerId: null,
          customerEmail: null,
          customerPhone: null,
          items: [{ productId: 'p-1', productName: 'Gold Ring', quantity: 2 }],
          totalPaise: 200000n,
          itemCount: 1,
          status: 'DETECTED',
        },
      });
      expect(db().customer.findFirst).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'storefront.cart.abandoned',
          tenantId,
          userId: 'system',
          payload: {
            cartId: 'cart-1',
            customerId: null,
            email: null,
            totalPaise: 200000,
            itemCount: 1,
          },
        }),
      );
    });

    it('loads customer contact details for a logged-in cart and uses the customer as user', async () => {
      db().cart.findMany.mockResolvedValue([cart({ customerId: 'cust-1' })]);
      db().abandonedCart.findFirst.mockResolvedValue(null);
      prisma.product.findMany.mockResolvedValue([product()] as any);
      prisma.customer.findFirst.mockResolvedValue({ email: 'a@x.com', phone: '+911' } as any);

      await service.detectAbandoned(tenantId);

      expect(prisma.customer.findFirst).toHaveBeenCalledWith({
        where: { id: 'cust-1', tenantId },
        select: { email: true, phone: true },
      });
      expect(db().abandonedCart.create.mock.calls[0][0].data).toMatchObject({
        customerId: 'cust-1',
        customerEmail: 'a@x.com',
        customerPhone: '+911',
      });
      expect(eventBus.publish.mock.calls[0][0]).toMatchObject({
        userId: 'cust-1',
        payload: { customerId: 'cust-1', email: 'a@x.com' },
      });
    });

    it('stores null contact details when the customer record is missing', async () => {
      db().cart.findMany.mockResolvedValue([cart({ customerId: 'gone' })]);
      db().abandonedCart.findFirst.mockResolvedValue(null);
      prisma.product.findMany.mockResolvedValue([product()] as any);
      prisma.customer.findFirst.mockResolvedValue(null);

      await service.detectAbandoned(tenantId);

      expect(db().abandonedCart.create.mock.calls[0][0].data).toMatchObject({
        customerEmail: null,
        customerPhone: null,
        customerId: 'gone',
      });
    });

    it('falls back to Unknown product name and zero total for products that no longer exist', async () => {
      db().cart.findMany.mockResolvedValue([
        cart({ items: [{ productId: 'missing', quantity: 3 }, { productId: 'p-1', quantity: 1 }] }),
      ]);
      db().abandonedCart.findFirst.mockResolvedValue(null);
      prisma.product.findMany.mockResolvedValue([product()] as any);

      await service.detectAbandoned(tenantId);

      expect(pricing.calculateLiveProductPrice).toHaveBeenCalledTimes(1);
      const data = db().abandonedCart.create.mock.calls[0][0].data;
      expect(data.items).toEqual([
        { productId: 'missing', productName: 'Unknown', quantity: 3 },
        { productId: 'p-1', productName: 'Gold Ring', quantity: 1 },
      ]);
      expect(data.totalPaise).toBe(100000n);
      expect(data.itemCount).toBe(2);
    });

    it('counts multiple abandoned carts and skips tracked ones in the same run', async () => {
      db().cart.findMany.mockResolvedValue([
        cart({ id: 'c-a', sessionId: 's-a' }),
        cart({ id: 'c-b', sessionId: 's-b' }),
        cart({ id: 'c-c', sessionId: 's-c', items: [] }),
      ]);
      db().abandonedCart.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'already' });
      prisma.product.findMany.mockResolvedValue([product()] as any);

      const count = await service.detectAbandoned(tenantId);

      expect(count).toBe(1);
      expect(db().abandonedCart.create).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish.mock.calls[0][0].payload.cartId).toBe('c-a');
    });
  });

  describe('sendRecoveryEmail', () => {
    it('does nothing when no abandoned cart matches', async () => {
      db().abandonedCart.findFirst.mockResolvedValue(null);
      await service.sendRecoveryEmail(tenantId, 'sess-x');
      expect(db().abandonedCart.update).not.toHaveBeenCalled();
      expect(db().abandonedCart.findFirst).toHaveBeenCalledWith({
        where: { tenantId, cartSessionId: 'sess-x', status: { in: ['DETECTED', 'REMINDER_1_SENT'] } },
      });
    });

    it('does nothing when there is neither an email nor a customer id', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerEmail: null,
        customerId: null,
      });
      await service.sendRecoveryEmail(tenantId, 'sess-1');
      expect(db().abandonedCart.update).not.toHaveBeenCalled();
    });

    it('sends first reminder when no reminders were sent yet', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerEmail: 'a@x.com',
        customerId: null,
        firstReminderSentAt: null,
        secondReminderSentAt: null,
      });
      await service.sendRecoveryEmail(tenantId, 'sess-1');
      const call = db().abandonedCart.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'ab-1' });
      expect(call.data.status).toBe('REMINDER_1_SENT');
      expect(call.data.firstReminderSentAt).toBeInstanceOf(Date);
      expect(call.data.secondReminderSentAt).toBeUndefined();
    });

    it('sends second reminder when the first was already sent', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerEmail: 'a@x.com',
        customerId: null,
        firstReminderSentAt: new Date(),
        secondReminderSentAt: null,
      });
      await service.sendRecoveryEmail(tenantId, 'sess-1');
      const data = db().abandonedCart.update.mock.calls[0][0].data;
      expect(data.status).toBe('REMINDER_2_SENT');
      expect(data.secondReminderSentAt).toBeInstanceOf(Date);
    });

    it('sends third reminder when the first two were already sent', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerEmail: null,
        customerId: 'cust-1',
        firstReminderSentAt: new Date(),
        secondReminderSentAt: new Date(),
      });
      await service.sendRecoveryEmail(tenantId, 'sess-1');
      const data = db().abandonedCart.update.mock.calls[0][0].data;
      expect(data.status).toBe('REMINDER_3_SENT');
      expect(data.thirdReminderSentAt).toBeInstanceOf(Date);
    });

    it('proceeds for a customer id without an email address', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-2',
        customerEmail: null,
        customerId: 'cust-9',
        firstReminderSentAt: null,
      });
      await service.sendRecoveryEmail(tenantId, 'sess-2');
      expect(db().abandonedCart.update).toHaveBeenCalledTimes(1);
      expect(db().abandonedCart.update.mock.calls[0][0].data.status).toBe('REMINDER_1_SENT');
    });
  });

  describe('sendRecoveryWhatsapp', () => {
    it('does nothing when no abandoned cart matches', async () => {
      db().abandonedCart.findFirst.mockResolvedValue(null);
      await service.sendRecoveryWhatsapp(tenantId, 'sess-x');
      expect(db().abandonedCart.update).not.toHaveBeenCalled();
      expect(db().abandonedCart.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          cartSessionId: 'sess-x',
          status: { in: ['DETECTED', 'REMINDER_1_SENT', 'REMINDER_2_SENT'] },
        },
      });
    });

    it('does nothing when the abandoned cart has no phone number', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({ id: 'ab-1', customerPhone: null });
      await service.sendRecoveryWhatsapp(tenantId, 'sess-1');
      expect(db().abandonedCart.update).not.toHaveBeenCalled();
    });

    it('sends first WhatsApp reminder when none sent yet', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerPhone: '+919999999999',
        firstReminderSentAt: null,
        secondReminderSentAt: null,
      });
      await service.sendRecoveryWhatsapp(tenantId, 'sess-1');
      const data = db().abandonedCart.update.mock.calls[0][0].data;
      expect(data.status).toBe('REMINDER_1_SENT');
      expect(data.firstReminderSentAt).toBeInstanceOf(Date);
    });

    it('sends second WhatsApp reminder when first already sent', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerPhone: '+919999999999',
        firstReminderSentAt: new Date(),
        secondReminderSentAt: null,
      });
      await service.sendRecoveryWhatsapp(tenantId, 'sess-1');
      expect(db().abandonedCart.update.mock.calls[0][0].data.status).toBe('REMINDER_2_SENT');
    });

    it('sends third WhatsApp reminder when first two already sent', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({
        id: 'ab-1',
        customerPhone: '+919999999999',
        firstReminderSentAt: new Date(),
        secondReminderSentAt: new Date(),
      });
      await service.sendRecoveryWhatsapp(tenantId, 'sess-1');
      const data = db().abandonedCart.update.mock.calls[0][0].data;
      expect(data.status).toBe('REMINDER_3_SENT');
      expect(data.thirdReminderSentAt).toBeInstanceOf(Date);
    });
  });

  describe('markRecovered', () => {
    it('does nothing when no abandoned cart exists for the session', async () => {
      db().abandonedCart.findFirst.mockResolvedValue(null);
      await service.markRecovered(tenantId, 'sess-x', 'order-1');
      expect(db().abandonedCart.update).not.toHaveBeenCalled();
    });

    it('marks the cart RECOVERED with the given order id', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({ id: 'ab-1' });
      await service.markRecovered(tenantId, 'sess-1', 'order-1');
      expect(db().abandonedCart.findFirst).toHaveBeenCalledWith({
        where: { tenantId, cartSessionId: 'sess-1' },
      });
      expect(db().abandonedCart.update).toHaveBeenCalledWith({
        where: { id: 'ab-1' },
        data: {
          status: 'RECOVERED',
          recoveredAt: expect.any(Date),
          recoveredOrderId: 'order-1',
        },
      });
    });

    it('stores a null recovered order id when none is supplied', async () => {
      db().abandonedCart.findFirst.mockResolvedValue({ id: 'ab-1' });
      await service.markRecovered(tenantId, 'sess-1');
      expect(db().abandonedCart.update.mock.calls[0][0].data.recoveredOrderId).toBeNull();
    });
  });

  describe('expireOldCarts', () => {
    it('expires unrecovered carts older than 30 days and returns the count', async () => {
      db().abandonedCart.updateMany.mockResolvedValue({ count: 4 });
      const result = await service.expireOldCarts(tenantId);
      expect(result).toBe(4);
      const args = db().abandonedCart.updateMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe(tenantId);
      expect(args.where.status).toEqual({
        in: ['DETECTED', 'REMINDER_1_SENT', 'REMINDER_2_SENT', 'REMINDER_3_SENT'],
      });
      expect(args.where.abandonedAt.lt).toBeInstanceOf(Date);
      const ageDays = (Date.now() - args.where.abandonedAt.lt.getTime()) / (24 * 60 * 60 * 1000);
      expect(ageDays).toBeGreaterThanOrEqual(29.99);
      expect(ageDays).toBeLessThan(30.01);
      expect(args.data).toEqual({ status: 'EXPIRED' });
    });

    it('returns 0 when nothing is expired', async () => {
      db().abandonedCart.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.expireOldCarts(tenantId)).toBe(0);
    });
  });
});
