/**
 * Demo catalog + demo customer seed for an EXISTING tenant.
 * ------------------------------------------------------------
 * Fills an empty tenant (e.g. one created by bootstrap-tenant) so the storefront
 * is not empty: showroom + warehouse, categories, ~31 products with absolute image
 * URLs, stock, metal rates (tenant settings AND metal_rate_history), CMS banners,
 * FAQ entries, a few reviews, and one demo customer who can sign in on the storefront.
 *
 * INSERT-ONLY and idempotent: rows that already exist are never updated or deleted;
 * a second run inserts 0 rows. The only existing row that is touched is
 * tenant.settings, and only to ADD missing metalRates keys.
 *
 * Environment:
 *   TENANT_SLUG | TENANT_ID   which tenant (one is required)
 *   IMAGE_BASE_URL            default https://shop.${DOMAIN} when DOMAIN is set,
 *                             else http://localhost:3003 (images are /images/products/*)
 *   DOMAIN                    see above
 *   DEMO_CUSTOMER_EMAIL       default demo.customer@example.com
 *   DEMO_CUSTOMER_PASSWORD    REQUIRED for the customer login (never printed, never stored
 *                             in the repo); without it only the catalog is seeded
 *   DEMO_CUSTOMER_FIRST_NAME / DEMO_CUSTOMER_LAST_NAME   default Priya / Sharma
 *   DRY_RUN=true              print what would be inserted, write nothing
 *
 * Usage:  pnpm --filter @caratflow/db seed:demo-catalog
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEMO_BANNERS,
  DEMO_FAQS,
  DEMO_PRODUCTS,
  DEMO_REVIEWS,
  DEMO_RATE_RUPEES_PER_GRAM,
  ROOT_CATEGORIES,
  SUB_CATEGORIES,
  absoluteImageUrl,
  categoryKey,
  demoHuid,
  demoId,
  demoMetalRatesPaisePer10g,
  gramsToMg,
  hasHuid,
  imageBaseUrl,
  listPricePaise,
  metalRateHistoryRow,
  parseDemoCustomerEnv,
  parseRateKey,
  planMissing,
  productDescription,
  productImageUrl,
  rupeesToPaise,
} from './seed-demo-catalog-data';
import { DEMO_AADHAAR, DEMO_PAN, DEMO_PHONE } from './seed-demo-customer';

export type Counts = Record<string, number>;

interface Ctx {
  prisma: PrismaClient;
  tenantId: string;
  dry: boolean;
  counts: Counts;
  imageBase: string;
}

function bump(ctx: Ctx, key: string, n = 1): void {
  ctx.counts[key] = (ctx.counts[key] ?? 0) + n;
}

async function seedLocations(ctx: Ctx): Promise<string> {
  const { prisma, tenantId } = ctx;
  const existing = await prisma.location.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  if (existing.length > 0) {
    return (existing.find((l) => l.locationType === 'SHOWROOM') ?? existing[0]!).id;
  }
  const showroomId = demoId(`demo-loc-showroom-${tenantId}`);
  const warehouseId = demoId(`demo-loc-warehouse-${tenantId}`);
  bump(ctx, 'locations', 2);
  if (!ctx.dry) {
    await prisma.location.create({
      data: { id: showroomId, tenantId, name: 'Main Showroom', locationType: 'SHOWROOM', city: 'Mumbai', state: 'Maharashtra', country: 'IN' },
    });
    await prisma.location.create({
      data: { id: warehouseId, tenantId, name: 'Main Warehouse', locationType: 'WAREHOUSE', city: 'Mumbai', state: 'Maharashtra', country: 'IN' },
    });
  }
  return showroomId;
}

/** Returns "root|sub" -> id and root name -> id for every wanted category (existing or new). */
async function seedCategories(ctx: Ctx): Promise<{ roots: Map<string, string>; subs: Map<string, string> }> {
  const { prisma, tenantId } = ctx;
  const all = await prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true } });
  const roots = new Map<string, string>();
  const subs = new Map<string, string>();

  const existingRoots = new Map(all.filter((c) => !c.parentId).map((c) => [categoryKey(c.name), c.id]));
  let order = 1;
  for (const r of ROOT_CATEGORIES) {
    let id = existingRoots.get(categoryKey(r.name));
    if (!id) {
      id = demoId(`demo-cat-${tenantId}-${r.name}`);
      bump(ctx, 'categories');
      if (!ctx.dry) {
        await prisma.category.create({ data: { id, tenantId, name: r.name, description: r.description, sortOrder: order } });
      }
    }
    roots.set(r.name, id);
    order++;
  }
  for (const [rootName, names] of Object.entries(SUB_CATEGORIES)) {
    const rootId = roots.get(rootName)!;
    const existingSubs = new Map(all.filter((c) => c.parentId === rootId).map((c) => [categoryKey(c.name), c.id]));
    let so = 1;
    for (const name of names) {
      let id = existingSubs.get(categoryKey(name));
      if (!id) {
        id = demoId(`demo-cat-${tenantId}-${rootName}-${name}`);
        bump(ctx, 'categories');
        if (!ctx.dry) {
          await prisma.category.create({ data: { id, tenantId, name, parentId: rootId, sortOrder: so } });
        }
      }
      subs.set(`${rootName}|${name}`, id);
      so++;
    }
  }
  return { roots, subs };
}

