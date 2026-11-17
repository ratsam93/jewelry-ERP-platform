'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, getStatusVariant, EmptyState } from '@caratflow/ui';
import { ShoppingCart } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import { formatPaise, formatDateTime } from '@/components/format';
import {
  EMPTY_ORDER_FILTERS, ORDER_STATUSES, buildOrderFilters, orderDateRangeError, type OrderFilterValues,
} from '@/lib/ecommerce-forms';

const INPUT = 'h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function EcommerceOrdersPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<OrderFilterValues>(EMPTY_ORDER_FILTERS);
  const rangeError = orderDateRangeError(filters);
  const applied = rangeError ? buildOrderFilters({ ...filters, dateFrom: '', dateTo: '' }) : buildOrderFilters(filters);
  const hasFilters = Object.keys(applied).length > 0;
  const { data, isLoading } = trpc.ecommerce.listOrders.useQuery({
    filters: applied,
    pagination: { page, limit: 20, sortOrder: 'desc' },
  } as never);
  const d = data as { items?: Array<Record<string, unknown>>; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean } | undefined;
  const items = d?.items ?? [];

  const update = (patch: Partial<OrderFilterValues>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Online Orders" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'E-Commerce', href: '/ecommerce' },
        { label: 'Orders' },
      ]} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Search</span>
          <input
            type="search"
            aria-label="Search orders"
            placeholder="Order number or customer"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className={`${INPUT} block w-64 text-foreground`}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>Status</span>
          <select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })} className={`${INPUT} block text-foreground`}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>From</span>
          <input type="date" aria-label="From date" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} className={`${INPUT} block text-foreground`} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>To</span>
          <input type="date" aria-label="To date" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })} className={`${INPUT} block text-foreground`} />
        </label>
        {(hasFilters || filters.dateFrom || filters.dateTo) && (
          <button type="button" onClick={() => update(EMPTY_ORDER_FILTERS)} className="h-9 rounded-md border px-3 text-sm hover:bg-accent">Clear</button>
        )}
      </div>
      {rangeError && <p role="alert" className="text-sm text-red-600">{rangeError}</p>}
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Order #</span>
          <span>Customer</span>
          <span>Total</span>
          <span>Status</span>
          <span>Placed</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="h-8 w-8" />} title={hasFilters ? 'No orders match these filters' : 'No orders'} />
        ) : (
          <div className="divide-y">
            {items.map((o) => (
              <Link key={o.id as string} href={`/ecommerce/orders/${o.id}`} className="grid grid-cols-[1.2fr_1.4fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm hover:bg-accent">
                <span className="font-mono font-medium">{(o.orderNumber as string) ?? (o.externalOrderId as string) ?? '-'}</span>
                <span>{(o.customerName as string) || (o.customerEmail as string) || (o.customerPhone as string) || '-'}</span>
                <span className="font-semibold">{formatPaise(o.totalPaise)}</span>
                <StatusBadge label={(o.status as string) ?? '-'} variant={getStatusVariant(o.status as string)} dot={false} />
                <span className="text-muted-foreground">{formatDateTime(o.placedAt ?? o.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {d && (d.totalPages ?? 0) > 0 && (
        <PaginationControls page={d.page ?? 1} totalPages={d.totalPages ?? 0} hasPrevious={d.hasPrevious ?? false} hasNext={d.hasNext ?? false} onChange={setPage} />
      )}
    </div>
  );
}
