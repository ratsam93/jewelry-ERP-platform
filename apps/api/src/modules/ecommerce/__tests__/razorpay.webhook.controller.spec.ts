import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { RazorpayWebhookController } from '../razorpay.webhook.controller';

const ENV_SECRET = 'env-webhook-secret';
const TENANT_SECRET = 'tenant-webhook-secret';

// ─── Helpers ───────────────────────────────────────────────────

function sign(raw: string, secret: string = ENV_SECRET): string {
  return createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}

function createPrisma() {
  return {
    onlinePayment: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    onlineOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    invoice: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    sale: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

type MockPrisma = ReturnType<typeof createPrisma>;

function createIndiaPayment() {
  return {
    getRazorpayCredentials: vi.fn().mockResolvedValue({
      keyId: 'rzp_test_key',
      keySecret: 'rzp_test_secret',
      webhookSecret: null,
    }),
  };
}

function createEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

/** payment.* webhook body; `entity` overrides fields on the payment entity. */
function paymentBody(
  entity: Record<string, unknown> = {},
  event = 'payment.captured',
): Record<string, any> {
  return {
    event,
    payload: {
      payment: {
        entity: {
          id: 'pay_1',
          order_id: 'order_rzp_1',
          amount: 50000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
          notes: {},
          ...entity,
        },
      },
    },
  };
}

// ─── Suite ─────────────────────────────────────────────────────

describe('RazorpayWebhookController (Unit)', () => {
  let controller: RazorpayWebhookController;
  let prisma: MockPrisma;
  let indiaPayment: ReturnType<typeof createIndiaPayment>;
  let eventBus: ReturnType<typeof createEventBus>;
  let savedEnv: NodeJS.ProcessEnv;

  /**
   * Send a webhook through handle(). By default the body is signed with the
   * env secret over the raw JSON string and passed as rawBody.
   */
  async function send(
    body: unknown,
    opts: {
      secret?: string;
      signature?: string | null;
      rawBody?: Buffer | null;
      rawString?: string;
    } = {},
  ) {
    const raw = opts.rawString ?? JSON.stringify(body);
    const rawBody = opts.rawBody === undefined ? Buffer.from(raw, 'utf8') : opts.rawBody;
    const signature =
      opts.signature === undefined ? sign(raw, opts.secret ?? ENV_SECRET) : opts.signature;
    return controller.handle(
      { rawBody } as any,
      (signature ?? undefined) as any,
      body as any,
    );
  }

  /** Arrange a payment matched to an online order via OnlinePayment.externalPaymentId. */
  function matchOnlinePayment(status = 'PENDING') {
    prisma.onlinePayment.findFirst.mockResolvedValue({ orderId: 'ord-1', tenantId: 'tenant-1' });
    prisma.onlineOrder.findFirst.mockResolvedValue({ id: 'ord-1', status, tenantId: 'tenant-1' });
  }

  beforeEach(() => {
    savedEnv = { ...process.env };
    process.env.RAZORPAY_WEBHOOK_SECRET = ENV_SECRET;
    process.env.NODE_ENV = 'test';

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    prisma = createPrisma();
    indiaPayment = createIndiaPayment();
    eventBus = createEventBus();
    controller = new RazorpayWebhookController(prisma as any, indiaPayment as any, eventBus as any);
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
    vi.restoreAllMocks();
  });

  // ─── Signature verification ──────────────────────────────────

  describe('signature verification', () => {
    it('accepts a body signed with the webhook secret', async () => {
      const result = await send(paymentBody());

      expect(result).toEqual({ success: true });
    });

    it('rejects a signature computed with a different secret', async () => {
      await expect(send(paymentBody(), { secret: 'wrong-secret' })).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(send(paymentBody(), { secret: 'wrong-secret' })).rejects.toThrow(
        'Invalid signature',
      );
    });

    it('rejects a body that was tampered with after signing', async () => {
      const body = paymentBody();
      const raw = JSON.stringify(body);
      const signature = sign(raw);

      await expect(
        controller.handle({ rawBody: Buffer.from(raw + ' ', 'utf8') } as any, signature, body as any),
      ).rejects.toThrow('Invalid signature');
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('rejects when the signature header is missing', async () => {
      await expect(send(paymentBody(), { signature: null })).rejects.toThrow('Invalid signature');
    });

    it('rejects an empty signature header', async () => {
      await expect(send(paymentBody(), { signature: '' })).rejects.toThrow('Invalid signature');
    });

    it('rejects a non-hex signature header', async () => {
      await expect(send(paymentBody(), { signature: 'zz-not-hex' })).rejects.toThrow(
        'Invalid signature',
      );
    });

    it('rejects a truncated (wrong length) hex signature', async () => {
      const raw = JSON.stringify(paymentBody());
      await expect(
        send(paymentBody(), { signature: sign(raw).slice(0, 16) }),
      ).rejects.toThrow('Invalid signature');
    });

    it('verifies against the raw body bytes, not a re-serialised body', async () => {
      const body = paymentBody();
      const pretty = JSON.stringify(body, null, 2);

      const result = await send(body, { rawString: pretty });

      expect(result).toEqual({ success: true });
    });

    it('falls back to JSON.stringify(body) when rawBody is missing', async () => {
      const result = await send(paymentBody(), { rawBody: null });

      expect(result).toEqual({ success: true });
    });

    it('falls back to JSON.stringify(body) when rawBody is an empty buffer', async () => {
      const result = await send(paymentBody(), { rawBody: Buffer.alloc(0) });

      expect(result).toEqual({ success: true });
    });

    it('treats an undefined body as {} for the JSON fallback', async () => {
      const result = await controller.handle(
        { rawBody: undefined } as any,
        sign('{}') as any,
        undefined as any,
      );

      expect(result).toEqual({ success: true });
    });

    it('rejects a fallback-signed body when the signature was made over a different payload', async () => {
      await expect(
        send(paymentBody(), { rawBody: null, signature: sign('{"event":"other"}') }),
      ).rejects.toThrow('Invalid signature');
    });
  });

  // ─── Secret resolution ───────────────────────────────────────

  describe('webhook secret resolution', () => {
    it.each(['production', 'development'])(
      'rejects with "Webhook not configured" when no secret exists (NODE_ENV=%s)',
      async (nodeEnv) => {
        process.env.NODE_ENV = nodeEnv;
        delete process.env.RAZORPAY_WEBHOOK_SECRET;

        await expect(send(paymentBody())).rejects.toThrow(UnauthorizedException);
        await expect(send(paymentBody())).rejects.toThrow('Webhook not configured');
        expect(eventBus.publish).not.toHaveBeenCalled();
      },
    );

    it('treats an empty RAZORPAY_WEBHOOK_SECRET as not configured', async () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = '';

      await expect(send(paymentBody(), { secret: '' })).rejects.toThrow(
        'Webhook not configured',
      );
    });

    it('uses the env secret when no prisma or india payment service is injected', async () => {
      const bare = new RazorpayWebhookController(undefined, undefined, eventBus as any);
      const raw = JSON.stringify(paymentBody());

      const result = await bare.handle(
        { rawBody: Buffer.from(raw, 'utf8') } as any,
        sign(raw) as any,
        paymentBody() as any,
      );

      expect(result).toEqual({ success: true });
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('does not look up tenant credentials when no entity matches', async () => {
      await send(paymentBody());

      expect(indiaPayment.getRazorpayCredentials).not.toHaveBeenCalled();
    });

    it('prefers the matched tenant webhook secret over the env secret', async () => {
      matchOnlinePayment();
      indiaPayment.getRazorpayCredentials.mockResolvedValue({
        keyId: 'k',
        keySecret: 's',
        webhookSecret: TENANT_SECRET,
      });

      const ok = await send(paymentBody(), { secret: TENANT_SECRET });

      expect(ok).toEqual({ success: true });
      expect(indiaPayment.getRazorpayCredentials).toHaveBeenCalledWith('tenant-1');
    });

    it('rejects an env-signed body when the tenant secret is in force', async () => {
      matchOnlinePayment();
      indiaPayment.getRazorpayCredentials.mockResolvedValue({
        keyId: 'k',
        keySecret: 's',
        webhookSecret: TENANT_SECRET,
      });

      await expect(send(paymentBody(), { secret: ENV_SECRET })).rejects.toThrow(
        'Invalid signature',
      );
    });

    it('falls back to the env secret when tenant credentials have no webhook secret', async () => {
      matchOnlinePayment();
      indiaPayment.getRazorpayCredentials.mockResolvedValue({
        keyId: 'k',
        keySecret: 's',
        webhookSecret: null,
      });

      const result = await send(paymentBody());

      expect(result).toEqual({ success: true });
    });

    it('falls back to the env secret when tenant credential lookup throws', async () => {
      matchOnlinePayment();
      indiaPayment.getRazorpayCredentials.mockRejectedValue(new Error('settings unavailable'));

      const result = await send(paymentBody());

      expect(result).toEqual({ success: true });
    });

    it('falls back to the env secret when entity matching throws', async () => {
      prisma.onlinePayment.findFirst.mockRejectedValue(new Error('db down'));

      const result = await send(paymentBody({ notes: {} }), { signature: undefined });

      expect(result).toEqual({ success: true });
      expect(indiaPayment.getRazorpayCredentials).not.toHaveBeenCalled();
    });

    it('resolves the tenant secret from an order.paid body via the order entity id', async () => {
      prisma.onlinePayment.findFirst.mockResolvedValue({ orderId: 'ord-9', tenantId: 'tenant-9' });
      prisma.onlineOrder.findFirst.mockResolvedValue({ id: 'ord-9', status: 'CONFIRMED', tenantId: 'tenant-9' });
      const body = {
        event: 'order.paid',
        payload: { order: { entity: { id: 'order_only', amount: 50000, currency: 'INR', receipt: null } } },
      };

      const result = await send(body);

      expect(result).toEqual({ success: true });
      expect(prisma.onlinePayment.findFirst).toHaveBeenCalledWith({
        where: { externalPaymentId: 'order_only' },
      });
      expect(indiaPayment.getRazorpayCredentials).toHaveBeenCalledWith('tenant-9');
    });
  });

  // ─── Routing and unknown events ──────────────────────────────

  describe('event routing', () => {
    it.each(['payment.authorized', 'order.paid'])(
      'acknowledges %s without publishing or updating anything',
      async (event) => {
        const body = paymentBody({}, event);

        const result = await send(body);

        expect(result).toEqual({ success: true });
        expect(eventBus.publish).not.toHaveBeenCalled();
        expect(prisma.onlineOrder.update).not.toHaveBeenCalled();
        expect(prisma.invoice.update).not.toHaveBeenCalled();
        expect(prisma.sale.update).not.toHaveBeenCalled();
      },
    );

    it('ignores unknown event types and still returns success', async () => {
      const result = await send({ event: 'refund.processed', payload: {} });

      expect(result).toEqual({ success: true });
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('skips payment.captured when the payload has no payment entity', async () => {
      const result = await send({ event: 'payment.captured', payload: {} });

      expect(result).toEqual({ success: true });
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
    });

    it('skips payment.failed when the payload has no payment entity', async () => {
      const result = await send({ event: 'payment.failed', payload: {} });

      expect(result).toEqual({ success: true });
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  // ─── payment.captured ────────────────────────────────────────

  describe('payment.captured', () => {
    it('marks an online order CONFIRMED, updates the OnlinePayment and publishes the event', async () => {
      matchOnlinePayment('PENDING');

      await send(paymentBody());

      expect(prisma.onlineOrder.update).toHaveBeenCalledWith({
        where: { id: 'ord-1' },
        data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
      });
      expect(prisma.onlinePayment.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', externalPaymentId: 'order_rzp_1' },
        data: expect.objectContaining({
          externalPaymentId: 'pay_1',
          status: 'CAPTURED',
          completedAt: expect.any(Date),
          gatewayResponse: {
            razorpay_order_id: 'order_rzp_1',
            razorpay_payment_id: 'pay_1',
            method: 'upi',
            status: 'captured',
          },
        }),
      });

      expect(eventBus.publish).toHaveBeenCalledOnce();
      const evt = eventBus.publish.mock.calls[0][0];
      expect(evt).toMatchObject({
        tenantId: 'tenant-1',
        userId: 'system',
        type: 'ecommerce.payment.captured',
        payload: {
          gateway: 'razorpay',
          orderId: 'ord-1',
          paymentId: 'pay_1',
          externalOrderId: 'order_rzp_1',
          externalPaymentId: 'pay_1',
          amountPaise: 50000,
          currency: 'INR',
          receipt: null,
        },
      });
      expect(typeof evt.id).toBe('string');
      expect(new Date(evt.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('does not re-confirm an order that is already past PENDING (idempotent)', async () => {
      matchOnlinePayment('CONFIRMED');

      await send(paymentBody());

      expect(prisma.onlineOrder.update).not.toHaveBeenCalled();
      expect(prisma.onlinePayment.updateMany).toHaveBeenCalledOnce();
      expect(eventBus.publish).toHaveBeenCalledOnce();
    });

    it('does not update the order when it can no longer be loaded in markEntityPaid', async () => {
      prisma.onlinePayment.findFirst.mockResolvedValue({ orderId: 'ord-1', tenantId: 'tenant-1' });
      prisma.onlineOrder.findFirst.mockResolvedValue(null);

      await send(paymentBody());

      expect(prisma.onlineOrder.update).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledOnce();
    });

    it('marks an invoice PAID with paidPaise taken from the payment amount', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', tenantId: 'tenant-2' });

      await send(paymentBody({ notes: { receipt: 'INV-2024-001' } }));

      expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ invoiceNumber: 'INV-2024-001' }, { invoiceNumber: '2024-001' }] },
      });
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'PAID', paidPaise: BigInt(50000) },
      });
      expect(prisma.onlineOrder.update).not.toHaveBeenCalled();
      expect(prisma.sale.update).not.toHaveBeenCalled();

      const evt = eventBus.publish.mock.calls[0][0];
      expect(evt.tenantId).toBe('tenant-2');
      expect(evt.payload).toMatchObject({ orderId: null, receipt: 'INV-2024-001' });
    });

    it('marks a sale COMPLETED', async () => {
      prisma.sale.findFirst.mockResolvedValue({ id: 'sale-1', tenantId: 'tenant-3' });

      await send(paymentBody({ notes: { receipt: 'SAL-0007' } }));

      expect(prisma.sale.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ saleNumber: 'SAL-0007' }, { saleNumber: '0007' }] },
      });
      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: { status: 'COMPLETED' },
      });
      expect(eventBus.publish.mock.calls[0][0].tenantId).toBe('tenant-3');
    });

    it('matches an online order by receipt when there is no razorpay order id', async () => {
      prisma.onlineOrder.findFirst.mockResolvedValue({ id: 'ord-100', tenantId: 'tenant-1', status: 'PENDING' });

      await send(paymentBody({ order_id: undefined, notes: { receipt: 'OO-100' } }));

      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
      expect(prisma.onlineOrder.update).toHaveBeenCalledWith({
        where: { id: 'ord-100' },
        data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
      });
      const evt = eventBus.publish.mock.calls[0][0];
      expect(evt.payload).toMatchObject({ orderId: 'ord-100', externalOrderId: null, receipt: 'OO-100' });
    });

    it('matches a CF- prefixed receipt against online orders', async () => {
      prisma.onlineOrder.findFirst.mockResolvedValue({ id: 'ord-77', tenantId: 'tenant-1', status: 'CONFIRMED' });

      await send(paymentBody({ order_id: undefined, notes: { receipt: 'CF-77' } }));

      expect(prisma.onlineOrder.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ orderNumber: 'CF-77' }, { orderNumber: '77' }] },
      });
      expect(eventBus.publish.mock.calls[0][0].payload.orderId).toBe('ord-77');
    });

    it('matches an unprefixed receipt by bare order number', async () => {
      prisma.onlineOrder.findFirst.mockResolvedValue({ id: 'ord-200', tenantId: 'tenant-1', status: 'CONFIRMED' });

      await send(paymentBody({ order_id: undefined, notes: { receipt: 'ABC123' } }));

      expect(prisma.onlineOrder.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ orderNumber: 'ABC123' }, { orderNumber: 'ABC123' }] },
      });
      expect(eventBus.publish.mock.calls[0][0].payload.orderId).toBe('ord-200');
    });

    it('falls through to natural-key lookups for a receipt whose prefix matches nothing', async () => {
      // "ORD-" is not a known prefix, so it goes straight to the exact-key
      // lookups in order -> invoice -> sale.
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-42', tenantId: 'tenant-4' });

      await send(paymentBody({ order_id: undefined, notes: { receipt: 'ORD-42' } }));

      expect(prisma.onlineOrder.findFirst).toHaveBeenCalledWith({ where: { orderNumber: 'ORD-42' } });
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith({ where: { invoiceNumber: 'ORD-42' } });
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-42' },
        data: { status: 'PAID', paidPaise: BigInt(50000) },
      });
    });

    it('falls back from an unmatched INV- prefix to a sale with the same natural key', async () => {
      prisma.sale.findFirst.mockImplementation(async ({ where }: any) =>
        where.saleNumber === 'INV-9' ? { id: 'sale-9', tenantId: 'tenant-5' } : null,
      );

      await send(paymentBody({ order_id: undefined, notes: { receipt: 'INV-9' } }));

      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-9' },
        data: { status: 'COMPLETED' },
      });
    });

    it('logs a warning and publishes nothing when no entity matches', async () => {
      const result = await send(paymentBody({ notes: { receipt: 'UNKNOWN-1' } }));

      expect(result).toEqual({ success: true });
      expect(prisma.onlineOrder.update).not.toHaveBeenCalled();
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(prisma.sale.update).not.toHaveBeenCalled();
      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('no matching entity for payment=pay_1'),
      );
    });

    it('logs a warning and does nothing without prisma', async () => {
      const bare = new RazorpayWebhookController(undefined, undefined, eventBus as any);
      const body = paymentBody();
      const raw = JSON.stringify(body);

      const result = await bare.handle(
        { rawBody: Buffer.from(raw, 'utf8') } as any,
        sign(raw) as any,
        body as any,
      );

      expect(result).toEqual({ success: true });
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('skips the OnlinePayment update when the payment has no order id', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-5', tenantId: 'tenant-1' });

      await send(paymentBody({ order_id: undefined, notes: { receipt: 'INV-5' } }));

      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
      expect(prisma.invoice.update).toHaveBeenCalledOnce();
      expect(eventBus.publish.mock.calls[0][0].payload.externalOrderId).toBeNull();
    });

    it('still marks the entity paid when the event bus is absent', async () => {
      matchOnlinePayment('PENDING');
      const noBus = new RazorpayWebhookController(prisma as any, indiaPayment as any, undefined);
      const body = paymentBody();
      const raw = JSON.stringify(body);

      const result = await noBus.handle(
        { rawBody: Buffer.from(raw, 'utf8') } as any,
        sign(raw) as any,
        body as any,
      );

      expect(result).toEqual({ success: true });
      expect(prisma.onlineOrder.update).toHaveBeenCalledOnce();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('returns success and logs when publishing the event fails', async () => {
      matchOnlinePayment('PENDING');
      eventBus.publish.mockRejectedValue(new Error('bus down'));

      const result = await send(paymentBody());

      expect(result).toEqual({ success: true });
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('handler error (event=payment.captured): bus down'),
        expect.any(String),
      );
    });

    it('returns success and logs when a database write fails', async () => {
      matchOnlinePayment('PENDING');
      prisma.onlineOrder.update.mockRejectedValue(new Error('write failed'));

      const result = await send(paymentBody());

      expect(result).toEqual({ success: true });
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  // ─── payment.failed ──────────────────────────────────────────

  describe('payment.failed', () => {
    const failedEntity = {
      error_code: 'BAD_REQUEST_ERROR',
      error_description: 'Payment failed due to bank decline',
      error_reason: 'bank_declined',
      status: 'failed',
    };

    it('records a FAILED OnlinePayment with error metadata and publishes the failure', async () => {
      matchOnlinePayment();

      const result = await send(paymentBody(failedEntity, 'payment.failed'));

      expect(result).toEqual({ success: true });
      expect(prisma.onlinePayment.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', externalPaymentId: 'order_rzp_1' },
        data: {
          externalPaymentId: 'pay_1',
          status: 'FAILED',
          gatewayResponse: expect.objectContaining({
            razorpay_order_id: 'order_rzp_1',
            razorpay_payment_id: 'pay_1',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment failed due to bank decline',
            error_reason: 'bank_declined',
            last_webhook_event: 'payment.failed',
            last_webhook_at: expect.any(String),
          }),
        },
      });
      expect(prisma.onlineOrder.update).not.toHaveBeenCalled();

      expect(eventBus.publish).toHaveBeenCalledOnce();
      const evt = eventBus.publish.mock.calls[0][0];
      expect(evt).toMatchObject({
        tenantId: 'tenant-1',
        userId: 'system',
        type: 'ecommerce.payment.failed',
        payload: {
          gateway: 'razorpay',
          orderId: 'ord-1',
          paymentId: 'pay_1',
          externalOrderId: 'order_rzp_1',
          externalPaymentId: 'pay_1',
          reason: 'Payment failed due to bank decline',
        },
      });
    });

    it('skips the OnlinePayment write when the failed payment has no order id', async () => {
      prisma.onlineOrder.findFirst.mockResolvedValue({ id: 'ord-8', tenantId: 'tenant-1', status: 'PENDING' });

      await send(paymentBody({ ...failedEntity, order_id: undefined, notes: { receipt: 'OO-8' } }, 'payment.failed'));

      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
      expect(eventBus.publish.mock.calls[0][0].payload.orderId).toBe('ord-8');
    });

    it('does not write OnlinePayment for an invoice match but still publishes with the invoice tenant', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-3', tenantId: 'tenant-6' });

      await send(paymentBody({ ...failedEntity, notes: { receipt: 'INV-3' } }, 'payment.failed'));

      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      const evt = eventBus.publish.mock.calls[0][0];
      expect(evt.tenantId).toBe('tenant-6');
      expect(evt.payload.orderId).toBeNull();
    });

    it('uses the notes tenantId when no entity matches', async () => {
      await send(paymentBody({ ...failedEntity, notes: { tenantId: 'tenant-notes' } }, 'payment.failed'));

      expect(eventBus.publish.mock.calls[0][0].tenantId).toBe('tenant-notes');
    });

    it('uses "unknown" as tenant when nothing matches and notes carry no tenant', async () => {
      await send(paymentBody(failedEntity, 'payment.failed'));

      expect(eventBus.publish.mock.calls[0][0].tenantId).toBe('unknown');
    });

    it('uses error_reason as the failure reason when error_description is absent', async () => {
      await send(
        paymentBody({ error_description: null, error_reason: 'bank_declined' }, 'payment.failed'),
      );

      expect(eventBus.publish.mock.calls[0][0].payload.reason).toBe('bank_declined');
    });

    it('uses error_code as the failure reason when only the code is present', async () => {
      await send(
        paymentBody({ error_description: null, error_reason: null, error_code: 'E_CODE' }, 'payment.failed'),
      );

      expect(eventBus.publish.mock.calls[0][0].payload.reason).toBe('E_CODE');
    });

    it('defaults the failure reason to "payment_failed" when no error fields are present', async () => {
      await send(paymentBody({}, 'payment.failed'));

      expect(eventBus.publish.mock.calls[0][0].payload.reason).toBe('payment_failed');
    });

    it('publishes the failure without prisma or india payment service', async () => {
      const bare = new RazorpayWebhookController(undefined, undefined, eventBus as any);
      const body = paymentBody({ ...failedEntity, notes: { tenantId: 'tenant-bare' } }, 'payment.failed');
      const raw = JSON.stringify(body);

      const result = await bare.handle(
        { rawBody: Buffer.from(raw, 'utf8') } as any,
        sign(raw) as any,
        body as any,
      );

      expect(result).toEqual({ success: true });
      expect(eventBus.publish.mock.calls[0][0].tenantId).toBe('tenant-bare');
      expect(prisma.onlinePayment.updateMany).not.toHaveBeenCalled();
    });

    it('does not publish when the event bus is absent', async () => {
      matchOnlinePayment();
      const noBus = new RazorpayWebhookController(prisma as any, indiaPayment as any, undefined);
      const body = paymentBody(failedEntity, 'payment.failed');
      const raw = JSON.stringify(body);

      const result = await noBus.handle(
        { rawBody: Buffer.from(raw, 'utf8') } as any,
        sign(raw) as any,
        body as any,
      );

      expect(result).toEqual({ success: true });
      expect(prisma.onlinePayment.updateMany).toHaveBeenCalledOnce();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('returns success and logs when the failure handler throws', async () => {
      matchOnlinePayment();
      prisma.onlinePayment.updateMany.mockRejectedValue(new Error('constraint'));

      const result = await send(paymentBody(failedEntity, 'payment.failed'));

      expect(result).toEqual({ success: true });
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.stringContaining('handler error (event=payment.failed): constraint'),
        expect.any(String),
      );
    });
  });
});
