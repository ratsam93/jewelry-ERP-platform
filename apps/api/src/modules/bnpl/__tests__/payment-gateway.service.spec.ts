import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { createMockPrismaService } from '../../../__tests__/mocks';
import {
  PaymentGatewayService,
  PaymentMethodNotFoundError,
  PaymentMethodExpiredError,
  PaymentGatewayDeclinedError,
  PaymentGatewayTransientError,
} from '../payment-gateway.service';

// ─── SDK doubles ────────────────────────────────────────────────
// The service dynamically imports 'razorpay' and 'stripe'. The default export
// is read through a getter so each test can swap the constructor (or make it
// undefined to force the REST fallback path).
const sdk = vi.hoisted(() => ({
  razorpayCtor: undefined as unknown,
  stripeCtor: undefined as unknown,
  razorpayCreate: vi.fn(),
  stripeCreate: vi.fn(),
}));

vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('razorpay', () => ({
  get default() {
    return sdk.razorpayCtor;
  },
}));
vi.mock('stripe', () => ({
  get default() {
    return sdk.stripeCtor;
  },
}));

function FakeRazorpay() {
  return { payments: { createRecurringPayment: sdk.razorpayCreate } };
}

function FakeStripe() {
  return { paymentIntents: { create: sdk.stripeCreate } };
}

// ─── Prisma / fetch helpers ─────────────────────────────────────

type PrismaStub = {
  savedPaymentMethod: { findFirst: ReturnType<typeof vi.fn> };
  setting: { findFirst: ReturnType<typeof vi.fn> };
};

const fetchMock = vi.fn();

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function rawRes(status: number, body: string): Response {
  return new Response(body, { status });
}

function method(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sm-1',
    tenantId: 'tenant-1',
    customerId: 'cust-1',
    tokenReference: 'tok_123',
    expiresAt: null,
    ...overrides,
  };
}

const baseInput = {
  tenantId: 'tenant-1',
  customerId: 'cust-1',
  savedMethodId: 'sm-1',
  amountPaise: 150000,
  reference: 'SIP-123',
};

const ENV_KEYS = [
  'PAYMENT_GATEWAY_PROVIDER',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'STRIPE_SECRET_KEY',
  'CASHFREE_CLIENT_ID',
  'CASHFREE_CLIENT_SECRET',
  'CASHFREE_ENV',
];

