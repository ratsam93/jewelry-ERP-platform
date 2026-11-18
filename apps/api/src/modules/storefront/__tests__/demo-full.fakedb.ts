/**
 * In-memory stand-in for the Prisma delegates used by the full demo seed (loader + runner),
 * pre-populated like a tenant that went through bootstrap-tenant + seed-demo-catalog.
 */
import {
  DEMO_PRODUCTS, demoId, gramsToMg, listPricePaise, rupeesToPaise, demoMetalRatesPaisePer10g, hasHuid, demoHuid,
} from '../../../../../../packages/db/src/seed-demo-catalog-data';
import { loadDemoContext } from '../../../../../../packages/db/src/demo-full/load-context';
import type { DemoContext } from '../../../../../../packages/db/src/demo-full/common';

export type Row = Record<string, unknown>;
export const TENANT_ID = 'tenant-demo-1';
export const FIXED_NOW = new Date(2026, 4, 20, 15, 30);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ('in' in o) return (o.in as unknown[]).includes(row[k]);
      if ('startsWith' in o) return String(row[k] ?? '').startsWith(String(o.startsWith));
    }
    return row[k] === v;
  });
}

export interface FakeDb {
  db: object;
  store: Record<string, Row[]>;
  stats: { transactions: number; createManyCalls: number };
  failOn: { model: string | null };
}

export function makeFakeDb(tenantId = TENANT_ID): FakeDb {
  const store: Record<string, Row[]> = {};
  const stats = { transactions: 0, createManyCalls: 0 };
  const failOn = { model: null as string | null };
  const delegate = (name: string) => ({
    findMany: async (a: { where?: Row; select?: Row } = {}) => (store[name] ??= []).filter((r) => matches(r, a.where)).map((r) => ({ ...r })),
    findFirst: async (a: { where?: Row } = {}) => {
      const r = (store[name] ??= []).find((x) => matches(x, a.where));
      return r ? { ...r } : null;
    },
    createMany: async (a: { data: Row[]; skipDuplicates?: boolean }) => {
      stats.createManyCalls++;
      if (failOn.model === name) throw new Error('boom: simulated constraint failure');
      const list = (store[name] ??= []);
      let count = 0;
      for (const r of a.data) {
        if (a.skipDuplicates && r.id !== undefined && list.some((x) => x.id === r.id)) continue;
        list.push({ ...r });
        count++;
      }
      return { count };
    },
    update: async (a: { where: Row; data: Row }) => {
      const r = (store[name] ??= []).find((x) => matches(x, a.where));
      if (r) Object.assign(r, a.data);
      return r;
    },
  });
  const cache = new Map<string, unknown>();
  const db = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === '$transaction') {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          stats.transactions++;
          const snapshot = JSON.stringify(store, (_k, v) => (typeof v === 'bigint' ? `__big:${v}` : v));
          const copy = { ...store };
          try {
            return await fn(db);
          } catch (e) {
            // roll back like a real transaction
            const parsed = JSON.parse(snapshot, (_k, v) => (typeof v === 'string' && v.startsWith('__big:') ? BigInt(v.slice(6)) : v)) as Record<string, Row[]>;
            for (const k of Object.keys(store)) delete store[k];
            Object.assign(store, parsed);
            void copy;
            throw e;
          }
        };
      }
      if (typeof prop !== 'string') return undefined;
      if (!cache.has(prop)) cache.set(prop, delegate(prop));
      return cache.get(prop);
    },
  });

  // ─── tenant + admin + locations + catalog like seed-demo-catalog ───
  store.tenant = [{ id: tenantId, slug: 'techbeyond-jewellers', settings: {} }];
  store.user = [{ id: 'admin-user-1', tenantId, email: 'admin@example.com', createdAt: new Date(2026, 0, 1) }];
  const showroom = demoId(`demo-loc-showroom-${tenantId}`);
  const warehouse = demoId(`demo-loc-warehouse-${tenantId}`);
  store.location = [
    { id: showroom, tenantId, name: 'Main Showroom', locationType: 'SHOWROOM', city: 'Mumbai', state: 'Maharashtra' },
    { id: warehouse, tenantId, name: 'Main Warehouse', locationType: 'WAREHOUSE', city: 'Mumbai', state: 'Maharashtra' },
  ];
  const rates = demoMetalRatesPaisePer10g();
  store.product = [];
  store.stockItem = [];
  for (const p of DEMO_PRODUCTS) {
    const id = demoId(`demo-prod-${tenantId}-${p.sku}`);
    const metalMg = gramsToMg(p.netG);
    const making = rupeesToPaise(p.makingRupees);
    const selling = p.fixedPriceRupees === undefined
      ? listPricePaise(metalMg, making, p.wastageBps, rates[`${p.productType}_${p.purity}`] ?? 0)
      : rupeesToPaise(p.fixedPriceRupees);
    store.product.push({
      id, tenantId, sku: p.sku, name: p.name, productType: p.productType, metalPurity: p.purity, metalWeightMg: metalMg,
      grossWeightMg: gramsToMg(p.grossG), netWeightMg: metalMg, makingCharges: making, wastagePercent: p.wastageBps,
      huidNumber: hasHuid(p) ? demoHuid(p.sku) : null, costPricePaise: (selling * 88n) / 100n, sellingPricePaise: selling,
    });
    store.stockItem.push({ id: demoId(`demo-stock-${tenantId}-${id}-${showroom}`), tenantId, productId: id, locationId: showroom, quantityOnHand: p.qty });
  }
  store.customer = [{ id: 'priya-1', tenantId, firstName: 'Priya', lastName: 'Sharma', email: 'demo.customer@example.com', phone: '+919820000001', city: 'Mumbai', state: 'Maharashtra' }];
  store.permission = [
    { id: 'p1', module: 'retail', resource: 'sale', action: 'read' },
    { id: 'p2', module: 'retail', resource: 'sale', action: 'create' },
  ];
  return { db, store, stats, failOn };
}

export async function makeCtx(overrides: { staffPasswordHash?: string | null } = {}): Promise<DemoContext> {
  const { db } = makeFakeDb();
  return loadDemoContext(db, { slug: 'techbeyond-jewellers', now: FIXED_NOW, env: { DOMAIN: 'erp.example.com' }, ...overrides });
}