/** tenant.settings.metalRates (storefront price) and metal_rate_history (admin rate). */
async function seedRates(ctx: Ctx): Promise<void> {
  const { prisma, tenantId } = ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = ((tenant?.settings ?? {}) as Record<string, unknown>) ?? {};
  const have = (settings.metalRates ?? {}) as Record<string, number>;
  const wanted = demoMetalRatesPaisePer10g();
  const missing = planMissing(Object.keys(have), Object.keys(wanted), (k) => k);
  if (missing.length > 0) {
    bump(ctx, 'tenantMetalRates', missing.length);
    if (!ctx.dry) {
      const merged = { ...have };
      for (const k of missing) merged[k] = wanted[k]!;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: { ...settings, metalRates: merged, metalRatesUpdatedAt: new Date().toISOString() } },
      });
    }
  }

  // metal_rate_history is global (not tenant scoped): only seed metals that have no rate yet.
  const now = new Date();
  for (const [key, perGram] of Object.entries(DEMO_RATE_RUPEES_PER_GRAM)) {
    const { metalType, purity } = parseRateKey(key);
    const exists = await prisma.metalRateHistory.findFirst({ where: { metalType, purity }, select: { id: true } });
    if (exists) continue;
    bump(ctx, 'metalRateHistory');
    if (!ctx.dry) {
      await prisma.metalRateHistory.create({
        data: { id: demoId(`demo-rate-${key}`), ...metalRateHistoryRow(metalType, purity, perGram), source: 'MANUAL', recordedAt: now },
      });
    }
  }
}

async function seedProducts(
  ctx: Ctx,
  locationId: string,
  cats: { roots: Map<string, string>; subs: Map<string, string> },
): Promise<string[]> {
  const { prisma, tenantId } = ctx;
  const existing = await prisma.product.findMany({
    where: { tenantId, sku: { in: DEMO_PRODUCTS.map((p) => p.sku) } },
    select: { id: true, sku: true },
  });
  const idBySku = new Map(existing.map((p) => [p.sku, p.id]));
  const rates = demoMetalRatesPaisePer10g();

  const toCreate = planMissing(existing.map((p) => p.sku), DEMO_PRODUCTS, (p) => p.sku);
  for (const p of toCreate) {
    const id = demoId(`demo-prod-${tenantId}-${p.sku}`);
    idBySku.set(p.sku, id);
    bump(ctx, 'products');
    if (ctx.dry) continue;
    const metalMg = gramsToMg(p.netG);
    const making = rupeesToPaise(p.makingRupees);
    const live = p.fixedPriceRupees === undefined;
    const rate = rates[`${p.productType}_${p.purity}`] ?? 0;
    const selling = live ? listPricePaise(metalMg, making, p.wastageBps, rate) : rupeesToPaise(p.fixedPriceRupees!);
    await prisma.product.create({
      data: {
        id,
        tenantId,
        sku: p.sku,
        name: p.name,
        description: productDescription(p),
        categoryId: cats.roots.get(p.root),
        subCategoryId: cats.subs.get(`${p.root}|${p.sub}`),
        productType: p.productType,
        metalPurity: p.purity,
        metalWeightMg: metalMg,
        grossWeightMg: gramsToMg(p.grossG),
        netWeightMg: gramsToMg(p.netG),
        makingCharges: making,
        wastagePercent: p.wastageBps,
        huidNumber: hasHuid(p) ? demoHuid(p.sku) : null,
        costPricePaise: (selling * 88n) / 100n,
        sellingPricePaise: selling,
        currencyCode: 'INR',
        images: [productImageUrl(ctx.imageBase, p.file)],
        attributes: { gender: 'women', occasion: [p.occasion], demo: true },
        isActive: true,
      },
    });
  }

  // stock: only for (product, location) pairs that have no row yet
  const stockRows = await prisma.stockItem.findMany({ where: { tenantId, locationId }, select: { productId: true } });
  const missingStock = planMissing(stockRows.map((s) => s.productId), DEMO_PRODUCTS, (p) => idBySku.get(p.sku) ?? '');
  for (const p of missingStock) {
    const productId = idBySku.get(p.sku)!;
    bump(ctx, 'stockItems');
    if (ctx.dry) continue;
    await prisma.stockItem.create({
      data: {
        id: demoId(`demo-stock-${tenantId}-${productId}-${locationId}`),
        tenantId, productId, locationId,
        quantityOnHand: p.qty, reorderLevel: 3, reorderQuantity: 10,
      },
    });
  }
  return DEMO_PRODUCTS.map((p) => idBySku.get(p.sku)!);
}

