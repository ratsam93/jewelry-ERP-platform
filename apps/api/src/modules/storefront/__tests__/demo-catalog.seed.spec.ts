import { describe, it, expect } from 'vitest';
import { DEMO_FEATURED_SKUS } from '../../../../../../packages/db/src/seed-demo-catalog-data';
import { seedDemoCatalog, splitCounts } from '../../../../../../packages/db/src/seed-demo-catalog';

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the Prisma delegates the seed uses. */
function fakePrisma(tenantId: string) {
  const store: Record<string, Row[]> = {};
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Row[]).some((w) => match(row, w));
      if (v && typeof v === 'object' && 'in' in (v as Row)) return ((v as { in: unknown[] }).in).includes(row[k]);
      return row[k] === v;
    });
  const delegate = (name: string) => ({
    findMany: async (a: { where?: Row } = {}) => (store[name] ??= []).filter((r) => match(r, a.where)),
    findFirst: async (a: { where?: Row } = {}) => {
      const r = (store[name] ??= []).find((x) => match(x, a.where));
      if (r && name === 'customerAuth') {
        const c = (store.customer ??= []).find((x) => x.id === r.customerId);
        return { ...r, customer: { tenantId: c?.tenantId } };
      }
      return r ?? null;
    },
    create: async (a: { data: Row }) => {
      (store[name] ??= []).push({ ...a.data });
      return a.data;
    },
    update: async (a: { where: Row; data: Row }) => {
      const r = (store[name] ??= []).find((x) => match(x, a.where));
      if (r) Object.assign(r, a.data);
      return r;
    },
  });
  const tenant: Row = { id: tenantId, settings: { weightUnit: 'g' } };
  const names = ['location', 'category', 'metalRateHistory', 'product', 'stockItem', 'banner', 'faqItem', 'productReview',
    'customerAuth', 'customer', 'customerAddress', 'kycVerification', 'loyaltyTransaction'];
  const prisma: Record<string, unknown> = {
    tenant: {
      findUnique: async () => ({ settings: tenant.settings }),
      update: async (a: { data: Row }) => { Object.assign(tenant, a.data); return tenant; },
    },
  };
  for (const n of names) prisma[n] = delegate(n);
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma: prisma as never, store, tenant };
}

const total = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
const ENV = { DOMAIN: 'erp.example.com', DEMO_CUSTOMER_PASSWORD: 'Sup3r-secret-pw' };

