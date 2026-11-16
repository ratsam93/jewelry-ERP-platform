'use client';

import * as React from 'react';
import { PageHeader } from '@caratflow/ui';
import { TrendingUp, TrendingDown, Minus, Plus, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { MetalRateSource } from '@caratflow/shared-types';

// ─── Constants ────────────────────────────────────────────────────

/** 1 tola = 11.664 g; 1 troy oz = 31.1035 g (see CLAUDE.md key constants). */
const GRAMS_PER_TOLA = 11.664;
const GRAMS_PER_TROY_OZ = 31.1035;

const PURITY_OPTIONS: Record<string, Array<{ value: number; label: string }>> = {
  GOLD: [
    { value: 999, label: '999 (24K/Pure)' },
    { value: 916, label: '916 (22K)' },
    { value: 750, label: '750 (18K)' },
    { value: 585, label: '585 (14K)' },
  ],
  SILVER: [{ value: 999, label: '999 (Pure)' }],
  PLATINUM: [{ value: 950, label: '950' }],
};

const KARAT_BY_PURITY: Record<number, string> = { 999: '24K', 916: '22K', 750: '18K', 585: '14K' };

// ─── Helpers ──────────────────────────────────────────────────────

/** Paise may arrive as numbers or BigInt-safe strings. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rateLabel(metalType: string, purity: number): string {
  const metal = metalType.charAt(0) + metalType.slice(1).toLowerCase();
  if (metalType.toUpperCase() === 'GOLD') return `${metal} ${KARAT_BY_PURITY[purity] ?? purity}`;
  return `${metal} ${purity}`;
}

/**
 * Derive every unit price from the entered rate per 10 g (paise).
 * The API requires all four values, so they are computed here, not typed by the user.
 */
function deriveRates(per10gPaise: number) {
  const perGramPaise = Math.round(per10gPaise / 10);
  const perTolaPaise = Math.round((per10gPaise / 10) * GRAMS_PER_TOLA);
  const perTroyOzPaise = Math.round(perGramPaise * GRAMS_PER_TROY_OZ);
  return { perGramPaise, perTolaPaise, perTroyOzPaise };
}

// ─── Page ─────────────────────────────────────────────────────────

export default function RatesPage() {
  const utils = trpc.useUtils();

  const [rateForm, setRateForm] = React.useState({
    metalType: 'GOLD',
    purity: '999',
    ratePer10g: '',
    source: 'MANUAL',
  });
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSuccess, setFormSuccess] = React.useState<string | null>(null);

  const liveQ = trpc.india.rates.getAll.useQuery();
  const historyQ = trpc.india.rates.getHistory.useQuery({ metalType: 'GOLD', purity: 999 });

  const recordMut = trpc.india.rates.record.useMutation({
    onSuccess: () => {
      setFormSuccess('Rate recorded.');
      setRateForm((p) => ({ ...p, ratePer10g: '' }));
      void utils.india.rates.getAll.invalidate();
      void utils.india.rates.getHistory.invalidate();
    },
    onError: (err) => setFormError(err.message),
  });

  const refreshMut = trpc.india.rates.refreshNow.useMutation({
    onSuccess: () => {
      void utils.india.rates.getAll.invalidate();
      void utils.india.rates.getHistory.invalidate();
    },
  });

  const handleSubmitRate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const per10gPaise = Math.round(parseFloat(rateForm.ratePer10g) * 100);
    if (!Number.isFinite(per10gPaise) || per10gPaise <= 0) {
      setFormError('Enter a rate greater than zero.');
      return;
    }

    const derived = deriveRates(per10gPaise);
    recordMut.mutate({
      metalType: rateForm.metalType,
      purity: Number(rateForm.purity),
      ratePer10gPaise: per10gPaise,
      ratePerGramPaise: derived.perGramPaise,
      ratePerTolaPaise: derived.perTolaPaise,
      ratePerTroyOzPaise: derived.perTroyOzPaise,
      source: rateForm.source as MetalRateSource,
      recordedAt: new Date(),
      currencyCode: 'INR',
    });
  };

  const liveRates = (liveQ.data ?? []) as unknown as Array<{
    metalType: string;
    purity: number;
    ratePer10gPaise: unknown;
    ratePerGramPaise: unknown;
    ratePerTolaPaise: unknown;
    source: string;
    updatedAt: string;
    changePercent: number | null;
  }>;

  // Last 10 Gold 24K entries, oldest first for the bar list.
  const history = (historyQ.data ?? []) as unknown as Array<{
    id: string;
    recordedAt: string;
    ratePer10gPaise: unknown;
  }>;
  const recent = history.slice(0, 10).reverse().map((h) => ({
    id: h.id,
    date: h.recordedAt,
    paise: toNumber(h.ratePer10gPaise),
  }));
  const maxRate = recent.length ? Math.max(...recent.map((r) => r.paise)) : 0;
  const minRate = recent.length ? Math.min(...recent.map((r) => r.paise)) : 0;
  const range = maxRate - minRate || 1;

  const purityOptions = PURITY_OPTIONS[rateForm.metalType] ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metal Rates"
        description="Live metal rates, manual entry, and historical data."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Rates' },
        ]}
      />

      {/* Live Rates */}
      {liveQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rates...</p>
      ) : liveQ.isError ? (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Could not load live rates: {liveQ.error.message}</span>
          <button type="button" onClick={() => void liveQ.refetch()} className="text-xs font-medium underline">
            Retry
          </button>
        </div>
      ) : liveRates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rates recorded yet. Use the form below to add one.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {liveRates.map((rate) => {
            const change = rate.changePercent;
            return (
              <div key={`${rate.metalType}-${rate.purity}`} className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{rateLabel(rate.metalType, rate.purity)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {rate.source}
                  </span>
                </div>
                <p className="font-mono text-xl font-bold">{formatPaise(toNumber(rate.ratePer10gPaise))}</p>
                <p className="text-xs text-muted-foreground">per 10g</p>
                <div className="mt-2 flex items-center gap-1">
                  {change !== null ? (
                    <>
                      {change > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      ) : change < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      ) : (
                        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span
                        className={`text-xs font-medium ${
                          change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-muted-foreground'
                        }`}
                      >
                        {change > 0 ? '+' : ''}
                        {change.toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p>Per gram: {formatPaise(toNumber(rate.ratePerGramPaise))}</p>
                  <p>Per tola: {formatPaise(toNumber(rate.ratePerTolaPaise))}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Rate Entry Form */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold">Record Rate Manually</h3>
          <form onSubmit={handleSubmitRate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Metal</label>
                <select
                  value={rateForm.metalType}
                  onChange={(e) => {
                    const metalType = e.target.value;
                    setRateForm((p) => ({
                      ...p,
                      metalType,
                      purity: String(PURITY_OPTIONS[metalType]?.[0]?.value ?? 999),
                    }));
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="PLATINUM">Platinum</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">Purity</label>
                <select
                  value={rateForm.purity}
                  onChange={(e) => setRateForm((p) => ({ ...p, purity: e.target.value }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {purityOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Rate per 10g (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rateForm.ratePer10g}
                onChange={(e) => setRateForm((p) => ({ ...p, ratePer10g: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="72500.00"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">Source</label>
              <select
                value={rateForm.source}
                onChange={(e) => setRateForm((p) => ({ ...p, source: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="MANUAL">Manual</option>
                <option value="MCX">MCX</option>
                <option value="IBJA">IBJA</option>
              </select>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            {formSuccess && <p className="text-sm text-emerald-600">{formSuccess}</p>}
            <button
              type="submit"
              disabled={recordMut.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {recordMut.isPending ? 'Recording...' : 'Record Rate'}
            </button>
          </form>
        </div>

        {/* Historical Rate Chart (simplified bar) */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Gold 24K - Recent Entries</h3>
            <button
              type="button"
              onClick={() => refreshMut.mutate({ metalType: 'GOLD' })}
              disabled={refreshMut.isPending}
              aria-label="Refresh gold rate from provider"
              title="Refresh from provider"
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {refreshMut.isError && (
            <p className="mb-2 text-xs text-red-600">Refresh failed: {refreshMut.error.message}</p>
          )}
          {historyQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : historyQ.isError ? (
            <p className="text-sm text-red-600">Could not load history.</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Gold 24K rates recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((h) => {
                const barWidth = ((h.paise - minRate) / range) * 80 + 20;
                return (
                  <div key={h.id} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted-foreground">
                      {new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                    <div className="flex-1">
                      <div className="h-5 rounded bg-amber-400/80 dark:bg-amber-600/60" style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className="w-24 text-right font-mono text-xs">{formatPaise(h.paise)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