async function seedCms(ctx: Ctx, productIds: string[]): Promise<void> {
  const { prisma, tenantId } = ctx;

  const banners = await prisma.banner.findMany({ where: { tenantId }, select: { title: true } });
  const newBanners = planMissing(banners.map((b) => b.title), DEMO_BANNERS, (b) => b.title);
  let order = banners.length;
  for (const b of newBanners) {
    bump(ctx, 'banners');
    if (ctx.dry) continue;
    await prisma.banner.create({
      data: {
        id: demoId(`demo-banner-${tenantId}-${b.title}`),
        tenantId, title: b.title, subtitle: b.subtitle,
        imageUrl: absoluteImageUrl(ctx.imageBase, `images/hero/${b.file}`),
        linkUrl: b.linkUrl, linkType: 'CATEGORY', position: 'HERO', displayOrder: order++, isActive: true,
      },
    });
  }

  const faqs = await prisma.faqItem.findMany({ where: { tenantId }, select: { question: true } });
  const newFaqs = planMissing(faqs.map((f) => f.question), DEMO_FAQS, (f) => f.question);
  let fo = faqs.length;
  for (const f of newFaqs) {
    bump(ctx, 'faqs');
    if (ctx.dry) continue;
    await prisma.faqItem.create({
      data: { id: demoId(`demo-faq-${tenantId}-${f.question}`), tenantId, question: f.question, answer: f.answer, category: f.category, displayOrder: fo++, isPublished: true },
    });
  }

  // reviews: first three demo products get one review each
  const targets = DEMO_REVIEWS.map((r, i) => ({ r, productId: productIds[i]! }));
  const have = await prisma.productReview.findMany({
    where: { tenantId, productId: { in: targets.map((t) => t.productId) } },
    select: { productId: true, customerName: true },
  });
  const newReviews = planMissing(have.map((h) => `${h.productId}|${h.customerName}`), targets, (t) => `${t.productId}|${t.r.customerName}`);
  for (const t of newReviews) {
    bump(ctx, 'reviews');
    if (ctx.dry) continue;
    await prisma.productReview.create({
      data: {
        id: demoId(`demo-review-${tenantId}-${t.productId}-${t.r.customerName}`),
        tenantId, productId: t.productId, customerName: t.r.customerName, rating: t.r.rating,
        title: t.r.title, body: t.r.body, isVerified: true, isPublished: true, publishedAt: new Date(),
      },
    });
  }
}

