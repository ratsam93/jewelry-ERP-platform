'use client';

import * as React from 'react';
import { PageHeader, StatusBadge, getStatusVariant, EmptyState } from '@caratflow/ui';
import { Plus, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaymentForm, type PaymentFormSubmit, type PaymentInvoiceOption } from '@/features/finance/payment-form';
import { PaginationControls } from '@/components/pagination-controls';
import { formatPaise } from '@/components/format';
import { formatTimestampDate } from '@/lib/date-only';
import { customerOptions, supplierOptions, readableError, toNum, type PaymentTypeValue } from '@/lib/finance-forms';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', UPI: 'UPI', BANK_TRANSFER: 'Bank', CHEQUE: 'Cheque', ONLINE: 'Online',
};

function partyName(p: Record<string, unknown>): string {
  const c = p.customer as { firstName?: string; lastName?: string } | null | undefined;
  if (c) {
    const n = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    if (n) return n;
  }
  const s = p.supplier as { name?: string } | null | undefined;
  return s?.name ?? '-';
}

export default function PaymentsPage() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = React.useState(false);
  const [paymentType, setPaymentType] = React.useState<PaymentTypeValue>('RECEIVED');
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const listQuery = trpc.financial.payments.list.useQuery({
    page,
    limit: 20,
    ...(search.trim() ? { search: search.trim() } : {}),
  } as never);
  const d = listQuery.data as
    | { items?: Array<Record<string, unknown>>; totalPages?: number; page?: number; hasPrevious?: boolean; hasNext?: boolean }
    | undefined;
  const items = d?.items ?? [];

  // Form data is only needed once the form is open.
  const customersQuery = trpc.crm.customerList.useQuery({ page: 1, limit: 100 } as never, { enabled: showForm } as never);
  const suppliersQuery = trpc.wholesale.listSuppliers.useQuery({ pagination: { page: 1, limit: 100, sortOrder: 'asc' } } as never, { enabled: showForm } as never);
  const invoicesQuery = trpc.financial.invoices.list.useQuery(
    { page: 1, limit: 100, invoiceType: paymentType === 'RECEIVED' ? 'SALES' : 'PURCHASE' } as never,
    { enabled: showForm } as never,
  );

  const customers = customerOptions(
    (customersQuery.data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? [],
  );
  const suppliers = supplierOptions(
    (suppliersQuery.data as unknown as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? [],
  );
  const invoices: PaymentInvoiceOption[] = (
    (invoicesQuery.data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? []
  )
    .filter((i) => !['CANCELLED', 'VOIDED', 'PAID'].includes(String(i.status)))
    .map((i) => ({
      id: String(i.id),
      invoiceNumber: String(i.invoiceNumber ?? ''),
      totalPaise: toNum(i.totalPaise),
      paidPaise: toNum(i.paidPaise),
      customerId: (i.customerId as string | null) ?? null,
      supplierId: (i.supplierId as string | null) ?? null,
    }))
    .filter((i) => i.totalPaise - i.paidPaise > 0);

  const recordMutation = trpc.financial.payments.record.useMutation({
    onSuccess: (created: unknown) => {
      const num = (created as { paymentNumber?: string } | undefined)?.paymentNumber;
      setServerError(null);
      setSuccess(num ? `Payment ${num} recorded.` : 'Payment recorded.');
      setShowForm(false);
      setPage(1);
      void utils.financial.payments.list.invalidate();
      void utils.financial.invoices.list.invalidate();
    },
    onError: (err: unknown) => {
      setSuccess(null);
      setServerError(readableError(err, 'Could not record the payment.'));
    },
  } as never);

  const handleSubmit = (data: PaymentFormSubmit) => {
    setServerError(null);
    setSuccess(null);
    recordMutation.mutate(data as never);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Track all payments received and made."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Payments' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => {
              setShowForm(!showForm);
              setServerError(null);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        }
      />

      {success && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      {showForm && (
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex gap-2">
            {(['RECEIVED', 'MADE'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setPaymentType(type);
                  setServerError(null);
                }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  paymentType === type ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'
                }`}
              >
                {type === 'RECEIVED' ? 'Payment Received' : 'Payment Made'}
              </button>
            ))}
          </div>
          <PaymentForm
            key={paymentType}
            paymentType={paymentType}
            customers={customers}
            suppliers={suppliers}
            invoices={invoices}
            onSubmit={handleSubmit}
            isLoading={recordMutation.isPending}
            serverError={serverError}
          />
        </div>
      )}

      <input
        type="search"
        aria-label="Search payments"
        placeholder="Search by payment number or reference..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="h-9 w-full max-w-sm rounded-md border px-3 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border">
        <div className="grid min-w-[900px] grid-cols-[1.2fr_0.9fr_0.8fr_1fr_1.4fr_1fr_1fr_0.9fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Payment #</span>
          <span>Type</span>
          <span>Method</span>
          <span>Date</span>
          <span>Party</span>
          <span>Amount</span>
          <span>Invoice</span>
          <span>Status</span>
        </div>
        {listQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : listQuery.isError ? (
          <div className="py-12 text-center text-sm text-destructive">Failed to load payments.</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Wallet className="h-8 w-8" />} title="No payments recorded yet" />
        ) : (
          <div className="divide-y">
            {items.map((p) => {
              const received = p.paymentType === 'RECEIVED';
              const invoice = p.invoice as { invoiceNumber?: string } | null | undefined;
              return (
                <div key={String(p.id)} className="grid min-w-[900px] grid-cols-[1.2fr_0.9fr_0.8fr_1fr_1.4fr_1fr_1fr_0.9fr] gap-4 px-4 py-3 text-sm">
                  <span className="font-mono">{String(p.paymentNumber ?? '-')}</span>
                  <span className="inline-flex items-center gap-1">
                    {received ? (
                      <><ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" /> Received</>
                    ) : (
                      <><ArrowUpRight className="h-3.5 w-3.5 text-red-600" /> Made</>
                    )}
                  </span>
                  <span>{METHOD_LABELS[String(p.method)] ?? String(p.method ?? '-')}</span>
                  <span className="text-muted-foreground">{formatTimestampDate(p.processedAt ?? p.createdAt)}</span>
                  <span>{partyName(p)}</span>
                  <span className={`font-mono font-medium ${received ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatPaise(p.amountPaise)}
                  </span>
                  <span className="text-muted-foreground">{invoice?.invoiceNumber ?? '-'}</span>
                  <StatusBadge label={String(p.status ?? '-')} variant={getStatusVariant(String(p.status))} dot={false} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {d && d.totalPages && d.totalPages > 0 ? (
        <PaginationControls
          page={d.page ?? 1}
          totalPages={d.totalPages}
          hasPrevious={d.hasPrevious ?? false}
          hasNext={d.hasNext ?? false}
          onChange={setPage}
        />
      ) : null}
    </div>
  );
}
