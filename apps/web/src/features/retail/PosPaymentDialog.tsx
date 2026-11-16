'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@caratflow/ui';
import {
  Banknote,
  CreditCard,
  Smartphone,
  Building2,
  FileText,
  Coins,
  Gift,
  Star,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: Building2 },
  { value: 'CHEQUE', label: 'Cheque', icon: FileText },
  { value: 'OLD_GOLD', label: 'Old Gold', icon: Coins },
  { value: 'GIFT_CARD', label: 'Gift Card', icon: Gift },
  { value: 'LOYALTY_POINTS', label: 'Loyalty Points', icon: Star },
] as const;

interface GiftCardCheck {
  status: 'loading' | 'ok' | 'error';
  balancePaise?: number;
  error?: string;
}

interface PaymentEntry {
  id: string;
  method: string;
  amountPaise: number;
  reference: string;
  /** Upper bound for this entry (gift card balance or old gold value). Null when uncapped. */
  capPaise: number | null;
  /** Result of the gift card balance check for the current card number. */
  giftCheck: GiftCardCheck | null;
}

interface OldGoldOption {
  id: string;
  purchaseNumber: string;
  finalAmountPaise: number;
}

interface GiftCardLookup {
  balancePaise: number | string;
  status: string;
  expiresAt?: string | Date | null;
}

interface LoyaltyProgramLite {
  redemptionRate: number;
}

interface PosPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalPaise: number;
  onConfirm: (payments: Array<{ method: string; amountPaise: number; reference?: string }>) => void;
  isProcessing?: boolean;
  /** Selected customer. Required for loyalty points; used to list their old gold purchases. */
  customerId?: string | null;
  /** Server error from the last sale attempt, shown inside the dialog. */
  errorMessage?: string | null;
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'string' || typeof value === 'bigint' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

function newEntry(id: string, amountPaise: number): PaymentEntry {
  return { id, method: 'CASH', amountPaise, reference: '', capPaise: null, giftCheck: null };
}