describe('PaymentGatewayService', () => {
  let service: PaymentGatewayService;
  let prisma: PrismaStub;
  const savedEnv: Record<string, string | undefined> = {};

  const charge = (overrides: Record<string, unknown> = {}) =>
    service.chargeSavedMethod({ ...baseInput, ...overrides } as never);

  const setEnv = (values: Record<string, string>) => {
    for (const [k, v] of Object.entries(values)) process.env[k] = v;
  };

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    sdk.razorpayCtor = FakeRazorpay;
    sdk.stripeCtor = FakeStripe;
    sdk.razorpayCreate = vi.fn();
    sdk.stripeCreate = vi.fn();

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);

    prisma = createMockPrismaService() as unknown as PrismaStub;
    prisma.savedPaymentMethod = { findFirst: vi.fn().mockResolvedValue(method()) };
    prisma.setting = { findFirst: vi.fn().mockResolvedValue(null) };

    service = new PaymentGatewayService(prisma as never);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ─── Input validation and method lookup ──────────────────────

  describe('chargeSavedMethod validation', () => {
    it.each([0, -1, NaN, Infinity, -Infinity])(
      'rejects invalid amount %s with INVALID_AMOUNT',
      async (amount) => {
        const err = await charge({ amountPaise: amount }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as PaymentGatewayDeclinedError).code).toBe('INVALID_AMOUNT');
        expect(prisma.savedPaymentMethod.findFirst).not.toHaveBeenCalled();
      },
    );

    it('throws PaymentMethodNotFoundError when method is missing for tenant/customer', async () => {
      prisma.savedPaymentMethod.findFirst.mockResolvedValue(null);
      await expect(charge()).rejects.toBeInstanceOf(PaymentMethodNotFoundError);
      expect(prisma.savedPaymentMethod.findFirst).toHaveBeenCalledWith({
        where: { id: 'sm-1', tenantId: 'tenant-1', customerId: 'cust-1' },
      });
    });

    it('throws PaymentMethodExpiredError when expiresAt is in the past', async () => {
      prisma.savedPaymentMethod.findFirst.mockResolvedValue(
        method({ expiresAt: new Date(Date.now() - 60_000) }),
      );
      await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
    });

    it('accepts a method whose expiresAt is in the future', async () => {
      prisma.savedPaymentMethod.findFirst.mockResolvedValue(
        method({ expiresAt: new Date(Date.now() + 86_400_000) }),
      );
      const res = await charge();
      expect(res.status).toBe('SUCCEEDED');
    });

    it('defaults currency to INR and honours an explicit override', async () => {
      const dflt = await charge();
      expect(dflt.currency).toBe('INR');
      const usd = await charge({ currency: 'USD' });
      expect(usd.currency).toBe('USD');
    });
  });

  // ─── Provider selection ──────────────────────────────────────

  describe('provider selection', () => {
    it('defaults to mock when PAYMENT_GATEWAY_PROVIDER is unset', async () => {
      const res = await charge();
      expect(res.provider).toBe('mock');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('treats the provider env value case-insensitively', async () => {
      setEnv({ PAYMENT_GATEWAY_PROVIDER: 'MOCK' });
      const res = await charge();
      expect(res.provider).toBe('mock');
    });

    it('falls back to mock and warns for an unknown provider', async () => {
      setEnv({ PAYMENT_GATEWAY_PROVIDER: 'paypal' });
      const res = await charge();
      expect(res.provider).toBe('mock');
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown PAYMENT_GATEWAY_PROVIDER="paypal"'),
      );
    });
  });

  // ─── Mock provider ───────────────────────────────────────────

  describe('mock provider', () => {
    it('returns a deterministic-shaped SUCCEEDED charge with pg_mock_ id', async () => {
      const before = Date.now();
      const res = await charge();
      expect(res).toEqual({
        chargeId: 'pg_mock_mock-uuid',
        provider: 'mock',
        savedMethodId: 'sm-1',
        amountPaise: 150000,
        currency: 'INR',
        status: 'SUCCEEDED',
        reference: 'SIP-123',
        processedAt: expect.any(Number),
      });
      expect(res.processedAt).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── Razorpay ────────────────────────────────────────────────

  describe('razorpay provider', () => {
    beforeEach(() => {
      setEnv({
        PAYMENT_GATEWAY_PROVIDER: 'razorpay',
        RAZORPAY_KEY_ID: 'rzp_key',
        RAZORPAY_KEY_SECRET: 'rzp_secret',
      });
    });

    it('throws a transient error when credentials are missing', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      await expect(charge()).rejects.toBeInstanceOf(PaymentGatewayTransientError);
      await expect(charge()).rejects.toThrow('Razorpay credentials not configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when only the key secret is missing', async () => {
      delete process.env.RAZORPAY_KEY_SECRET;
      await expect(charge()).rejects.toThrow('Razorpay credentials not configured');
    });

    it('uses the SDK recurring payment when it succeeds', async () => {
      sdk.razorpayCreate.mockResolvedValue({ id: 'pay_sdk_1', status: 'captured' });
      const res = await charge();
      expect(sdk.razorpayCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150000,
          currency: 'INR',
          token: 'tok_123',
          recurring: '1',
          description: 'SIP-123',
          notes: {
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            savedMethodId: 'sm-1',
            reference: 'SIP-123',
          },
        }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        chargeId: 'pay_sdk_1',
        provider: 'razorpay',
        status: 'SUCCEEDED',
        amountPaise: 150000,
      });
    });

    it.each([
      ['captured', 'SUCCEEDED'],
      ['authorized', 'SUCCEEDED'],
      ['succeeded', 'SUCCEEDED'],
      ['created', 'PENDING'],
      ['pending', 'PENDING'],
      ['processing', 'PENDING'],
      ['failed', 'FAILED'],
    ])('maps SDK status %s to %s', async (sdkStatus, expected) => {
      sdk.razorpayCreate.mockResolvedValue({ id: 'pay_x', status: sdkStatus });
      const res = await charge();
      expect(res.status).toBe(expected);
    });

    it('falls back to REST when the SDK call rejects', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_rest_1', status: 'captured' }));
      const res = await charge();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Razorpay SDK path failed'),
      );
      expect(res).toMatchObject({ chargeId: 'pay_rest_1', status: 'SUCCEEDED' });
    });

    it('falls back to REST when the SDK rejects with a non-Error value', async () => {
      sdk.razorpayCreate.mockRejectedValue('string failure');
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_rest_2', status: 'created' }));
      const res = await charge();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('string failure'),
      );
      expect(res.status).toBe('PENDING');
    });

    it('falls back to REST when the SDK constructor is unavailable', async () => {
      sdk.razorpayCtor = undefined;
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_rest_3', status: 'captured' }));
      const res = await charge();
      expect(res.chargeId).toBe('pay_rest_3');
    });

    it('falls back to REST when the SDK client has no createRecurringPayment', async () => {
      sdk.razorpayCtor = function EmptyRazorpay() {
        return { payments: {} };
      };
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_rest_4', status: 'captured' }));
      const res = await charge();
      expect(res.chargeId).toBe('pay_rest_4');
    });

    it('posts to the Razorpay REST endpoint with Basic auth on fallback', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_rest_5', status: 'captured' }));
      await charge();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.razorpay.com/v1/payments/create/recurring');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('rzp_key:rzp_secret').toString('base64')}`,
      );
      expect(JSON.parse(init.body as string)).toMatchObject({
        amount: 150000,
        token: 'tok_123',
        recurring: '1',
      });
    });

    it('defaults REST status to PENDING when response has no status', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_nostatus' }));
      const res = await charge();
      expect(res.status).toBe('PENDING');
    });

    it('maps an unrecognised REST status to FAILED', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(jsonRes(200, { id: 'pay_refund', status: 'refunded' }));
      const res = await charge();
      expect(res.status).toBe('FAILED');
    });

    it('throws a transient error on network failure', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayTransientError);
      expect((err as Error).message).toBe('Razorpay network error: ECONNRESET');
    });

    it('stringifies non-Error network failures', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockRejectedValue('timeout');
      await expect(charge()).rejects.toThrow('Razorpay network error: timeout');
    });

    it('throws a transient error on HTTP 500 using the provider description', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(
        jsonRes(500, { error: { description: 'internal boom' } }),
      );
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayTransientError);
      expect((err as Error).message).toBe('Razorpay 500: internal boom');
    });

    it('throws a transient error on HTTP 429 without a description', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(rawRes(429, 'not json'));
      await expect(charge()).rejects.toThrow('Razorpay 429: transient error');
    });

    it('throws a declined error on HTTP 400 with error code and description', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(
        jsonRes(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'card expired' } }),
      );
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
      expect((err as PaymentGatewayDeclinedError).code).toBe('BAD_REQUEST_ERROR');
      expect((err as Error).message).toBe('card expired');
    });

    it('throws a declined error with HTTP code fallback when body is empty', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(rawRes(402, ''));
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
      expect((err as PaymentGatewayDeclinedError).code).toBe('HTTP_402');
      expect((err as Error).message).toBe('Razorpay declined charge (HTTP 402)');
    });

    it('throws a transient error when a 2xx response lacks a payment id', async () => {
      sdk.razorpayCreate.mockRejectedValue(new Error('sdk down'));
      fetchMock.mockResolvedValue(jsonRes(200, { status: 'captured' }));
      await expect(charge()).rejects.toThrow('Razorpay response missing payment id');
    });
  });

  // ─── Stripe ──────────────────────────────────────────────────

  describe('stripe provider', () => {
    const validToken = 'pm_123|cus_456';

    beforeEach(() => {
      setEnv({ PAYMENT_GATEWAY_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_env' });
      prisma.savedPaymentMethod.findFirst.mockResolvedValue(method({ tokenReference: validToken }));
    });

    describe('credential resolution', () => {
      it('throws a transient error when no credential is configured', async () => {
        delete process.env.STRIPE_SECRET_KEY;
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayTransientError);
        expect((err as Error).message).toContain('missing env STRIPE_SECRET_KEY');
      });

      it('prefers the tenant Setting value when it is a raw string', async () => {
        prisma.setting.findFirst.mockResolvedValue({ settingValue: 'sk_setting' });
        sdk.stripeCtor = undefined;
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_1', status: 'succeeded' }));
        await charge();
        expect(prisma.setting.findFirst).toHaveBeenCalledWith({
          where: { tenantId: 'tenant-1', settingKey: 'stripe_secret_key' },
        });
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_setting');
      });

      it('accepts a Setting value shaped as { value: string }', async () => {
        prisma.setting.findFirst.mockResolvedValue({ settingValue: { value: 'sk_obj' } });
        sdk.stripeCtor = undefined;
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_2', status: 'succeeded' }));
        await charge();
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_obj');
      });

      it('falls back to env when Setting value is an empty string', async () => {
        prisma.setting.findFirst.mockResolvedValue({ settingValue: '' });
        sdk.stripeCtor = undefined;
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_3', status: 'succeeded' }));
        await charge();
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_env');
      });

      it('falls back to env when Setting object has no value key', async () => {
        prisma.setting.findFirst.mockResolvedValue({ settingValue: { other: 1 } });
        sdk.stripeCtor = undefined;
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_4', status: 'succeeded' }));
        await charge();
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_env');
      });

      it('falls back to env and warns when the Setting lookup throws', async () => {
        prisma.setting.findFirst.mockRejectedValue(new Error('db offline'));
        sdk.stripeCtor = undefined;
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_5', status: 'succeeded' }));
        const res = await charge();
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to read Setting stripe_secret_key'),
        );
        expect(res.chargeId).toBe('pi_5');
      });

      it('warns with a non-Error Setting lookup failure', async () => {
        prisma.setting.findFirst.mockRejectedValue('weird');
        sdk.stripeCtor = undefined;
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_6', status: 'succeeded' }));
        await charge();
        expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('weird'));
      });
    });

    describe('token validation', () => {
      it.each(['pm_only', 'pm_123|', '|cus_456', 'a|b|c'])(
        'rejects malformed token %s with INVALID_TOKEN_FORMAT',
        async (token) => {
          prisma.savedPaymentMethod.findFirst.mockResolvedValue(method({ tokenReference: token }));
          const err = await charge().catch((e: unknown) => e);
          expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
          expect((err as PaymentGatewayDeclinedError).code).toBe('INVALID_TOKEN_FORMAT');
        },
      );

      it('trims whitespace around pm and cus ids', async () => {
        prisma.savedPaymentMethod.findFirst.mockResolvedValue(
          method({ tokenReference: ' pm_9 | cus_9 ' }),
        );
        sdk.stripeCreate.mockResolvedValue({ id: 'pi_trim', status: 'succeeded' });
        await charge();
        expect(sdk.stripeCreate).toHaveBeenCalledWith(
          expect.objectContaining({ payment_method: 'pm_9', customer: 'cus_9' }),
        );
      });
    });

    describe('SDK path', () => {
      it('creates an off-session confirmed PaymentIntent', async () => {
        sdk.stripeCreate.mockResolvedValue({ id: 'pi_sdk', status: 'succeeded' });
        const res = await charge({ currency: 'USD' });
        expect(sdk.stripeCreate).toHaveBeenCalledWith({
          amount: 150000,
          currency: 'usd',
          payment_method: 'pm_123',
          customer: 'cus_456',
          off_session: true,
          confirm: true,
          description: 'SIP-123',
          metadata: {
            tenantId: 'tenant-1',
            customerId: 'cust-1',
            savedMethodId: 'sm-1',
            reference: 'SIP-123',
          },
        });
        expect(res).toMatchObject({ chargeId: 'pi_sdk', provider: 'stripe', status: 'SUCCEEDED', currency: 'USD' });
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it.each([
        ['succeeded', 'SUCCEEDED'],
        ['processing', 'PENDING'],
        ['requires_capture', 'PENDING'],
        ['canceled', 'FAILED'],
      ])('maps intent status %s to %s', async (intentStatus, expected) => {
        sdk.stripeCreate.mockResolvedValue({ id: 'pi_s', status: intentStatus });
        const res = await charge();
        expect(res.status).toBe(expected);
      });

      it('throws a transient error for SDK 5xx errors', async () => {
        sdk.stripeCreate.mockRejectedValue({ statusCode: 503, message: 'unavailable' });
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayTransientError);
        expect((err as Error).message).toBe('Stripe 503: unavailable');
      });

      it('throws a transient error for SDK 429 rate limiting', async () => {
        sdk.stripeCreate.mockRejectedValue({ statusCode: 429, message: 'slow down' });
        await expect(charge()).rejects.toBeInstanceOf(PaymentGatewayTransientError);
      });

      it('maps authentication_required to PaymentMethodExpiredError', async () => {
        sdk.stripeCreate.mockRejectedValue({ code: 'authentication_required', message: '3ds' });
        await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
      });

      it('maps requires_payment_method to PaymentMethodExpiredError', async () => {
        sdk.stripeCreate.mockRejectedValue({ code: 'requires_payment_method', message: 'none' });
        await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
      });

      it('maps expired_card on a StripeCardError to PaymentMethodExpiredError', async () => {
        sdk.stripeCreate.mockRejectedValue({
          type: 'StripeCardError',
          code: 'expired_card',
          message: 'card expired',
        });
        await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
      });

      it('treats expired_card on a non-StripeCardError as a decline', async () => {
        sdk.stripeCreate.mockRejectedValue({ type: 'card_error', code: 'expired_card', message: 'x' });
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as PaymentGatewayDeclinedError).code).toBe('expired_card');
      });

      it('maps card_declined to a decline carrying the decline_code', async () => {
        sdk.stripeCreate.mockRejectedValue({
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'declined',
        });
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as PaymentGatewayDeclinedError).code).toBe('insufficient_funds');
      });

      it('uses the error type as code when no code is present on card_error', async () => {
        sdk.stripeCreate.mockRejectedValue({ type: 'card_error', message: 'bad card' });
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as PaymentGatewayDeclinedError).code).toBe('card_error');
      });

      it('maps a generic error to a decline with its code', async () => {
        sdk.stripeCreate.mockRejectedValue({ code: 'some_code', message: 'generic' });
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as PaymentGatewayDeclinedError).code).toBe('some_code');
        expect((err as Error).message).toBe('generic');
      });

      it('uses a default message and code when the SDK error is empty', async () => {
        sdk.stripeCreate.mockRejectedValue({});
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as Error).message).toBe('Stripe charge failed');
        expect((err as PaymentGatewayDeclinedError).code).toBe('unknown');
      });
    });

    describe('REST fallback', () => {
      beforeEach(() => {
        sdk.stripeCtor = undefined;
      });

      it('posts form-encoded PaymentIntent params with bearer auth', async () => {
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_rest', status: 'succeeded' }));
        const res = await charge({ currency: 'INR' });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.stripe.com/v1/payment_intents');
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>)['Content-Type']).toBe(
          'application/x-www-form-urlencoded',
        );
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_env');
        const params = new URLSearchParams(init.body as string);
        expect(params.get('amount')).toBe('150000');
        expect(params.get('currency')).toBe('inr');
        expect(params.get('payment_method')).toBe('pm_123');
        expect(params.get('customer')).toBe('cus_456');
        expect(params.get('off_session')).toBe('true');
        expect(params.get('confirm')).toBe('true');
        expect(params.get('description')).toBe('SIP-123');
        expect(params.get('metadata[tenantId]')).toBe('tenant-1');
        expect(params.get('metadata[customerId]')).toBe('cust-1');
        expect(params.get('metadata[savedMethodId]')).toBe('sm-1');
        expect(params.get('metadata[reference]')).toBe('SIP-123');
        expect(res).toMatchObject({ chargeId: 'pi_rest', provider: 'stripe', status: 'SUCCEEDED' });
      });

      it('maps REST processing status to PENDING', async () => {
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_p', status: 'processing' }));
        const res = await charge();
        expect(res.status).toBe('PENDING');
      });

      it('throws a transient error on network failure', async () => {
        fetchMock.mockRejectedValue(new Error('socket hang up'));
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayTransientError);
        expect((err as Error).message).toBe('Stripe network error: socket hang up');
      });

      it('stringifies non-Error network failures', async () => {
        fetchMock.mockRejectedValue(42);
        await expect(charge()).rejects.toThrow('Stripe network error: 42');
      });

      it('throws a transient error on HTTP 500 with the API message', async () => {
        fetchMock.mockResolvedValue(jsonRes(500, { error: { message: 'stripe down' } }));
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayTransientError);
        expect((err as Error).message).toBe('Stripe 500: stripe down');
      });

      it('throws a transient error on HTTP 429 without a message', async () => {
        fetchMock.mockResolvedValue(rawRes(429, ''));
        await expect(charge()).rejects.toThrow('Stripe 429: transient error');
      });

      it('translates a 402 card_error into a decline with decline_code', async () => {
        fetchMock.mockResolvedValue(
          jsonRes(402, {
            error: {
              type: 'card_error',
              code: 'card_declined',
              decline_code: 'insufficient_funds',
              message: 'Insufficient funds',
            },
          }),
        );
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as PaymentGatewayDeclinedError).code).toBe('insufficient_funds');
        expect((err as Error).message).toBe('Insufficient funds');
      });

      it('translates a 400 requires_payment_method into PaymentMethodExpiredError', async () => {
        fetchMock.mockResolvedValue(
          jsonRes(400, { error: { code: 'requires_payment_method', message: 'no pm' } }),
        );
        await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
      });

      it('declines with a default message when a non-2xx has no error body', async () => {
        fetchMock.mockResolvedValue(rawRes(400, 'bad'));
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
        expect((err as Error).message).toBe('Stripe charge failed');
        expect((err as PaymentGatewayDeclinedError).code).toBe('unknown');
      });

      it('throws a transient error when a 2xx response lacks id/status', async () => {
        fetchMock.mockResolvedValue(jsonRes(200, { id: 'pi_only' }));
        await expect(charge()).rejects.toThrow(
          'Stripe response missing payment intent id/status',
        );
      });
    });
  });

  // ─── Cashfree ────────────────────────────────────────────────

  describe('cashfree provider', () => {
    beforeEach(() => {
      setEnv({
        PAYMENT_GATEWAY_PROVIDER: 'cashfree',
        CASHFREE_CLIENT_ID: 'cf_id',
        CASHFREE_CLIENT_SECRET: 'cf_secret',
      });
      prisma.savedPaymentMethod.findFirst.mockResolvedValue(method({ tokenReference: 'sub_789' }));
    });

    describe('credential resolution', () => {
      it('throws a transient error naming CASHFREE_CLIENT_ID when it is missing', async () => {
        delete process.env.CASHFREE_CLIENT_ID;
        const err = await charge().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PaymentGatewayTransientError);
        expect((err as Error).message).toBe(
          'Provider cashfree not configured: missing env CASHFREE_CLIENT_ID',
        );
      });

      it('throws a transient error naming CASHFREE_CLIENT_SECRET when only the secret is missing', async () => {
        delete process.env.CASHFREE_CLIENT_SECRET;
        await expect(charge()).rejects.toThrow('missing env CASHFREE_CLIENT_SECRET');
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it('reads credentials from tenant Settings before env', async () => {
        prisma.setting.findFirst.mockImplementation(async ({ where }: { where: { settingKey: string } }) => {
          if (where.settingKey === 'cashfree_client_id') return { settingValue: 'tenant_id' };
          if (where.settingKey === 'cashfree_client_secret') return { settingValue: { value: 'tenant_secret' } };
          return null;
        });
        fetchMock.mockResolvedValue(jsonRes(200, { payment_id: 'cf_t', payment_status: 'SUCCESS' }));
        await charge();
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect((init.headers as Record<string, string>)['x-client-id']).toBe('tenant_id');
        expect((init.headers as Record<string, string>)['x-client-secret']).toBe('tenant_secret');
      });
    });

    it('posts the recurring charge to production by default', async () => {
      fetchMock.mockResolvedValue(jsonRes(200, { payment_id: 'cf_123', payment_status: 'SUCCESS' }));
      const res = await charge({ currency: 'inr', reference: 'R'.repeat(80) });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.cashfree.com/pg/recurring/charge');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-client-id']).toBe('cf_id');
      expect(headers['x-client-secret']).toBe('cf_secret');
      expect(headers['x-api-version']).toBe('2022-09-01');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        subscription_id: 'sub_789',
        amount: '1500.00',
        currency: 'INR',
        subReferenceId: 'R'.repeat(50),
        remarks: `Charge for ${'R'.repeat(80)}`,
      });
      expect(res).toMatchObject({ chargeId: 'cf_123', provider: 'cashfree', status: 'SUCCEEDED' });
    });

    it('uses the sandbox endpoint when CASHFREE_ENV=sandbox', async () => {
      setEnv({ CASHFREE_ENV: 'SANDBOX' });
      fetchMock.mockResolvedValue(jsonRes(200, { payment_id: 'cf_sb', payment_status: 'PAID' }));
      await charge();
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
        'https://sandbox.cashfree.com/pg/recurring/charge',
      );
    });

    it('converts paise to rupees with two decimals', async () => {
      fetchMock.mockResolvedValue(jsonRes(200, { payment_id: 'cf_1', payment_status: 'PAID' }));
      await charge({ amountPaise: 1234 });
      const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
      expect(body.amount).toBe('12.34');
    });

    it.each([
      ['SUCCESS', 'SUCCEEDED'],
      ['SUCCEEDED', 'SUCCEEDED'],
      ['PAID', 'SUCCEEDED'],
      ['PENDING', 'PENDING'],
      ['INITIATED', 'PENDING'],
      ['PROCESSING', 'PENDING'],
      ['FAILED', 'FAILED'],
    ])('maps payment_status %s to %s', async (status, expected) => {
      fetchMock.mockResolvedValue(jsonRes(200, { payment_id: 'cf_m', payment_status: status }));
      const res = await charge();
      expect(res.status).toBe(expected);
    });

    it('uses status when payment_status is absent and PENDING when both are absent', async () => {
      fetchMock.mockResolvedValueOnce(jsonRes(200, { payment_id: 'cf_a', status: 'paid' }));
      expect((await charge()).status).toBe('SUCCEEDED');

      fetchMock.mockResolvedValueOnce(jsonRes(200, { payment_id: 'cf_b' }));
      expect((await charge()).status).toBe('PENDING');
    });

    it('falls back to cf_payment_id and stringifies numeric ids', async () => {
      fetchMock.mockResolvedValueOnce(jsonRes(200, { cf_payment_id: 555, payment_status: 'PAID' }));
      expect((await charge()).chargeId).toBe('555');

      fetchMock.mockResolvedValueOnce(jsonRes(200, { payment_id: 777, payment_status: 'PAID' }));
      expect((await charge()).chargeId).toBe('777');
    });

    it('throws a transient error on network failure', async () => {
      fetchMock.mockRejectedValue(new Error('dns fail'));
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayTransientError);
      expect((err as Error).message).toBe('Cashfree network error: dns fail');
    });

    it('stringifies non-Error network failures', async () => {
      fetchMock.mockRejectedValue('offline');
      await expect(charge()).rejects.toThrow('Cashfree network error: offline');
    });

    it('throws a transient error on HTTP 503 with the API message', async () => {
      fetchMock.mockResolvedValue(jsonRes(503, { message: 'maintenance' }));
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayTransientError);
      expect((err as Error).message).toBe('Cashfree 503: maintenance');
    });

    it('throws a transient error on HTTP 429 without a message', async () => {
      fetchMock.mockResolvedValue(rawRes(429, ''));
      await expect(charge()).rejects.toThrow('Cashfree 429: transient error');
    });

    it.each(['subscription_not_found', 'subscription_expired', 'subscription_cancelled', 'mandate_expired'])(
      'maps %s on a 4xx to PaymentMethodExpiredError',
      async (code) => {
        fetchMock.mockResolvedValue(jsonRes(400, { code, message: 'gone' }));
        await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
      },
    );

    it('uses the error type when code is absent for expiry detection', async () => {
      fetchMock.mockResolvedValue(jsonRes(400, { type: 'mandate_expired' }));
      await expect(charge()).rejects.toBeInstanceOf(PaymentMethodExpiredError);
    });

    it('translates other 4xx responses into a decline with the provider code', async () => {
      fetchMock.mockResolvedValue(jsonRes(422, { code: 'invalid_amount', message: 'bad amount' }));
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
      expect((err as PaymentGatewayDeclinedError).code).toBe('invalid_amount');
      expect((err as Error).message).toBe('bad amount');
    });

    it('declines with HTTP code fallback when the 4xx body is empty', async () => {
      fetchMock.mockResolvedValue(rawRes(400, ''));
      const err = await charge().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PaymentGatewayDeclinedError);
      expect((err as PaymentGatewayDeclinedError).code).toBe('HTTP_400');
      expect((err as Error).message).toBe('Cashfree declined charge (HTTP 400)');
    });

    it('throws a transient error when a 2xx response has no payment id', async () => {
      fetchMock.mockResolvedValue(jsonRes(200, { payment_status: 'PAID' }));
      await expect(charge()).rejects.toThrow('Cashfree response missing payment_id');
    });

    it('throws a transient error when a 2xx body is not JSON', async () => {
      fetchMock.mockResolvedValue(rawRes(200, '<html>'));
      await expect(charge()).rejects.toThrow('Cashfree response missing payment_id');
    });
  });
});
