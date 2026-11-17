'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { formatPaise, formatDateTime } from '@/components/format';
import { orderActionsFor, orderAmountLines, orderPaymentRows, formatServerError, type OrderAction } from '@/lib/ecommerce-forms';

export default function EcommerceOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  const { data, isLoading, error, refetch } = trpc.ecommerce.getOrder.useQuery({ orderId }, { enabled: Boolean(orderId) });

  const statusMut = trpc.ecommerce.updateOrderStatus.useMutation();
  const cancelMut = trpc.ecommerce.cancelOrder.useMutation();
  const refundMut = trpc.ecommerce.refundOrder.useMutation();
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = statusMut.isPending || cancelMut.isPending || refundMut.isPending;

  const runAction = async (a: OrderAction) => {
    // Cancelling asks for a reason, which doubles as the confirmation.
    if (a.kind !== 'cancel' && !window.confirm(a.confirm)) return;
    setActionError(null);
    try {
      if (a.kind === 'cancel') {
        const reason = (window.prompt('Cancel this order? Enter the reason (required):') ?? '').trim();
        if (!reason) {
          setActionError('A cancel reason is required.');
          return;
        }
        await cancelMut.mutateAsync({ orderId, reason } as never);
      } else if (a.kind === 'refund') {
        await refundMut.mutateAsync({ orderId } as never);
      } else {
        await statusMut.mutateAsync({ orderId, status: a.status } as never);
      }
      void refetch();
    } catch (e) {
      setActionError(formatServerError(e));
    }
  };

  const state = renderDetailState({
    isLoading, error, data, entity: 'Order', backHref: '/ecommerce/orders', onRetry: () => refetch(),
  });
  if (state) return state;
  const o: Record<string, unknown> = (data as unknown) as Record<string, unknown>;
  const items = (o.items as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={(o.orderNumber as string) ?? (o.externalOrderId as string) ?? 'Order'} breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'E-Commerce', href: '/ecommerce' },
        { label: 'Orders', href: '/ecommerce/orders' },
        { label: (o.orderNumber as string) ?? '' },
      ]} actions={
        <div className="flex flex-wrap items-center gap-2">
          {orderActionsFor(String(o.status ?? '')).map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => void runAction(a)}
              disabled={busy}
              className={a.kind === 'cancel' ? 'h-9 rounded-md border border-red-300 px-4 text-sm text-red-700 disabled:opacity-50' : 'h-9 rounded-md border px-4 text-sm hover:bg-accent disabled:opacity-50'}
            >
              {a.label}
            </button>
          ))}
          <StatusBadge label={(o.status as string) ?? '-'} variant={getStatusVariant(o.status as string)} />
        </div>
      } />
      {actionError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Customer</p><p className="text-sm font-medium mt-1">{(o.customerName as string) || (o.customerEmail as string) || (o.customerPhone as string) || '-'}</p>{[o.customerPhone, o.customerEmail].filter(Boolean).map((v) => <p key={String(v)} className="text-xs text-muted-foreground">{String(v)}</p>)}</div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Placed</p><p className="text-sm font-medium mt-1">{formatDateTime(o.placedAt ?? o.createdAt)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold mt-1">{formatPaise(o.totalPaise)}</p></div>
      </div>
      <section aria-labelledby="order-payment">
        <h2 id="order-payment" className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payment</h2>
        <div className="rounded-lg border">
          {orderPaymentRows(o).length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">No payment record for this order yet.</div>
          ) : (
            <div className="divide-y">
              {orderPaymentRows(o).map((p) => (
                <div key={p.id} className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
                  <span><span className="block text-xs text-muted-foreground">Method</span>{p.method}</span>
                  <span><span className="block text-xs text-muted-foreground">Status</span>{p.status}</span>
                  <span><span className="block text-xs text-muted-foreground">Amount</span><span className="font-semibold">{formatPaise(p.amountPaise)}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Items</h2>
        <div className="rounded-lg border">
          {items.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No items</div>
          ) : (
            <div className="divide-y">
              <div className="grid grid-cols-[2fr_0.6fr_1fr_1fr] gap-4 bg-muted/50 px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
                <span>Item</span>
                <span>Qty</span>
                <span>Unit price</span>
                <span>Total</span>
              </div>
              {items.map((i, idx) => (
                <div key={(i.id as string) ?? idx} className="grid grid-cols-[2fr_0.6fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <span>{(i.title as string) ?? (((i.product as { name?: string })?.name)) ?? '-'}</span>
                  <span>{String(i.quantity ?? 0)}</span>
                  <span>{formatPaise(i.unitPricePaise)}</span>
                  <span className="font-semibold">{formatPaise(i.totalPaise)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {orderAmountLines(o).length > 0 && (
          <dl className="ml-auto mt-3 max-w-xs space-y-1 text-sm">
            {orderAmountLines(o).map((l) => (
              <div key={l.label} className="flex justify-between">
                <dt className="text-muted-foreground">{l.label}</dt>
                <dd>{l.negative ? '-' : ''}{formatPaise(l.paise)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Total</dt>
              <dd>{formatPaise(o.totalPaise)}</dd>
            </div>
          </dl>
        )}
        {o.cancelReason ? <p className="mt-3 text-sm text-muted-foreground">Cancel reason: {String(o.cancelReason)}</p> : null}
      </div>
    </div>
  );
}
