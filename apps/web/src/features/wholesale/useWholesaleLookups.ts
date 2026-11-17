'use client';

import { trpc } from '@/lib/trpc';
import { branchOptionLabels, dedupeBranches, type PosBranch } from '@/lib/pos-location';
import type { PickOption } from './PurchaseOrderForm';

type Rec = Record<string, unknown>;
const items = (d: unknown): Rec[] => ((d as { items?: Rec[] } | undefined)?.items ?? []) as Rec[];

/** Real suppliers / locations / products / customers for the wholesale create forms. */
export function useWholesaleLookups(opts: { suppliers?: boolean; customers?: boolean; products?: boolean } = {}) {
  const { suppliers = true, customers = false, products = true } = opts;
  const supplierQ = trpc.wholesale.listSuppliers.useQuery(
    { filters: { isActive: true }, pagination: { page: 1, limit: 100, sortOrder: 'asc' } },
    { enabled: suppliers },
  );
  const branchQ = trpc.platform.branches.list.useQuery({ includeInactive: false });
  const productQ = trpc.storefront.catalog.list.useQuery(
    { page: 1, limit: 100, sortOrder: 'asc' } as never,
    { enabled: products },
  );
  const customerQ = trpc.crm.customerList.useQuery(
    { page: 1, limit: 100, sortOrder: 'asc' } as never,
    { enabled: customers },
  );

  const branches = dedupeBranches((branchQ.data as PosBranch[] | undefined) ?? []);
  const labels = branchOptionLabels(branches);

  const supplierOptions: PickOption[] = items(supplierQ.data).map((s) => ({
    id: s.id as string,
    label: String(s.name ?? s.id),
  }));
  const locationOptions: PickOption[] = branches.map((b) => ({ id: b.id, label: labels.get(b.id) ?? b.name }));
  const productOptions: PickOption[] = items(productQ.data).map((p) => ({
    id: p.id as string,
    label: p.sku ? `${p.name} (${p.sku})` : String(p.name ?? p.id),
  }));
  const customerOptions: PickOption[] = items(customerQ.data).map((c) => ({
    id: c.id as string,
    label: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || String(c.phone ?? c.id),
  }));

  return { supplierOptions, locationOptions, productOptions, customerOptions };
}
