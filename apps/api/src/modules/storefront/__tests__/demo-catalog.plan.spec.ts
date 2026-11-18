import { describe, it, expect } from 'vitest';
import {
  DEMO_PRODUCTS,
  absoluteImageUrl,
  categoryKey,
  demoHuid,
  demoId,
  demoMetalRatesPaisePer10g,
  gramsToMg,
  imageBaseUrl,
  listPricePaise,
  metalRateHistoryRow,
  parseDemoCustomerEnv,
  parseRateKey,
  planMissing,
  productImageUrl,
  ratePer10gPaise,
  rupeesToPaise,
} from '../../../../../../packages/db/src/seed-demo-catalog-data';
import { StorefrontPricingService } from '../storefront.pricing.service';

describe('demo catalog: unit conversions', () => {
  it('converts per-gram rupees to paise per 10 g (the tenant settings unit)', () => {
    expect(ratePer10gPaise(6700)).toBe(6_700_000);
    expect(ratePer10gPaise(90)).toBe(90_000);
    const rates = demoMetalRatesPaisePer10g();
    expect(rates.GOLD_916).toBe(6_700_000);
    expect(rates.GOLD_750).toBe(5_500_000);
    expect(rates.GOLD_585).toBe(4_300_000);
    expect(rates.SILVER_999).toBe(90_000);
  });
  it('writes consistent admin rate rows (per gram / 10 g / tola / troy oz)', () => {
    const r = metalRateHistoryRow('GOLD', 916, 6700);
    expect(r.ratePerGramPaise).toBe(670_000n);
    expect(r.ratePer10gPaise).toBe(6_700_000n);
    expect(r.ratePerTroyOzPaise).toBe(BigInt(Math.round(670_000 * 31.1035)));
    expect(parseRateKey('PLATINUM_950')).toEqual({ metalType: 'PLATINUM', purity: 950 });
  });
  it('converts grams to integer milligrams and rupees to paise', () => {
    expect(gramsToMg(4.1)).toBe(4100n);
    expect(gramsToMg(0.5)).toBe(500n);
    expect(rupeesToPaise(2400)).toBe(240_000n);
  });
  it('matches the storefront pricing formula (wastage in basis points)', () => {
    const svc = new StorefrontPricingService({} as never);
    const rate = ratePer10gPaise(6700);
    const mine = listPricePaise(gramsToMg(10), rupeesToPaise(5000), 200, rate);
    const theirs = svc.calculateProductPrice(10_000, 500_000, 200, rate);
    expect(mine).toBe(BigInt(theirs.totalPricePaise));
    // 10 g of 22K at Rs 6700/g = Rs 67,000 metal + 2% wastage + Rs 5,000 making, +3% GST
    expect(theirs.metalValuePaise).toBe(6_700_000);
    expect(theirs.wastageValuePaise).toBe(134_000);
  });
});

describe('demo catalog: image URLs', () => {
  it('prefers IMAGE_BASE_URL, then shop.DOMAIN, then localhost', () => {
    expect(imageBaseUrl({ IMAGE_BASE_URL: 'https://cdn.x.com/' , DOMAIN: 'd.com' })).toBe('https://cdn.x.com');
    expect(imageBaseUrl({ DOMAIN: 'erp.example.com' })).toBe('https://shop.erp.example.com');
    expect(imageBaseUrl({})).toBe('http://localhost:3003');
  });
  it('builds absolute product image URLs', () => {
    expect(productImageUrl('https://shop.d.com', 'prod-ring-01.webp')).toBe('https://shop.d.com/images/products/prod-ring-01.webp');
    expect(absoluteImageUrl('https://a.com/', '/images/hero/hero-1.webp')).toBe('https://a.com/images/hero/hero-1.webp');
  });
});

describe('demo catalog: data integrity', () => {
  it('has 24-35 products with unique, well-formed SKUs and sane values', () => {
    expect(DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(24);
    expect(DEMO_PRODUCTS.length).toBeLessThanOrEqual(35);
    expect(new Set(DEMO_PRODUCTS.map((p) => p.sku)).size).toBe(DEMO_PRODUCTS.length);
    expect(DEMO_PRODUCTS[0]!.sku).toBe('TB-RING-22K-001');
    for (const p of DEMO_PRODUCTS) {
      expect(p.sku).toMatch(/^TB-[A-Z]+-[A-Z0-9]+-\d{3}$/);
      expect(p.netG).toBeLessThanOrEqual(p.grossG);
      expect(p.wastageBps).toBeLessThanOrEqual(1000); // basis points, never percent
    }
  });
  it('references image files that exist in the storefront bundle', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(__dirname, '../../../../../../apps/storefront/public/images/products');
    for (const p of DEMO_PRODUCTS) expect(fs.existsSync(path.join(dir, p.file)), p.file).toBe(true);
  });
  it('generates deterministic 6-char alphanumeric HUIDs and UUID-shaped ids', () => {
    expect(demoHuid('TB-RING-22K-001')).toMatch(/^[A-Z0-9]{6}$/);
    expect(demoHuid('TB-RING-22K-001')).toBe(demoHuid('TB-RING-22K-001'));
    expect(demoId('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('demo catalog: idempotency planner', () => {
  it('inserts only what is missing; a second run plans nothing', () => {
    const wanted = ['a', 'b', 'c'];
    expect(planMissing(['b'], wanted, (x) => x)).toEqual(['a', 'c']);
    expect(planMissing(['a', 'b', 'c'], wanted, (x) => x)).toEqual([]);
  });
  it('de-duplicates wanted keys', () => {
    expect(planMissing([], ['a', 'a', 'b'], (x) => x)).toEqual(['a', 'b']);
  });
  it('treats singular and plural category names as the same category', () => {
    expect(categoryKey('Rings')).toBe(categoryKey('Ring'));
    expect(categoryKey('Nose Pins')).toBe(categoryKey('Nose Pin'));
    expect(categoryKey('Gold')).not.toBe(categoryKey('Silver'));
  });
});

describe('demo customer env', () => {
  it('refuses the customer part without a password', () => {
    const r = parseDemoCustomerEnv({});
    expect(r.ok).toBe(false);
  });
  it('rejects short passwords and bad emails', () => {
    expect(parseDemoCustomerEnv({ DEMO_CUSTOMER_PASSWORD: 'short' }).ok).toBe(false);
    expect(parseDemoCustomerEnv({ DEMO_CUSTOMER_PASSWORD: 'longenough1', DEMO_CUSTOMER_EMAIL: 'nope' }).ok).toBe(false);
  });
  it('applies defaults', () => {
    const r = parseDemoCustomerEnv({ DEMO_CUSTOMER_PASSWORD: 'longenough1' });
    expect(r.ok && r.input.email).toBe('demo.customer@example.com');
    expect(r.ok && r.input.firstName).toBe('Priya');
  });
});
