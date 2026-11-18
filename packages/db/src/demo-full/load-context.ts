/**
 * Builds the DemoContext for the full demo seed by READING the database (never writing).
 *
 * Idempotency rule: everything a planner derives randomness / row choices from must be
 * the same on the second run. So the context only uses data the catalog seed created
 * (TB-* products with their catalog stock quantities, the catalog demo customer, the
 * catalog rate rows) and never data that earlier demo-full runs inserted.
 */
import { DEMO_PRODUCTS, DEMO_RATE_RUPEES_PER_GRAM, DEMO_SKU_PREFIX, demoId, imageBaseUrl, parseRateKey } from '../seed-demo-catalog-data';
import { DEMO_EMAIL, DEMO_PHONE } from '../seed-demo-customer';
import {
  eid, type CustomerRef, type DemoContext, type LocationInfo, type ProductInfo, type Row,
} from './common';

/** Minimal read surface of a Prisma delegate (real PrismaClient and the test fake both satisfy it). */
export interface ReadDelegate {
  findFirst(args: Record<string, unknown>): Promise<Row | null>;
  findMany(args: Record<string, unknown>): Promise<Row[]>;
}

export type Db = object;

export function delegateOf<T = ReadDelegate>(db: Db, model: string): T {
  const d = (db as Record<string, unknown>)[model];
  if (!d) throw new Error(`Unknown Prisma model "${model}" (is the Prisma client generated for this schema?)`);
  return d as T;
}

export class DemoSeedRefusal extends Error {}

export interface LoadOptions {
  tenantId?: string;
  slug?: string;
  now: Date;
  env: Record<string, string | undefined>;
  staffPasswordHash?: string | null;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : d);
const big = (v: unknown): bigint => (typeof v === 'bigint' ? v : typeof v === 'number' ? BigInt(v) : 0n);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

function locInfo(r: Row): LocationInfo {
  return { id: str(r.id), name: str(r.name), city: str(r.city, 'Mumbai'), state: str(r.state, 'Maharashtra') };
}

