/**
 * Pure data + helpers for the demo catalog seed (no database access, no side
 * effects, so it can be unit tested). The runner is seed-demo-catalog.ts.
 *
 * Units follow the rest of CaratFlow:
 *   - money: integer paise, weights: integer milligrams (BigInt in Prisma)
 *   - wastage: basis points (200 = 2%), the pricing code divides by 10_000
 *   - metal rates: tenant.settings.metalRates["<PRODUCT_TYPE>_<purity>"] in
 *     paise per 10 g (see StorefrontPricingService.getMetalRate)
 */
import * as crypto from 'crypto';

// ─── Rates ────────────────────────────────────────────────────────

/** Realistic per-gram rupee rates, keyed exactly like the storefront pricing code. */
export const DEMO_RATE_RUPEES_PER_GRAM: Record<string, number> = {
  GOLD_999: 7300,
  GOLD_916: 6700, // 22K
  GOLD_750: 5500, // 18K
  GOLD_585: 4300, // 14K
  SILVER_999: 90,
  PLATINUM_950: 3200,
};

/** Rupees per gram -> paise per 10 grams (the unit used by tenant.settings.metalRates). */
export function ratePer10gPaise(rupeesPerGram: number): number {
  return Math.round(rupeesPerGram * 100 * 10);
}

/** Full settings.metalRates map (paise per 10 g). */
export function demoMetalRatesPaisePer10g(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(DEMO_RATE_RUPEES_PER_GRAM)) out[k] = ratePer10gPaise(v);
  return out;
}

const TROY_OZ_G = 31.1035;
const TOLA_G = 11.6638;

/** The metal_rates (metal_rate_history) columns for one metal/purity. */
export function metalRateHistoryRow(metalType: string, purity: number, rupeesPerGram: number) {
  const perGram = BigInt(Math.round(rupeesPerGram * 100));
  return {
    metalType,
    purity,
    ratePerGramPaise: perGram,
    ratePer10gPaise: BigInt(ratePer10gPaise(rupeesPerGram)),
    ratePerTolaPaise: BigInt(Math.round(rupeesPerGram * 100 * TOLA_G)),
    ratePerTroyOzPaise: BigInt(Math.round(rupeesPerGram * 100 * TROY_OZ_G)),
  };
}

/** Parse "GOLD_916" -> { metalType: "GOLD", purity: 916 }. */
export function parseRateKey(key: string): { metalType: string; purity: number } {
  const i = key.lastIndexOf('_');
  return { metalType: key.slice(0, i), purity: Number(key.slice(i + 1)) };
}

// ─── Unit helpers ─────────────────────────────────────────────────

/** Grams (decimal) -> integer milligrams as BigInt. */
export function gramsToMg(grams: number): bigint {
  return BigInt(Math.round(grams * 1000));
}

export function rupeesToPaise(rupees: number): bigint {
  return BigInt(Math.round(rupees * 100));
}

/**
 * Same formula as StorefrontPricingService.calculateProductPrice:
 * metal + making + wastage(bps) then 3% GST. Returns paise.
 */
export function listPricePaise(
  metalWeightMg: bigint,
  makingPaise: bigint,
  wastageBps: number,
  ratePaisePer10g: number,
): bigint {
  const metal = Math.round((ratePaisePer10g * Number(metalWeightMg)) / 10_000);
  const wastage = Math.round((metal * wastageBps) / 10_000);
  const subtotal = metal + Number(makingPaise) + wastage;
  return BigInt(subtotal + Math.round((subtotal * 300) / 10_000));
}

// ─── Identifiers / URLs ───────────────────────────────────────────

