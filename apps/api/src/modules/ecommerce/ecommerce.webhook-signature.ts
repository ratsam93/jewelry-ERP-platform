// ─── E-Commerce Webhook Signature Helpers ─────────────────────
// Pure, dependency-free HMAC verifiers shared by the REST webhook
// controllers and the tRPC handleWebhook path. Every comparison is
// timing-safe. A missing secret or header always yields `false`
// (fail closed).

import { createHmac, timingSafeEqual } from 'crypto';

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Shopify: X-Shopify-Hmac-Sha256 is base64(HMAC-SHA256(rawBody, secret)).
 */
export function verifyShopifyHmac(
  rawBody: Buffer | string,
  headerValue: string | undefined | null,
  secret: string | undefined | null,
): boolean {
  if (!secret || !headerValue) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(headerValue, 'base64');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Stripe: Stripe-Signature is `t=<unix>,v1=<hex>[,v1=<hex>...]`, where each
 * v1 is HMAC-SHA256 hex of `${t}.${rawBody}`. Rejects timestamps outside
 * the tolerance window to limit replay.
 */
export function verifyStripeSignatureHeader(
  rawBody: Buffer | string,
  headerValue: string | undefined | null,
  secret: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!secret || !headerValue) return false;

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of headerValue.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`, 'utf8')
    .update(rawBody)
    .digest();

  return signatures.some((sig) => {
    const provided = Buffer.from(sig, 'hex');
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

/**
 * Resolve a Shopify shop domain ("mystore", "mystore.myshopify.com",
 * "https://mystore.myshopify.com/") to its bare subdomain, or null if the
 * value is not a plausible shop domain.
 */
export function normalizeShopifyShopDomain(value: string | undefined | null): string | null {
  if (!value) return null;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.myshopify\.com$/, '');
  return /^[a-z0-9][a-z0-9-]*$/.test(host) ? host : null;
}
