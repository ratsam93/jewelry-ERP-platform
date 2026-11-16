import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  verifyShopifyHmac,
  verifyStripeSignatureHeader,
  normalizeShopifyShopDomain,
} from '../ecommerce.webhook-signature';
import { EcommerceShopifyService } from '../ecommerce.shopify.service';

const SECRET = 'whsec_test_secret';
const BODY = '{"id":123,"order_number":1001}';

const shopifySig = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('base64');

const stripeHeader = (body: string, secret: string, t: number) => {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
};

describe('verifyShopifyHmac', () => {
  it('accepts a valid signature over the raw body', () => {
    expect(verifyShopifyHmac(BODY, shopifySig(BODY, SECRET), SECRET)).toBe(true);
    expect(verifyShopifyHmac(Buffer.from(BODY), shopifySig(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyShopifyHmac(BODY, shopifySig(BODY, 'other'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyShopifyHmac('{"id":999}', shopifySig(BODY, SECRET), SECRET)).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifyShopifyHmac(BODY, undefined, SECRET)).toBe(false);
    expect(verifyShopifyHmac(BODY, '', SECRET)).toBe(false);
    expect(verifyShopifyHmac(BODY, 'not-base64-hmac', SECRET)).toBe(false);
  });

  it('fails closed when the secret is missing (production-style)', () => {
    expect(verifyShopifyHmac(BODY, shopifySig(BODY, ''), undefined)).toBe(false);
    expect(verifyShopifyHmac(BODY, shopifySig(BODY, ''), '')).toBe(false);
  });

  it('is exposed on EcommerceShopifyService with the same semantics', () => {
    const svc = new EcommerceShopifyService({} as any, {} as any, {} as any);
    expect(svc.verifyWebhookSignature(BODY, shopifySig(BODY, SECRET), SECRET)).toBe(true);
    expect(svc.verifyWebhookSignature(BODY, 'bad', SECRET)).toBe(false);
  });
});

describe('verifyStripeSignatureHeader', () => {
  const now = 1_700_000_000;

  it('accepts a valid signature within the 5 minute tolerance', () => {
    const header = stripeHeader(BODY, SECRET, now - 30);
    expect(verifyStripeSignatureHeader(BODY, header, SECRET, now)).toBe(true);
  });

  it('accepts when any of several v1 signatures matches', () => {
    const good = stripeHeader(BODY, SECRET, now).split(',')[1];
    expect(verifyStripeSignatureHeader(BODY, `t=${now},v1=deadbeef,${good}`, SECRET, now)).toBe(true);
  });

  it('rejects a timestamp older than the tolerance (replay)', () => {
    const header = stripeHeader(BODY, SECRET, now - 301);
    expect(verifyStripeSignatureHeader(BODY, header, SECRET, now)).toBe(false);
  });

  it('rejects a timestamp too far in the future', () => {
    const header = stripeHeader(BODY, SECRET, now + 301);
    expect(verifyStripeSignatureHeader(BODY, header, SECRET, now)).toBe(false);
  });

  it('rejects a wrong secret or tampered body', () => {
    const header = stripeHeader(BODY, 'other', now);
    expect(verifyStripeSignatureHeader(BODY, header, SECRET, now)).toBe(false);
    expect(verifyStripeSignatureHeader('{"x":1}', stripeHeader(BODY, SECRET, now), SECRET, now)).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(verifyStripeSignatureHeader(BODY, undefined, SECRET, now)).toBe(false);
    expect(verifyStripeSignatureHeader(BODY, `t=${now}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignatureHeader(BODY, `t=abc,v1=00`, SECRET, now)).toBe(false);
    expect(verifyStripeSignatureHeader(BODY, `t=${now},v1=zz`, SECRET, now)).toBe(false);
  });

  it('fails closed when the secret is missing (production-style)', () => {
    const header = stripeHeader(BODY, '', now);
    expect(verifyStripeSignatureHeader(BODY, header, undefined, now)).toBe(false);
    expect(verifyStripeSignatureHeader(BODY, header, '', now)).toBe(false);
  });
});

describe('normalizeShopifyShopDomain', () => {
  it('normalizes common shop domain forms', () => {
    expect(normalizeShopifyShopDomain('MyStore')).toBe('mystore');
    expect(normalizeShopifyShopDomain('mystore.myshopify.com')).toBe('mystore');
    expect(normalizeShopifyShopDomain('https://mystore.myshopify.com/')).toBe('mystore');
  });

  it('rejects implausible values', () => {
    expect(normalizeShopifyShopDomain(undefined)).toBeNull();
    expect(normalizeShopifyShopDomain('evil.com/path')).toBeNull();
    expect(normalizeShopifyShopDomain('a b')).toBeNull();
  });
});