/** Deterministic UUID-shaped id so re-runs and other seeds agree on identity. */
export function demoId(key: string): string {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic 6-char uppercase alphanumeric HUID-style number for a SKU. */
export function demoHuid(sku: string): string {
  const h = crypto.createHash('sha1').update(`huid:${sku}`).digest();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[h[i]! % alphabet.length];
  return out;
}

/**
 * Base URL under which the storefront serves /images/... .
 * IMAGE_BASE_URL wins, then https://shop.${DOMAIN}, then local dev.
 */
export function imageBaseUrl(env: Record<string, string | undefined>): string {
  const explicit = (env.IMAGE_BASE_URL ?? '').trim();
  const domain = (env.DOMAIN ?? '').trim();
  const base = explicit || (domain ? `https://shop.${domain}` : 'http://localhost:3003');
  return base.replace(/\/+$/, '');
}

/** Absolute image URL (admin on another host cannot resolve relative paths). */
export function absoluteImageUrl(base: string, relativePath: string): string {
  return `${base.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}

export function productImageUrl(base: string, file: string): string {
  return absoluteImageUrl(base, `images/products/${file}`);
}

// ─── Idempotency planner ──────────────────────────────────────────

/** Items whose key is not already present: the only rows a re-run may insert. */
export function planMissing<T>(existingKeys: Iterable<string>, wanted: readonly T[], keyOf: (t: T) => string): T[] {
  const have = new Set(existingKeys);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const w of wanted) {
    const k = keyOf(w);
    if (have.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** "Rings"/"Ring", "Nose Pins"/"Nose Pin" map to one key so existing singular categories are reused. */
export function categoryKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/s\b/g, '')
    .replace(/\s+/g, '-');
}

// ─── Categories ───────────────────────────────────────────────────

export const ROOT_CATEGORIES = [
  { name: 'Gold', description: 'Gold jewellery: 22K, 18K and 14K' },
  { name: 'Silver', description: 'Fine silver jewellery' },
  { name: 'Diamond', description: 'Certified diamond jewellery' },
  { name: 'Platinum', description: 'Platinum jewellery' },
  { name: 'Gemstone', description: 'Precious and semi-precious gemstone jewellery' },
  { name: 'Kundan', description: 'Kundan and traditional jewellery' },
] as const;

export const SUB_CATEGORIES: Record<string, readonly string[]> = {
  Gold: ['Rings', 'Necklaces', 'Earrings', 'Bangles', 'Bracelets', 'Pendants', 'Chains', 'Mangalsutra', 'Nose Pins'],
  Silver: ['Chains', 'Pendants'],
  Diamond: ['Rings', 'Earrings', 'Pendants'],
  Platinum: ['Rings'],
  Gemstone: ['Earrings', 'Rings'],
  Kundan: ['Earrings', 'Necklaces', 'Mangalsutra'],
};

// ─── Products ─────────────────────────────────────────────────────

export type DemoProductType = 'GOLD' | 'SILVER' | 'PLATINUM' | 'DIAMOND' | 'GEMSTONE' | 'KUNDAN';

export interface DemoProductSpec {
  sku: string;
  name: string;
  file: string; // file name under images/products/
  root: string; // root category name
  sub: string; // sub-category name
  productType: DemoProductType;
  purity: number; // 916, 750, 585, 999, 950
  grossG: number;
  netG: number;
  makingRupees: number;
  wastageBps: number; // 200 = 2%
  /** Non-metal-priced items (diamond/gemstone/kundan) carry a fixed price in rupees. */
  fixedPriceRupees?: number;
  occasion: string;
  qty: number;
}

const KARAT: Record<number, string> = { 916: '22K', 750: '18K', 585: '14K', 999: '999', 950: '950' };

type Row = [
  code: string, name: string, file: string, root: string, sub: string, type: DemoProductType,
  purity: number, gross: number, net: number, making: number, wastage: number, fixed: number, occasion: string, qty: number,
];

const ROWS: Row[] = [
  ['RING', 'Classic Gold Band Ring', 'prod-ring-03.webp', 'Gold', 'Rings', 'GOLD', 916, 4.2, 4.1, 2400, 200, 0, 'daily-wear', 12],
  ['RING', 'Baguette Stone Gold Ring', 'prod-ring-04.webp', 'Gold', 'Rings', 'GOLD', 750, 2.1, 1.9, 1800, 250, 0, 'daily-wear', 9],
  ['NECK', 'Teardrop Pendant Gold Necklace', 'prod-necklace-01.webp', 'Gold', 'Necklaces', 'GOLD', 916, 12.4, 12.0, 6200, 300, 0, 'festive', 6],
  ['NECK', 'Delicate Gold Chain Necklace', 'prod-necklace-02.webp', 'Gold', 'Necklaces', 'GOLD', 750, 5.6, 5.5, 3000, 250, 0, 'daily-wear', 14],
  ['NECK', 'Rose Gold Diamond Bar Necklace', 'prod-necklace-03.webp', 'Gold', 'Necklaces', 'GOLD', 585, 4.8, 4.5, 4200, 300, 0, 'party', 5],
  ['EAR', 'Teardrop Drop Earrings', 'prod-earring-01.webp', 'Gold', 'Earrings', 'GOLD', 916, 6.2, 5.9, 3300, 300, 0, 'festive', 10],
  ['EAR', 'Classic Gold Hoop Earrings', 'prod-earring-02.webp', 'Gold', 'Earrings', 'GOLD', 916, 3.8, 3.7, 1900, 200, 0, 'daily-wear', 18],
  ['EAR', 'Triple Crescent Hoop Earrings', 'prod-earring-03.webp', 'Gold', 'Earrings', 'GOLD', 750, 4.4, 4.3, 2300, 250, 0, 'party', 7],
  ['EAR', 'Rose Gold Teardrop Earrings', 'prod-earring-04.webp', 'Gold', 'Earrings', 'GOLD', 585, 2.9, 2.7, 1500, 250, 0, 'daily-wear', 11],
  ['BNGL', 'Antique Gold Bangles Pair', 'prod-bangle-01.webp', 'Gold', 'Bangles', 'GOLD', 916, 32.5, 32.0, 14500, 400, 0, 'wedding', 4],
  ['BNGL', 'Lattice Gold Bangle', 'prod-bangle-02.webp', 'Gold', 'Bangles', 'GOLD', 750, 14.2, 14.0, 6800, 300, 0, 'festive', 8],
  ['BNGL', 'Open Cuff Gold Bangle', 'prod-bangle-03.webp', 'Gold', 'Bangles', 'GOLD', 916, 11.6, 11.4, 5200, 300, 0, 'daily-wear', 6],
  ['BRAC', 'Braided Gold Bracelet', 'prod-bracelet-01.webp', 'Gold', 'Bracelets', 'GOLD', 916, 9.8, 9.6, 4600, 300, 0, 'party', 9],
  ['BRAC', 'Mesh Gold Bracelet', 'prod-bracelet-02.webp', 'Gold', 'Bracelets', 'GOLD', 916, 15.4, 15.2, 6900, 350, 0, 'festive', 5],
  ['BRAC', 'Diamond-cut Bangle Bracelet', 'prod-bracelet-03.webp', 'Gold', 'Bracelets', 'GOLD', 750, 6.1, 5.9, 3100, 250, 0, 'daily-wear', 13],
  ['PEND', 'Rose Gold Round Pendant', 'prod-pendant-01.webp', 'Gold', 'Pendants', 'GOLD', 750, 3.2, 3.1, 1700, 250, 0, 'daily-wear', 15],
  ['PEND', 'Floral Enamel Gold Pendant', 'prod-pendant-02.webp', 'Gold', 'Pendants', 'GOLD', 916, 2.6, 2.5, 1400, 300, 0, 'daily-wear', 20],
  ['PEND', 'Textured Gold Pendant', 'prod-pendant-03.webp', 'Gold', 'Pendants', 'GOLD', 916, 5.4, 5.2, 2800, 300, 0, 'festive', 8],
  ['CHN', 'Cuban Link Gold Chain', 'prod-chain-01.webp', 'Gold', 'Chains', 'GOLD', 916, 18.5, 18.3, 5400, 200, 0, 'daily-wear', 7],
  ['CHN', 'Curb Gold Chain', 'prod-chain-02.webp', 'Gold', 'Chains', 'GOLD', 916, 12.2, 12.0, 3700, 200, 0, 'daily-wear', 9],
  ['CHN', 'Paperclip Gold Chain', 'prod-chain-03.webp', 'Gold', 'Chains', 'GOLD', 750, 7.4, 7.2, 2400, 200, 0, 'daily-wear', 16],
  ['MNGL', 'Rose Gold Long Mangalsutra', 'prod-mangalsutra-01.webp', 'Gold', 'Mangalsutra', 'GOLD', 750, 14.8, 14.0, 7200, 350, 0, 'wedding', 6],
  ['MNGL', 'Temple Mangalsutra Haram', 'prod-mangalsutra-02.webp', 'Gold', 'Mangalsutra', 'GOLD', 916, 38.0, 36.5, 17500, 400, 0, 'wedding', 3],
  ['NOSE', 'Solitaire Gold Nose Pin', 'prod-nosepin-01.webp', 'Gold', 'Nose Pins', 'GOLD', 750, 0.6, 0.5, 900, 300, 0, 'daily-wear', 25],
  ['PEND', 'Infinity Silver Pendant', 'prod-silver-pendant-01.webp', 'Silver', 'Pendants', 'SILVER', 999, 8.5, 8.4, 450, 500, 0, 'daily-wear', 22],
  ['CHN', 'Silver Curb Chain', 'prod-silver-chain-01.webp', 'Silver', 'Chains', 'SILVER', 999, 24.0, 23.8, 700, 400, 0, 'daily-wear', 17],
  ['RING', 'Diamond Halo Ring', 'prod-ring-01.webp', 'Diamond', 'Rings', 'DIAMOND', 750, 3.4, 3.0, 0, 0, 68500, 'wedding', 4],
  ['RING', 'Oval Solitaire Diamond Ring', 'prod-ring-02.webp', 'Diamond', 'Rings', 'DIAMOND', 750, 3.0, 2.7, 0, 0, 142000, 'wedding', 2],
  ['RING', 'Platinum Cluster Ring', 'prod-ring-05.webp', 'Platinum', 'Rings', 'PLATINUM', 950, 7.8, 7.6, 5200, 300, 0, 'party', 5],
  ['EAR', 'Multi-Gem Drop Earrings', 'prod-earring-05.webp', 'Gemstone', 'Earrings', 'GEMSTONE', 750, 3.6, 3.2, 0, 0, 24500, 'party', 8],
  ['EAR', 'Kundan Pearl Chandbali Earrings', 'prod-earring-06.webp', 'Kundan', 'Earrings', 'KUNDAN', 916, 21.0, 18.5, 0, 0, 58900, 'wedding', 3],
];

/** Build the product specs with SKUs like TB-RING-22K-001 (counter per code+purity). */
export function buildDemoProducts(): DemoProductSpec[] {
  const counters = new Map<string, number>();
  return ROWS.map(([code, name, file, root, sub, productType, purity, grossG, netG, makingRupees, wastageBps, fixed, occasion, qty]) => {
    const label = productType === 'SILVER' ? 'S999' : productType === 'PLATINUM' ? 'PT950' : (KARAT[purity] ?? String(purity));
    const ck = `${code}-${label}`;
    const n = (counters.get(ck) ?? 0) + 1;
    counters.set(ck, n);
    const spec: DemoProductSpec = {
      sku: `TB-${ck}-${String(n).padStart(3, '0')}`,
      name, file, root, sub, productType, purity, grossG, netG, makingRupees, wastageBps, occasion, qty,
    };
    if (fixed > 0) spec.fixedPriceRupees = fixed;
    return spec;
  });
}

export const DEMO_PRODUCTS: readonly DemoProductSpec[] = buildDemoProducts();

export function productDescription(p: DemoProductSpec): string {
  const metal =
    p.productType === 'SILVER' ? '999 fine silver'
    : p.productType === 'PLATINUM' ? '950 platinum'
    : `${KARAT[p.purity] ?? p.purity} gold`;
  const hallmark = p.productType === 'GOLD' ? ' BIS hallmarked with HUID.' : '';
  return `${p.name} crafted in ${metal}. Net weight ${p.netG.toFixed(2)} g (gross ${p.grossG.toFixed(2)} g).${hallmark} Demo catalog item.`;
}

export function hasHuid(p: DemoProductSpec): boolean {
  return p.productType === 'GOLD';
}

// ─── Banners / FAQ / reviews ──────────────────────────────────────

export const DEMO_BANNERS = [
  { title: 'Timeless Gold, Crafted for You', subtitle: 'BIS hallmarked 22K and 18K jewellery', file: 'hero-1.webp', linkUrl: '/category/gold' },
  { title: 'Bridal and Kundan Collection', subtitle: 'Heirloom sets for your big day', file: 'hero-2.webp', linkUrl: '/category/kundan' },
  { title: 'Diamonds That Sparkle', subtitle: 'Certified solitaires and everyday diamonds', file: 'hero-3.webp', linkUrl: '/category/diamond' },
] as const;

export const DEMO_FAQS = [
  { question: 'Is your gold jewellery hallmarked?', answer: 'Yes. All gold items carry a BIS hallmark with a 6-character HUID.', category: 'Quality' },
  { question: 'How is the price of a gold item calculated?', answer: 'Price = metal weight x live rate, plus making charges and wastage, plus 3% GST.', category: 'Pricing' },
  { question: 'Do you offer returns?', answer: 'Yes. Unused items can be returned within 7 days with the original invoice and packaging.', category: 'Returns' },
  { question: 'Can I exchange my old gold?', answer: 'Yes. Visit the showroom for a free purity test and exchange valuation.', category: 'Exchange' },
] as const;

export const DEMO_REVIEWS = [
  { rating: 5, title: 'Beautiful finish', body: 'Lovely craftsmanship and the hallmark gave me confidence.', customerName: 'Priya S.' },
  { rating: 4, title: 'Good value', body: 'Fair making charges and quick delivery.', customerName: 'Anita R.' },
  { rating: 5, title: 'Exactly as shown', body: 'The piece looks just like the photos.', customerName: 'Kavita M.' },
] as const;

// ─── Demo customer env ────────────────────────────────────────────

export interface DemoCustomerInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** Returns null (with a reason) when the password is missing: the customer part is then skipped. */
export function parseDemoCustomerEnv(
  env: Record<string, string | undefined>,
): { ok: true; input: DemoCustomerInput } | { ok: false; reason: string } {
  const password = env.DEMO_CUSTOMER_PASSWORD ?? '';
  if (!password) return { ok: false, reason: 'DEMO_CUSTOMER_PASSWORD is not set; skipping the demo customer login' };
  if (password.length < 8) return { ok: false, reason: 'DEMO_CUSTOMER_PASSWORD must be at least 8 characters; skipping the demo customer login' };
  const email = (env.DEMO_CUSTOMER_EMAIL ?? '').trim().toLowerCase() || 'demo.customer@example.com';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: 'DEMO_CUSTOMER_EMAIL is not a valid email; skipping the demo customer login' };
  return {
    ok: true,
    input: {
      email,
      password,
      firstName: (env.DEMO_CUSTOMER_FIRST_NAME ?? '').trim() || 'Priya',
      lastName: (env.DEMO_CUSTOMER_LAST_NAME ?? '').trim() || 'Sharma',
    },
  };
}
