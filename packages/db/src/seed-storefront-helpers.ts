/**
 * Shared helpers for the demo seeds so the storefront looks populated:
 *  - a proper category tree (Gold > Ring/Necklace/.../Bracelet/Nose Pin/Anklet)
 *  - product-name/type -> category mapping
 *  - current metal rates in tenant.settings (the storefront reads
 *    settings.metalRates["<METAL>_<purity>"] in paise per 10g)
 *  - deterministic, varied stock quantities
 * Everything is idempotent (deterministic ids, upserts, merges).
 */
import type { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

export function sfId(key: string): string {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Leaf categories the storefront navigation expects (names match slugify(name) variants). */
const LEAF_CATEGORIES = [
  'Necklace', 'Ring', 'Bangle', 'Earring', 'Chain', 'Pendant',
  'Mangalsutra', 'Bracelet', 'Nose Pin', 'Anklet',
];

/** Map a product name / category label to a leaf category name. */
export function categoryNameFor(label: string): string {
  const s = label.toLowerCase();
  if (s.includes('mangalsutra')) return 'Mangalsutra';
  if (s.includes('nose pin') || s.includes('nathiya')) return 'Nose Pin';
  if (s.includes('earring')) return 'Earring';
  if (s.includes('bracelet') || s.includes('haathphool')) return 'Bracelet';
  if (s.includes('bangle') || s.includes('kada')) return 'Bangle';
  if (s.includes('anklet') || s.includes('payal')) return 'Anklet';
  if (s.includes('pendant') || s.includes('tika')) return 'Pendant';
  if (s.includes('necklace') || s.includes('choker')) return 'Necklace';
  if (s.includes('chain')) return 'Chain';
  if (s.includes('ring')) return 'Ring';
  return 'Necklace';
}

/** Ensure the Gold parent + leaf categories exist; returns name -> id. */
export async function ensureStorefrontCategories(
  prisma: PrismaClient,
  tenantId: string,
): Promise<Record<string, string>> {
  let gold = await prisma.category.findFirst({ where: { tenantId, name: 'Gold', parentId: null } });
  if (!gold) {
    gold = await prisma.category.create({
      data: { id: sfId(`cat-${tenantId}-Gold`), tenantId, name: 'Gold', description: 'Gold jewelry and ornaments', sortOrder: 1 },
    });
  }
  const map: Record<string, string> = {};
  let order = 1;
  for (const name of LEAF_CATEGORIES) {
    let c = await prisma.category.findFirst({ where: { tenantId, name, parentId: gold.id } });
    if (!c) {
      const id = sfId(`cat-fix-${tenantId}-${name}`);
      c = await prisma.category.upsert({
        where: { id },
        update: {},
        create: { id, tenantId, name, parentId: gold.id, sortOrder: order },
      });
    }
    map[name] = c.id;
    order++;
  }
  return map;
}

/** Realistic INR rates, paise per 10 grams. */
export const DEMO_METAL_RATES_PAISE_PER_10G: Record<string, number> = {
  GOLD_999: 12_400_000,
  GOLD_916: 11_360_000,
  GOLD_750: 9_300_000,
  GOLD_585: 7_254_000,
  SILVER_999: 180_000,
  PLATINUM_950: 4_500_000,
};

/** Merge current metal rates into tenant.settings (keeps other settings). */
export async function seedMetalRates(prisma: PrismaClient, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...settings,
        metalRates: DEMO_METAL_RATES_PAISE_PER_10G,
        metalRatesUpdatedAt: new Date().toISOString(),
      },
    },
  });
}

/** Deterministic varied stock: ~8% out of stock, ~17% low (1-2), rest 3-25. */
export function demoStockQty(productId: string): number {
  const r = parseInt(crypto.createHash('md5').update(productId).digest('hex').slice(0, 6), 16);
  const m = r % 12;
  if (m === 0) return 0;
  if (m === 1) return 2;
  if (m === 2) return 1;
  return 3 + (r % 23);
}

/** Make sure every product has a stock row at the given location. */
export async function ensureStockForProducts(
  prisma: PrismaClient,
  tenantId: string,
  locationId: string,
  productIds: string[],
): Promise<number> {
  let n = 0;
  for (const productId of productIds) {
    const qty = demoStockQty(productId);
    await prisma.stockItem.upsert({
      where: { tenantId_productId_locationId: { tenantId, productId, locationId } },
      update: { quantityOnHand: qty },
      create: {
        id: sfId(`stock-fix-${tenantId}-${productId}-${locationId}`),
        tenantId, productId, locationId,
        quantityOnHand: qty, reorderLevel: 3, reorderQuantity: 10,
      },
    });
    n++;
  }
  return n;
}
