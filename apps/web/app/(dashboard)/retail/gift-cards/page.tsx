'use client';

import * as React from 'react';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { Gift, Search, Plus, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise, formatDate } from '@/components/format';
import { parseRupees } from '@/lib/retail-forms';

interface GiftCardView {
  id: string;
  cardNumber: string;
  balancePaise: number | string;
  initialValuePaise: number | string;
  customerId: string | null;
  status: string;
  expiresAt: string | Date | null;
}

interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function GiftCardsPage() {
  // ─── Issue form ─────────────────────────────────────────────────
  const [amountText, setAmountText] = React.useState('');
  const parsedAmount = React.useMemo(() => parseRupees(amountText, { label: 'Value' }), [amountText]);
  const amountPaise = parsedAmount.paise ?? 0;
  const [expiryDate, setExpiryDate] = React.useState('');
  const [customer, setCustomer] = React.useState<{ id: string; name: string } | null>(null);
  const [customerSearch, setCustomerSearch] = React.useState('');
  const debouncedCustomerSearch = useDebounced(customerSearch);
  const customersQuery = trpc.crm.customerList.useQuery(
    { search: debouncedCustomerSearch || undefined, page: 1, limit: 10, sortOrder: 'desc' as const },
    { enabled: customerSearch.trim().length > 0 && !customer },
  );
  const customers: CustomerRow[] = React.useMemo(() => {
    const data = customersQuery.data as unknown as { items?: CustomerRow[] } | undefined;
    return data?.items ?? [];
  }, [customersQuery.data]);

  const [issued, setIssued] = React.useState<GiftCardView | null>(null);
  const issueMutation = trpc.retail.issueGiftCard.useMutation({
    onSuccess: (card) => {
      setIssued(card as unknown as GiftCardView);
      setAmountText('');
      setExpiryDate('');
      setCustomer(null);
      setCustomerSearch('');
    },
  });

  const canIssue = parsedAmount.paise !== null && parsedAmount.paise > 0 && !issueMutation.isPending;
  // After a successful issue the form is reset (empty value): don't nag until the cashier starts a new card.
  const justIssued = issued !== null && amountText.trim() === '';
  const issueHint = justIssued
    ? null
    : parsedAmount.error ?? (parsedAmount.paise === null ? 'Enter the gift card value to continue.' : null);
  const handleIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canIssue) return;
    issueMutation.mutate({
      initialValuePaise: amountPaise,
      customerId: customer?.id,
      expiresAt: expiryDate ? new Date(`${expiryDate}T23:59:59`) : undefined,
    });
  };

  // ─── Balance lookup ─────────────────────────────────────────────
  const [lookupInput, setLookupInput] = React.useState('');
  const [lookupNumber, setLookupNumber] = React.useState('');
  const balanceQuery = trpc.retail.getGiftCardBalance.useQuery(
    { cardNumber: lookupNumber },
    { enabled: lookupNumber.length > 0, retry: false },
  );
  const card = balanceQuery.data as unknown as GiftCardView | undefined;

  const submitLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setLookupNumber(lookupInput.trim());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gift Cards"
        description="Issue gift cards and check their balances."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Retail', href: '/retail' },
          { label: 'Gift Cards' },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Issue a card */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Gift className="h-4 w-4" /> Issue a gift card
          </h2>

          <form onSubmit={handleIssue} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Value *</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <input
                  id="gc-value"
                  type="text"
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder="0.00"
                  aria-label="Gift card value"
                  aria-invalid={parsedAmount.error ? true : undefined}
                  aria-describedby="gc-value-hint"
                  className="h-9 w-full rounded-md border bg-transparent pl-7 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              {issueHint && (
                <p
                  id="gc-value-hint"
                  role={parsedAmount.error ? 'alert' : undefined}
                  className={parsedAmount.error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                >
                  {issueHint}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="gc-expiry" className="text-sm font-medium">Expiry date (optional)</label>
              <input
                id="gc-expiry"
                type="date"
                value={expiryDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Customer (optional)</label>
              {customer ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{customer.name}</span>
                  <button type="button" onClick={() => setCustomer(null)} aria-label="Clear customer">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search name or phone..."
                      className="h-9 w-full rounded-md border bg-transparent pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  {customerSearch.trim() && (
                    <div className="max-h-48 overflow-auto rounded-md border">
                      {customersQuery.isLoading && (
                        <p className="p-2 text-xs text-muted-foreground">Searching...</p>
                      )}
                      {customersQuery.isError && (
                        <p role="alert" className="p-2 text-xs text-destructive">{errorText(customersQuery.error)}</p>
                      )}
                      {!customersQuery.isLoading && !customersQuery.isError && customers.length === 0 && (
                        <p className="p-2 text-xs text-muted-foreground">No customers found.</p>
                      )}
                      {customers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCustomer({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() })}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-medium">{c.firstName} {c.lastName}</span>
                          <span className="text-xs text-muted-foreground">{c.phone ?? '—'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {issueMutation.isError && (
              <div role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorText(issueMutation.error)}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canIssue}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {issueMutation.isPending ? 'Issuing...' : 'Issue gift card'}
            </button>
          </form>

          {issued && (
            <div role="status" className="space-y-1 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Gift card issued
              </p>
              <p>Card number: <span className="font-mono">{issued.cardNumber}</span></p>
              <p>Balance: {formatPaise(issued.balancePaise)}</p>
            </div>
          )}
        </section>

        {/* Balance lookup */}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Search className="h-4 w-4" /> Check balance
          </h2>

          <form onSubmit={submitLookup} className="flex gap-2">
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Gift card number"
              aria-label="Gift card number"
              autoComplete="off"
              className="h-9 flex-1 rounded-md border bg-transparent px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={!lookupInput.trim() || balanceQuery.isFetching}
              className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {balanceQuery.isFetching ? 'Checking...' : 'Check'}
            </button>
          </form>

          {lookupNumber && balanceQuery.isError && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorText(balanceQuery.error)}</span>
            </div>
          )}

          {card && !balanceQuery.isError && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge label={card.status} variant={getStatusVariant(card.status)} dot={false} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="text-lg font-semibold">{formatPaise(card.balancePaise)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Original value</dt>
                <dd>{formatPaise(card.initialValuePaise)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expires</dt>
                <dd>{card.expiresAt ? formatDate(card.expiresAt) : 'No expiry'}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </div>
  );
}