export async function loadDemoContext(db: Db, opts: LoadOptions): Promise<DemoContext> {
  const where = opts.tenantId ? { id: opts.tenantId } : { slug: opts.slug };
  const tenant = await delegateOf(db, 'tenant').findFirst({ where, select: { id: true, slug: true } });
  if (!tenant) throw new DemoSeedRefusal(`Tenant not found: ${opts.tenantId || opts.slug}. Create it first with bootstrap-tenant.`);
  const tenantId = str(tenant.id);

  // ─── catalog (seed-demo-catalog) must exist ───────────────────────
  const productRows = await delegateOf(db, 'product').findMany({
    where: { tenantId, sku: { startsWith: DEMO_SKU_PREFIX } },
  });
  const locations = await delegateOf(db, 'location').findMany({ where: { tenantId } });
  const showroomRow = locations.find((l) => l.locationType === 'SHOWROOM') ?? null;
  if (productRows.length === 0 || !showroomRow) {
    throw new DemoSeedRefusal(
      'The demo catalog is missing (no TB-* products / showroom for this tenant). Run seed-demo-catalog first.',
    );
  }
  const showroom = locInfo(showroomRow);

  const adminRow = await delegateOf(db, 'user').findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  if (!adminUserId(adminRow)) throw new DemoSeedRefusal('The tenant has no user. Run bootstrap-tenant first.');

  // ─── locations (warehouse / workshop may need creating) ───────────
  const base = { tenantId };
  const newLocations: Row[] = [];
  const warehouseRow = locations.find((l) => l.locationType === 'WAREHOUSE') ?? null;
  const workshopRow = locations.find((l) => l.locationType === 'WORKSHOP') ?? null;
  let warehouse: LocationInfo;
  let workshop: LocationInfo;
  if (warehouseRow) warehouse = locInfo(warehouseRow);
  else {
    warehouse = { id: eid(base, 'location', 'warehouse'), name: 'Main Warehouse', city: showroom.city, state: showroom.state };
    newLocations.push({ id: warehouse.id, tenantId, name: warehouse.name, locationType: 'WAREHOUSE', city: warehouse.city, state: warehouse.state, country: 'IN' });
  }
  if (workshopRow) workshop = locInfo(workshopRow);
  else {
    workshop = { id: eid(base, 'location', 'workshop'), name: 'Karigar Workshop', city: showroom.city, state: showroom.state };
    newLocations.push({ id: workshop.id, tenantId, name: workshop.name, locationType: 'WORKSHOP', city: workshop.city, state: workshop.state, country: 'IN' });
  }

  // ─── products with their immutable catalog stock baseline ─────────
  const stockRows = await delegateOf(db, 'stockItem').findMany({ where: { tenantId, locationId: showroom.id } });
  const stockByProduct = new Map(stockRows.map((s) => [str(s.productId), s]));
  const specBySku = new Map(DEMO_PRODUCTS.map((p) => [p.sku, p]));
  const products: ProductInfo[] = productRows
    .map((p): ProductInfo => {
      const spec = specBySku.get(str(p.sku));
      const type = str(p.productType);
      const purity = p.metalPurity == null ? null : num(p.metalPurity);
      const stock = stockByProduct.get(str(p.id));
      const rateKnown = DEMO_RATE_RUPEES_PER_GRAM[`${type}_${purity ?? 0}`] !== undefined;
      return {
        id: str(p.id),
        sku: str(p.sku),
        name: str(p.name),
        productType: type,
        purity,
        metalWeightMg: big(p.metalWeightMg),
        netWeightMg: big(p.netWeightMg),
        grossWeightMg: big(p.grossWeightMg),
        makingPaise: big(p.makingCharges),
        wastageBps: num(p.wastagePercent),
        sellingPaise: big(p.sellingPricePaise),
        costPaise: big(p.costPricePaise),
        fixedPrice: spec ? spec.fixedPriceRupees !== undefined : !rateKnown,
        // The catalog quantity (immutable), NOT the live quantity: sales decrement the live stock,
        // and planning from it would change the plan (and its row ids) on a second run.
        qty0: spec ? spec.qty : 0,
        huid: p.huidNumber == null ? null : str(p.huidNumber),
        showroomStockId: stock ? str(stock.id) : null,
      };
    })
    .sort((a, b) => a.sku.localeCompare(b.sku));

  // ─── customers: only the catalog demo customer (stable baseline) ──
  const custRows = await delegateOf(db, 'customer').findMany({
    where: { tenantId, OR: [{ email: DEMO_EMAIL }, { phone: DEMO_PHONE }] },
  });
  const existingCustomers: CustomerRef[] = custRows.map((c) => ({
    id: str(c.id), firstName: str(c.firstName), lastName: str(c.lastName),
    state: str(c.state), city: str(c.city), phone: c.phone == null ? null : str(c.phone),
  }));

  // ─── ledger accounts, permissions, hallmark centers ───────────────
  const accountRows = await delegateOf(db, 'account').findMany({ where: { tenantId } });
  const accountIdByCode: Record<string, string> = {};
  for (const a of accountRows) accountIdByCode[str(a.accountCode)] = str(a.id);

  const permRows = await delegateOf(db, 'permission').findMany({});
  const permissionStrings = permRows.map((p) => `${str(p.module)}.${str(p.resource)}.${str(p.action)}`).sort();

  const hcRows = await delegateOf(db, 'hallmarkCenter').findMany({});
  const hallmarkCenterIds: Record<string, string> = {};
  for (const h of hcRows) hallmarkCenterIds[str(h.centerCode)] = str(h.id);

  // ─── metal rate history: stable anchor = the catalog's own rate row per key ──
  const earliestRateAt: Record<string, Date | null> = {};
  for (const key of Object.keys(DEMO_RATE_RUPEES_PER_GRAM)) {
    const { metalType, purity } = parseRateKey(key);
    const anchor = await delegateOf(db, 'metalRateHistory').findFirst({ where: { id: demoId(`demo-rate-${key}`), metalType, purity } });
    earliestRateAt[key] = anchor?.recordedAt instanceof Date ? anchor.recordedAt : null;
  }

  return {
    tenantId,
    slug: str(tenant.slug),
    now: opts.now,
    adminUserId: adminUserId(adminRow)!,
    showroom,
    warehouse,
    workshop,
    newLocations,
    products,
    existingCustomers,
    accountIdByCode,
    earliestRateAt,
    permissionStrings,
    imageBase: imageBaseUrl(opts.env),
    staffPasswordHash: opts.staffPasswordHash ?? null,
    hallmarkCenterIds,
  };
}

function adminUserId(r: Row | null): string | null {
  return r && typeof r.id === 'string' ? r.id : null;
}