describe('seedDemoCatalog (in-memory)', () => {
  it('seeds an empty tenant, then a second run inserts nothing', async () => {
    const { prisma, store, tenant } = fakePrisma('t1');
    const first = await seedDemoCatalog(prisma, 't1', ENV);
    expect(first.locations).toBe(2);
    expect(first.products).toBeGreaterThanOrEqual(24);
    expect(first.stockItems).toBe(first.products);
    expect(first.banners).toBe(3);
    expect(first.customers).toBe(1);
    expect(first.customerAuth).toBe(1);
    expect((tenant.settings as { metalRates: Record<string, number> }).metalRates.GOLD_916).toBe(6_700_000);
    const img = (store.product![0]!.images as string[])[0];
    expect(img).toMatch(/^https:\/\/shop\.erp\.example\.com\/images\/products\/.+\.webp$/);
    const auth = store.customerAuth![0]!;
    expect(String(auth.passwordHash)).not.toContain('Sup3r-secret-pw');
    expect(auth.isEmailVerified).toBe(true);

    const second = await seedDemoCatalog(prisma, 't1', ENV);
    expect(total(second)).toBe(0);
  });

  it('never touches existing data and skips the customer without a password', async () => {
    const { prisma, store } = fakePrisma('t2');
    store.location = [{ id: 'L1', tenantId: 't2', name: 'Old', locationType: 'SHOWROOM' }];
    store.category = [{ id: 'C1', tenantId: 't2', name: 'Gold', parentId: null }];
    const c = await seedDemoCatalog(prisma, 't2', { DOMAIN: 'x.com' });
    expect(c.locations).toBeUndefined();
    expect(c.customers).toBeUndefined();
    expect(store.location).toHaveLength(1);
    expect(store.category!.filter((r) => r.name === 'Gold')).toHaveLength(1);
    expect(store.stockItem!.every((s) => s.locationId === 'L1')).toBe(true);
  });

  it('dry run writes nothing but reports the plan', async () => {
    const { prisma, store } = fakePrisma('t3');
    const c = await seedDemoCatalog(prisma, 't3', { ...ENV, DRY_RUN: 'true' });
    expect(c.products).toBeGreaterThanOrEqual(24);
    expect(store.product ?? []).toHaveLength(0);
    expect(store.customer ?? []).toHaveLength(0);
  });

  it('fresh run flags only the planned featured set and writes storefrontBanners, keeping other settings', async () => {
    const { prisma, store, tenant } = fakePrisma('t4');
    await seedDemoCatalog(prisma, 't4', ENV);
    const featured = store.product!.filter((p) => (p.attributes as Row).featured === true).map((p) => p.sku);
    expect(featured.sort()).toEqual([...DEMO_FEATURED_SKUS].sort());
    expect(DEMO_FEATURED_SKUS.length).toBe(8);
    const rest = store.product!.filter((p) => !DEMO_FEATURED_SKUS.includes(p.sku as string));
    expect(rest.every((p) => !('featured' in (p.attributes as Row)))).toBe(true);
    const s = tenant.settings as Record<string, unknown>;
    expect(s.weightUnit).toBe('g');
    expect(s.metalRates).toBeDefined();
    const banners = s.storefrontBanners as Array<{ imageUrl: string; linkUrl: string; title: string; sortOrder: number }>;
    expect(banners).toHaveLength(3);
    expect(banners[0]!.imageUrl).toMatch(/^https:\/\/shop\.erp\.example\.com\/images\/hero\/.+\.webp$/);
    expect(banners[0]!.linkUrl).toBe('/category/gold');
  });

  it('repairs an already-seeded tenant once, without clobbering attributes or settings, then reports 0 changes', async () => {
    const { prisma, store, tenant } = fakePrisma('t5');
    await seedDemoCatalog(prisma, 't5', ENV);
    // simulate the old seed: no featured flags, no storefrontBanners, plus an admin-set flag and extra key
    for (const p of store.product!) delete (p.attributes as Row).featured;
    const keep = store.product!.find((p) => p.sku === DEMO_FEATURED_SKUS[0])!;
    (keep.attributes as Row).featured = false; // explicit choice is respected
    const other = store.product!.find((p) => p.sku === DEMO_FEATURED_SKUS[1])!;
    (other.attributes as Row).custom = 'x';
    delete (tenant.settings as Row).storefrontBanners;
    (tenant.settings as Row).theme = 'dark';
    const productsBefore = store.product!.length;

    const dry = splitCounts(await seedDemoCatalog(prisma, 't5', { ...ENV, DRY_RUN: 'true' }));
    expect(dry.updated).toEqual({ featuredFlagsUpdated: 7, storefrontBannersUpdated: 1 });
    expect((other.attributes as Row).featured).toBeUndefined();

    const fix = splitCounts(await seedDemoCatalog(prisma, 't5', ENV));
    expect(total(fix.inserted)).toBe(0);
    expect(fix.updated).toEqual({ featuredFlagsUpdated: 7, storefrontBannersUpdated: 1 });
    expect(store.product).toHaveLength(productsBefore);
    expect((keep.attributes as Row).featured).toBe(false);
    expect(other.attributes).toMatchObject({ featured: true, custom: 'x', demo: true, gender: 'women' });
    expect((tenant.settings as Row).theme).toBe('dark');
    expect(((tenant.settings as Row).storefrontBanners as unknown[]).length).toBe(3);

    expect(total(await seedDemoCatalog(prisma, 't5', ENV))).toBe(0);
  });

  it('does not overwrite an existing non-empty storefrontBanners setting', async () => {
    const { prisma, tenant } = fakePrisma('t6');
    (tenant.settings as Row).storefrontBanners = [{ imageUrl: 'https://x/y.png' }];
    await seedDemoCatalog(prisma, 't6', ENV);
    expect((tenant.settings as Row).storefrontBanners).toEqual([{ imageUrl: 'https://x/y.png' }]);
  });
});