async function seedCustomer(ctx: Ctx, input: { email: string; password: string; firstName: string; lastName: string }): Promise<void> {
  const { prisma, tenantId } = ctx;
  const { email } = input;
  const authTaken = await prisma.customerAuth.findFirst({
    where: { OR: [{ email }, { phone: DEMO_PHONE }] },
    include: { customer: { select: { tenantId: true } } },
  });
  if (authTaken && authTaken.customer.tenantId !== tenantId) {
    console.warn('  demo customer: email/phone already used by another tenant; skipped');
    return;
  }
  let customer = await prisma.customer.findFirst({ where: { tenantId, OR: [{ email }, { phone: DEMO_PHONE }] } });
  const customerId = customer?.id ?? demoId(`demo-customer-${tenantId}-${email}`);
  if (!customer) {
    bump(ctx, 'customers');
    if (!ctx.dry) {
      customer = await prisma.customer.create({
        data: {
          id: customerId, tenantId, firstName: input.firstName, lastName: input.lastName, email, phone: DEMO_PHONE,
          address: '12, Linking Road, Bandra West', city: 'Mumbai', state: 'Maharashtra', country: 'IN', postalCode: '400050',
          customerType: 'RETAIL', panNumber: DEMO_PAN, aadhaarNumber: DEMO_AADHAAR,
          loyaltyPoints: 500, loyaltyTier: 'Silver',
        },
      });
    }
  }
  if (!authTaken) {
    bump(ctx, 'customerAuth');
    if (!ctx.dry) {
      await prisma.customerAuth.create({
        data: {
          id: demoId(`demo-customer-auth-${tenantId}-${email}`), customerId, email, phone: DEMO_PHONE,
          passwordHash: await bcrypt.hash(input.password, 12), // same cost as AuthB2CService
          isEmailVerified: true, isPhoneVerified: true, loginProvider: 'EMAIL',
        },
      });
    }
  }

  const addr = await prisma.customerAddress.findFirst({ where: { tenantId, customerId }, select: { id: true } });
  if (!addr) {
    bump(ctx, 'customerAddresses');
    if (!ctx.dry) {
      await prisma.customerAddress.create({
        data: {
          id: demoId(`demo-address-${tenantId}-${customerId}`), tenantId, customerId, label: 'Home',
          firstName: input.firstName, lastName: input.lastName, phone: DEMO_PHONE,
          addressLine1: '12, Linking Road', addressLine2: 'Bandra West', city: 'Mumbai', state: 'Maharashtra',
          country: 'IN', postalCode: '400050', isDefault: true,
        },
      });
    }
  }

  for (const [type, doc] of [['AADHAAR', DEMO_AADHAAR], ['PAN', DEMO_PAN]] as const) {
    const exists = await prisma.kycVerification.findFirst({
      where: { tenantId, customerId, verificationType: type, verificationStatus: 'VERIFIED' },
      select: { id: true },
    });
    if (exists) continue;
    bump(ctx, 'kycVerifications');
    if (!ctx.dry) {
      await prisma.kycVerification.create({
        data: {
          id: crypto.randomUUID(), tenantId, customerId, verificationType: type, documentNumber: doc,
          verificationStatus: 'VERIFIED', verifiedAt: new Date(), notes: 'Demo seed: fake identifier, not a real document',
        },
      });
    }
  }

  const tx = await prisma.loyaltyTransaction.findFirst({ where: { tenantId, customerId }, select: { id: true } });
  if (!tx) {
    bump(ctx, 'loyaltyTransactions');
    if (!ctx.dry) {
      await prisma.loyaltyTransaction.create({
        data: {
          id: demoId(`demo-loyalty-${tenantId}-${customerId}`), tenantId, customerId, transactionType: 'BONUS',
          points: 500, balanceAfter: 500, description: 'Welcome bonus (demo)',
        },
      });
    }
  }
}

export async function seedDemoCatalog(
  prisma: PrismaClient,
  tenantId: string,
  env: Record<string, string | undefined>,
): Promise<Counts> {
  const ctx: Ctx = {
    prisma, tenantId, dry: (env.DRY_RUN ?? '').toLowerCase() === 'true', counts: {}, imageBase: imageBaseUrl(env),
  };
  const locationId = await seedLocations(ctx);
  const cats = await seedCategories(ctx);
  await seedRates(ctx);
  const productIds = await seedProducts(ctx, locationId, cats);
  await seedCms(ctx, productIds);

  const cust = parseDemoCustomerEnv(env);
  if (cust.ok) await seedCustomer(ctx, cust.input);
  else console.warn(`  ${cust.reason}`);
  return ctx.counts;
}

function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  for (const p of [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"]*)"?\s*$/);
      if (m) process.env.DATABASE_URL = m[1];
    }
    if (process.env.DATABASE_URL) return;
  }
}

async function main() {
  loadDatabaseUrl();
  const slug = (process.env.TENANT_SLUG ?? '').trim();
  const id = (process.env.TENANT_ID ?? '').trim();
  if (!slug && !id) {
    console.error('Set TENANT_SLUG (or TENANT_ID) to the tenant to seed.');
    process.exit(1);
  }
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    const tenant = await prisma.tenant.findFirst({ where: id ? { id } : { slug }, select: { id: true, slug: true } });
    if (!tenant) throw new Error(`Tenant not found: ${id || slug}`);
    const dry = (process.env.DRY_RUN ?? '').toLowerCase() === 'true';
    const counts = await seedDemoCatalog(prisma, tenant.id, process.env);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.warn(`demo catalog seed [${tenant.slug}]${dry ? ' (DRY RUN, nothing written)' : ''}: ${total} ${dry ? 'would be ' : ''}inserted`);
    for (const [k, v] of Object.entries(counts)) console.warn(`  ${k}: ${v}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Demo catalog seed failed:', e);
    process.exit(1);
  });
}
