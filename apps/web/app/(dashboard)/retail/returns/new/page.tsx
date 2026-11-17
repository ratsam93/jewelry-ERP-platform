'use client';

import { Suspense, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { formatPaise, humanizeServerError } from '@/lib/pos-sale';
import {
  buildReturnInput,
  returnUnitBreakdown,
  unitRefundPaise,
  type ReturnLineSelection,
  type ReturnSourceLine,
} from '@/lib/retail-forms';
import { Field, inputClass } from '@/features/retail/RetailFormParts';

interface SaleLine {
  id: string;
  productId?: string | null;
  description?: string;
  quantity: number;
  unitPricePaise?: unknown;
  discountPaise?: unknown;
  lineTotalPaise: unknown;
}
interface SaleView {
  id: string;
  saleNumber?: string;
  status: string;
  locationId: string;
  customerId?: string | null;
  lineItems?: SaleLine[];
}

const REFUND_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'STORE_CREDIT', label: 'Store credit' },
];

function SalePicker() {
  const [search, setSearch] = useState('');
  const query = trpc.retail.listSales.useQuery({
    filters: { search: search || undefined },
    pagination: { page: 1, limit: 10, sortOrder: 'desc' },
  });
  const items = ((query.data?.items as unknown as Array<Record<string, unknown>>) ?? []).filter(
    (s) => s.status === 'COMPLETED' || s.status === 'PARTIALLY_RETURNED',
  );
  return (
    <div className="max-w-2xl space-y-3 rounded-lg border p-5">
      <p className="text-sm text-muted-foreground">Choose the sale this return is against.</p>
      <input
        type="text"
        aria-label="Search sales"
        className={inputClass}
        placeholder="Search by sale number..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="divide-y rounded-md border">
        {query.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading...</p>}
        {!query.isLoading && items.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No returnable sales found.</p>
        )}
        {items.map((s) => (
          <Link
            key={s.id as string}
            href={`/retail/returns/new?saleId=${s.id as string}`}
            className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent"
          >
            <span className="font-mono">{(s.saleNumber as string) ?? (s.id as string)}</span>
            <span>{formatPaise(s.totalPaise)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReturnForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const saleQuery = trpc.retail.getSale.useQuery({ saleId });
  const createMut = trpc.retail.createReturn.useMutation();
  const [selection, setSelection] = useState<Record<string, ReturnLineSelection | undefined>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [errors, setErrors] = useState<string[]>([]);

  const sale = saleQuery.data as unknown as SaleView | undefined;
  const lines: ReturnSourceLine[] = useMemo(
    () =>
      (sale?.lineItems ?? []).map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitRefundPaise: unitRefundPaise(l.lineTotalPaise, l.quantity),
      })),
    [sale],
  );
  const preview = sale
    ? buildReturnInput({
        originalSaleId: sale.id,
        locationId: sale.locationId,
        customerId: sale.customerId,
        reason: 'preview',
        refundMethod,
        lines,
        selection,
      })
    : null;

  if (saleQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading sale...</p>;
  if (saleQuery.isError || !sale) {
    return (
      <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        We could not load that sale. <Link href="/retail/returns/new" className="underline">Choose another sale</Link>
      </p>
    );
  }
  const eligible = sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_RETURNED';

  const setLine = (id: string, patch: Partial<ReturnLineSelection>) =>
    setSelection((prev) => ({ ...prev, [id]: { quantity: 0, reason: '', ...prev[id], ...patch } }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const built = buildReturnInput({
      originalSaleId: sale.id,
      locationId: sale.locationId,
      customerId: sale.customerId,
      reason,
      refundMethod,
      lines,
      selection,
    });
    setErrors(built.errors);
    if (!built.input) return;
    try {
      const created = (await createMut.mutateAsync(built.input as never)) as { id?: string } | undefined;
      router.push(created?.id ? `/retail/returns/${created.id}` : '/retail/returns');
    } catch {
      // shown via createMut.error
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-3xl space-y-4 rounded-lg border p-5">
      <p className="text-sm">
        Return against sale <span className="font-mono font-medium">{sale.saleNumber ?? sale.id}</span>
      </p>
      {!eligible && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This sale is {sale.status.toLowerCase().replace('_', ' ')} and cannot be returned.
        </p>
      )}
      {createMut.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {humanizeServerError(createMut.error.message, 'Could not create the return.')}
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="list-disc space-y-0.5 rounded border border-red-300 bg-red-50 py-2 pl-7 pr-3 text-sm text-red-700">
          {errors.map((er) => (
            <li key={er}>{er}</li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_0.8fr_1fr_1.4fr] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
          <span>Item</span>
          <span>Return qty</span>
          <span>Refund</span>
          <span>Item reason</span>
        </div>
        {(sale.lineItems ?? []).map((l, idx) => {
          const src = lines[idx];
          const sel = selection[l.id];
          const unit = returnUnitBreakdown(l);
          return (
            <div key={l.id} className="grid grid-cols-[2fr_0.8fr_1fr_1.4fr] items-center gap-3 border-b px-3 py-2 text-sm last:border-0">
              <span>
                {l.description ?? 'Item'}
                <span className="block text-xs text-muted-foreground">
                  Sold: {l.quantity} at {formatPaise(unit.exTaxUnitPaise)} each (ex-tax)
                </span>
                <span className="block text-xs text-muted-foreground">
                  Refund per unit incl. GST: {formatPaise(unit.refundPerUnitPaise)} (GST {formatPaise(unit.gstPerUnitPaise)})
                </span>
              </span>
              <select
                aria-label={`Return quantity for ${l.description ?? 'item'}`}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={sel?.quantity ?? 0}
                onChange={(e) => setLine(l.id, { quantity: Number(e.target.value) })}
              >
                {Array.from({ length: l.quantity + 1 }, (_, q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <span className="font-medium">{formatPaise(src.unitRefundPaise * (sel?.quantity ?? 0))}</span>
              <input
                type="text"
                aria-label={`Reason for ${l.description ?? 'item'}`}
                className={inputClass}
                value={sel?.reason ?? ''}
                onChange={(e) => setLine(l.id, { reason: e.target.value })}
                placeholder="Optional"
              />
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Return reason *">
          <input type="text" aria-label="Return reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective, size issue" />
        </Field>
        <Field label="Refund method">
          <select aria-label="Refund method" className={`${inputClass} bg-background`} value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
            {REFUND_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <p className="text-sm">
          Refund total: <span className="text-lg font-bold">{formatPaise(preview?.refundPaise ?? 0)}</span>
        </p>
        <div className="flex items-center gap-3">
          <Link href={`/retail/sales/${sale.id}`} className="text-sm text-muted-foreground hover:underline">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMut.isPending || !eligible}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Create return'}
          </button>
        </div>
      </div>
    </form>
  );
}

function NewReturnContent() {
  const saleId = useSearchParams()?.get('saleId') ?? '';
  return saleId ? <ReturnForm saleId={saleId} /> : <SalePicker />;
}

export default function NewReturnPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New Return"
        description="Return items from a completed sale."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Retail', href: '/retail' },
          { label: 'Returns', href: '/retail/returns' },
          { label: 'New' },
        ]}
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <NewReturnContent />
      </Suspense>
    </div>
  );
}