export function PosPaymentDialog({
  open,
  onOpenChange,
  totalPaise,
  onConfirm,
  isProcessing = false,
  customerId = null,
  errorMessage = null,
}: PosPaymentDialogProps) {
  const [payments, setPayments] = React.useState<PaymentEntry[]>([newEntry('1', totalPaise)]);

  React.useEffect(() => {
    if (open) {
      setPayments([newEntry('1', totalPaise)]);
    }
  }, [open, totalPaise]);

  const utils = trpc.useUtils();
  const hasCustomer = Boolean(customerId);
  const needsOldGold = payments.some((p) => p.method === 'OLD_GOLD');
  const needsLoyalty = payments.some((p) => p.method === 'LOYALTY_POINTS');

  // ─── Old gold: the customer's completed (PURCHASED) purchases ──────────
  const oldGoldQuery = trpc.retail.listOldGoldPurchases.useQuery(
    {
      filters: { customerId: customerId ?? undefined, status: 'PURCHASED' },
      pagination: { page: 1, limit: 50, sortOrder: 'desc' as const },
    },
    { enabled: open && hasCustomer && needsOldGold },
  );
  const oldGoldOptions: OldGoldOption[] = React.useMemo(() => {
    const data = oldGoldQuery.data as unknown as { items?: OldGoldOption[] } | undefined;
    return data?.items ?? [];
  }, [oldGoldQuery.data]);

  // ─── Loyalty: active programme rate and the customer's balance ─────────
  const programQuery = trpc.crm.loyaltyProgramActive.useQuery(undefined, {
    enabled: open && needsLoyalty,
  });
  const program = programQuery.data as unknown as LoyaltyProgramLite | null | undefined;
  const balanceQuery = trpc.crm.customer360.useQuery(
    { customerId: customerId ?? '' },
    { enabled: open && needsLoyalty && hasCustomer },
  );
  const loyaltyBalance = (balanceQuery.data as unknown as { loyalty?: { currentPoints?: number } } | undefined)
    ?.loyalty?.currentPoints;
  const loyaltyCapPaise =
    program && loyaltyBalance !== undefined && program.redemptionRate > 0
      ? Math.floor((loyaltyBalance * 100) / program.redemptionRate)
      : null;

  const pointsFor = (amountPaise: number): number =>
    program ? Math.ceil((amountPaise * program.redemptionRate) / 100) : 0;

  const capOf = (p: PaymentEntry): number | null =>
    p.method === 'LOYALTY_POINTS' ? loyaltyCapPaise : p.capPaise;

  // Clamp any entry above its cap (gift card balance, old gold value, loyalty allowance).
  React.useEffect(() => {
    setPayments((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const cap = p.method === 'LOYALTY_POINTS' ? loyaltyCapPaise : p.capPaise;
        if (cap !== null && p.amountPaise > cap) {
          changed = true;
          return { ...p, amountPaise: Math.max(0, cap) };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [payments, loyaltyCapPaise]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const remaining = totalPaise - totalPaid;
  const cashPaid = payments
    .filter((p) => p.method === 'CASH')
    .reduce((sum, p) => sum + p.amountPaise, 0);

  const addPayment = () => {
    setPayments((prev) => [
      ...prev,
      newEntry(String(Date.now()), Math.max(0, remaining)),
    ]);
  };

  const removePayment = (id: string) => {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const patchEntry = (id: string, patch: Partial<PaymentEntry>) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const changeMethod = (id: string, method: string) => {
    patchEntry(id, { method, reference: '', capPaise: null, giftCheck: null });
  };

  const setReference = (id: string, reference: string) => {
    // Any change to a gift card number invalidates the previous balance check.
    patchEntry(id, { reference, capPaise: null, giftCheck: null });
  };

  /** Amount this entry can take without overpaying, given the other entries. */
  const neededFor = (entry: PaymentEntry): number => {
    const others = totalPaid - entry.amountPaise;
    return Math.max(0, totalPaise - others);
  };

  const checkGiftCard = async (entry: PaymentEntry) => {
    const cardNumber = entry.reference.trim();
    if (!cardNumber) return;
    patchEntry(entry.id, { giftCheck: { status: 'loading' }, capPaise: null });
    try {
      const card = (await utils.retail.getGiftCardBalance.fetch({ cardNumber })) as unknown as GiftCardLookup;
      const balance = toNumber(card.balancePaise);
      let error: string | undefined;
      if (card.status !== 'ACTIVE') error = `Gift card is ${card.status.toLowerCase()}`;
      else if (card.expiresAt && new Date(card.expiresAt).getTime() < Date.now()) error = 'Gift card has expired';
      else if (balance <= 0) error = 'Gift card has no balance';

      setPayments((prev) =>
        prev.map((p) => {
          // Ignore a late response if the card number was changed in the meantime.
          if (p.id !== entry.id || p.reference.trim() !== cardNumber) return p;
          if (error) return { ...p, giftCheck: { status: 'error', error }, capPaise: null };
          const amountPaise = p.amountPaise > 0 ? p.amountPaise : Math.min(balance, neededFor(p));
          return { ...p, amountPaise, capPaise: balance, giftCheck: { status: 'ok', balancePaise: balance } };
        }),
      );
    } catch (err) {
      patchEntry(entry.id, {
        giftCheck: { status: 'error', error: err instanceof Error ? err.message : 'Could not check balance' },
        capPaise: null,
      });
    }
  };

  const selectOldGold = (entry: PaymentEntry, purchaseId: string) => {
    const option = oldGoldOptions.find((o) => o.id === purchaseId);
    if (!option) {
      patchEntry(entry.id, { reference: '', capPaise: null });
      return;
    }
    const amountPaise = entry.amountPaise > 0 ? entry.amountPaise : Math.min(option.finalAmountPaise, neededFor(entry));
    patchEntry(entry.id, { reference: purchaseId, capPaise: option.finalAmountPaise, amountPaise });
  };

  // ─── Validation ─────────────────────────────────────────────────────
  const activeEntries = payments.filter((p) => p.amountPaise > 0);
  const issues: string[] = [];
  if (activeEntries.length === 0) issues.push('Enter a payment amount.');
  if (remaining < 0 && -remaining > cashPaid) {
    issues.push('Only cash can be returned as change. Reduce the non-cash amounts.');
  }
  for (const p of activeEntries) {
    const label = methodLabel(p.method);
    const cap = capOf(p);
    if (p.method === 'GIFT_CARD') {
      if (!p.reference.trim()) issues.push('Gift card: enter the card number.');
      else if (p.giftCheck?.status !== 'ok') issues.push('Gift card: check the balance first.');
    }
    if (p.method === 'OLD_GOLD' && !p.reference.trim()) {
      issues.push('Old gold: choose a purchase.');
    }
    if (p.method === 'LOYALTY_POINTS') {
      if (!hasCustomer) issues.push('Loyalty points need an identified customer.');
      else if (!program) issues.push('No active loyalty program is configured.');
      else if (loyaltyCapPaise === null) issues.push('Loyalty: loading the customer balance.');
    }
    if (cap !== null && p.amountPaise > cap) {
      issues.push(`${label}: amount is above ${formatPaise(cap)}.`);
    }
  }
  const canConfirm = remaining <= 0 && issues.length === 0 && !isProcessing;

  const handleConfirm = () => {
    if (!canConfirm) return;
    // Cash overpayment is change: strip it from the cash entries so payments sum exactly to the total.
    let change = Math.max(0, -remaining);
    const out: Array<{ method: string; amountPaise: number; reference?: string }> = [];
    for (const p of activeEntries) {
      let amount = p.amountPaise;
      if (p.method === 'CASH' && change > 0) {
        const cut = Math.min(change, amount);
        amount -= cut;
        change -= cut;
      }
      if (amount > 0) {
        out.push({
          method: p.method,
          amountPaise: amount,
          reference: p.reference.trim() || undefined,
        });
      }
    }
    onConfirm(out);
  };

  const oldGoldIsListed = oldGoldOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total due */}
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Due</p>
            <p className="text-3xl font-bold">{formatPaise(totalPaise)}</p>
          </div>

          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Payment entries */}
          <div className="space-y-3">
            {payments.map((payment, index) => {
              const cap = capOf(payment);
              const loyaltyPoints = pointsFor(payment.amountPaise);
              return (
                <div key={payment.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Payment {index + 1}
                    </span>
                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePayment(payment.id)}
                        className="text-destructive hover:text-destructive/80"
                        aria-label={`Remove payment ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Method selector */}
                  <div className="grid grid-cols-4 gap-1">
                    {PAYMENT_METHODS.map((method) => {
                      const Icon = method.icon;
                      const loyaltyBlocked =
                        method.value === 'LOYALTY_POINTS' &&
                        !hasCustomer &&
                        payment.method !== 'LOYALTY_POINTS';
                      return (
                        <button
                          key={method.value}
                          type="button"
                          disabled={loyaltyBlocked}
                          title={
                            loyaltyBlocked
                              ? 'Select a customer first. Loyalty points can only be redeemed by an identified customer.'
                              : undefined
                          }
                          onClick={() => changeMethod(payment.id, method.value)}
                          className={cn(
                            'flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                            payment.method === method.value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'hover:bg-accent',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {method.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Amount */}
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Amount (₹)"
                      min={0}
                      max={cap !== null ? cap / 100 : undefined}
                      value={payment.amountPaise / 100 || ''}
                      onChange={(e) =>
                        patchEntry(payment.id, {
                          amountPaise: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100) || 0),
                        })
                      }
                      className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    {payment.method !== 'CASH' &&
                      payment.method !== 'GIFT_CARD' &&
                      payment.method !== 'OLD_GOLD' &&
                      payment.method !== 'LOYALTY_POINTS' && (
                        <input
                          type="text"
                          placeholder="Reference / Txn ID"
                          value={payment.reference}
                          onChange={(e) => setReference(payment.id, e.target.value)}
                          className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      )}
                  </div>

                  {/* Gift card: card number + balance check */}
                  {payment.method === 'GIFT_CARD' && (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Gift card number"
                          value={payment.reference}
                          onChange={(e) => setReference(payment.id, e.target.value)}
                          autoComplete="off"
                          className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => checkGiftCard(payment)}
                          disabled={!payment.reference.trim() || payment.giftCheck?.status === 'loading'}
                          className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                        >
                          {payment.giftCheck?.status === 'loading' ? 'Checking...' : 'Check balance'}
                        </button>
                      </div>
                      {payment.giftCheck?.status === 'ok' && (
                        <p className="text-xs text-emerald-700">
                          Balance: {formatPaise(payment.giftCheck.balancePaise ?? 0)}. Amount capped at balance.
                        </p>
                      )}
                      {payment.giftCheck?.status === 'error' && (
                        <p role="alert" className="text-xs text-destructive">{payment.giftCheck.error}</p>
                      )}
                    </div>
                  )}

                  {/* Old gold: pick a completed purchase */}
                  {payment.method === 'OLD_GOLD' && (
                    <div className="space-y-1.5">
                      {hasCustomer ? (
                        <>
                          <select
                            value={payment.reference}
                            onChange={(e) => selectOldGold(payment, e.target.value)}
                            disabled={oldGoldQuery.isLoading}
                            aria-label="Old gold purchase"
                            className="h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="">
                              {oldGoldQuery.isLoading ? 'Loading purchases...' : 'Select a completed purchase'}
                            </option>
                            {oldGoldOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.purchaseNumber} · {formatPaise(o.finalAmountPaise)}
                              </option>
                            ))}
                          </select>
                          {oldGoldQuery.isError && (
                            <p role="alert" className="text-xs text-destructive">
                              Could not load old gold purchases: {oldGoldQuery.error.message}
                            </p>
                          )}
                          {!oldGoldQuery.isLoading && !oldGoldIsListed && !oldGoldQuery.isError && (
                            <p className="text-xs text-muted-foreground">
                              This customer has no completed old gold purchases.
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Old gold purchase ID"
                            value={payment.reference}
                            onChange={(e) => patchEntry(payment.id, { reference: e.target.value.trim(), capPaise: null })}
                            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <p className="text-xs text-muted-foreground">
                            Select a customer to choose from their purchases. For a walk-in, enter the purchase ID.
                          </p>
                        </>
                      )}
                      {cap !== null && (
                        <p className="text-xs text-muted-foreground">Purchase value: {formatPaise(cap)}</p>
                      )}
                    </div>
                  )}

                  {/* Loyalty points */}
                  {payment.method === 'LOYALTY_POINTS' && (
                    <div className="space-y-1 text-xs">
                      {!hasCustomer ? (
                        <p className="text-muted-foreground">Select a customer to redeem loyalty points.</p>
                      ) : programQuery.isLoading || balanceQuery.isLoading ? (
                        <p className="text-muted-foreground">Loading loyalty details...</p>
                      ) : !program ? (
                        <p role="alert" className="text-destructive">No active loyalty program is configured.</p>
                      ) : balanceQuery.isError ? (
                        <p role="alert" className="text-destructive">Could not load the customer balance.</p>
                      ) : (
                        <>
                          <p className="text-muted-foreground">
                            Balance: {(loyaltyBalance ?? 0).toLocaleString('en-IN')} points · Rate: {program.redemptionRate} points per ₹1
                          </p>
                          <p className="font-medium">
                            This payment uses {loyaltyPoints.toLocaleString('en-IN')} points
                            {cap !== null ? ` (up to ${formatPaise(cap)})` : ''}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add split payment */}
          <button
            type="button"
            onClick={addPayment}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Split Payment
          </button>

          {/* Balance info */}
          {remaining !== 0 && (
            <div
              className={cn(
                'rounded-md p-2 text-center text-sm font-medium',
                remaining > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
              )}
            >
              {remaining > 0
                ? `Remaining: ${formatPaise(remaining)}`
                : `Change: ${formatPaise(Math.abs(remaining))}`}
            </div>
          )}

          {/* Validation hints (shown once something has been entered) */}
          {totalPaid > 0 && issues.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Complete Sale'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
