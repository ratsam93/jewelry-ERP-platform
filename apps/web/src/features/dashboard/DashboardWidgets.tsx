'use client';

import * as React from 'react';
import Link from 'next/link';
import { StatCard } from '@caratflow/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ReportChart } from '@/features/reporting';
import type { AlertItem, ChartData, KpiData } from '@caratflow/shared-types';

// ─── Helpers ──────────────────────────────────────────────────────

/** Money arrives as paise; BigInt fields come over the wire as strings. */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

export function formatPaiseINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// ─── Shared body wrapper ──────────────────────────────────────────

interface WidgetBodyProps {
  title: string;
  action?: React.ReactNode;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyText?: string;
  children?: React.ReactNode;
}

/** Card chrome plus loading / error / empty states for list-style widgets. */
export function WidgetBody({
  title,
  action,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyText = 'No data for this period.',
  children,
}: WidgetBodyProps) {
  return (
    <div className="flex h-full flex-col rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        {action}
      </div>
      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>Could not load this widget.</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 text-xs font-medium underline"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      ) : isEmpty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        children
      )}
    </div>
  );
}

// ─── KPI ──────────────────────────────────────────────────────────

export function KpiWidget({
  title,
  icon,
  kpi,
  isLoading,
  isError,
  onRetry,
}: {
  title: string;
  icon: React.ReactNode;
  kpi: KpiData | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isError && !kpi) {
    return (
      <div className="h-full rounded-lg border bg-card p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-medium text-red-700 underline">
          Could not load. Retry
        </button>
      </div>
    );
  }
  return (
    <StatCard
      title={title}
      value={kpi?.formattedValue ?? '--'}
      icon={icon}
      isLoading={isLoading}
      trend={kpi?.trend ? { value: kpi.trend.value, label: kpi.trend.label } : undefined}
      className="h-full"
    />
  );
}

// ─── Revenue chart ────────────────────────────────────────────────

export function RevenueChartWidget({
  chart,
  isLoading,
  isError,
  onRetry,
}: {
  chart: ChartData | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <WidgetBody
      title="Revenue Trend"
      action={
        <Link href="/reports/sales" className="text-sm text-primary hover:underline">
          View Details
        </Link>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={!chart || chart.labels.length === 0}
      emptyText="No completed sales in this period."
    >
      {chart && (
        <ReportChart data={chart} height={280} formatValue={(v) => formatPaiseINR(v)} />
      )}
    </WidgetBody>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────

const ALERT_STYLES: Record<AlertItem['severity'], string> = {
  critical: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

export function AlertsWidget({
  alerts,
  isLoading,
  isError,
  onRetry,
}: {
  alerts: AlertItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <WidgetBody
      title="Alerts"
      action={<AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={alerts.length === 0}
      emptyText="No alerts. Everything looks normal."
    >
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-lg border p-3 text-sm ${ALERT_STYLES[alert.severity] ?? ALERT_STYLES.info}`}
          >
            <p className="font-medium">{alert.title}</p>
            <p className="mt-1 text-xs opacity-80">{alert.description}</p>
            {alert.actionUrl && (
              <Link href={alert.actionUrl} className="mt-2 inline-block text-xs font-medium underline">
                View Report
              </Link>
            )}
          </div>
        ))}
      </div>
    </WidgetBody>
  );
}

// ─── Branch performance ───────────────────────────────────────────

export interface BranchRow {
  locationId: string;
  locationName: string;
  salesCount: number;
  totalRevenuePaise: number;
}

export function BranchPerformanceWidget({
  rows,
  isLoading,
  isError,
  onRetry,
}: {
  rows: BranchRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const sorted = [...rows].sort((a, b) => b.totalRevenuePaise - a.totalRevenuePaise);
  return (
    <WidgetBody
      title="Branch Performance"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={sorted.length === 0}
      emptyText="No branch sales in this period."
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 font-medium">Branch</th>
            <th className="py-2 text-right font-medium">Sales</th>
            <th className="py-2 text-right font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.locationId} className="border-b last:border-0">
              <td className="py-2 font-medium">{row.locationName}</td>
              <td className="py-2 text-right">{row.salesCount}</td>
              <td className="py-2 text-right font-mono">{formatPaiseINR(row.totalRevenuePaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </WidgetBody>
  );
}

// ─── Recent sales ─────────────────────────────────────────────────

export interface RecentSaleRow {
  id: string;
  saleNumber: string;
  customerId: string | null;
  totalPaise: number;
  createdAt: string;
}

export function RecentSalesWidget({
  sales,
  isLoading,
  isError,
  onRetry,
}: {
  sales: RecentSaleRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <WidgetBody
      title="Recent Sales"
      action={
        <Link href="/retail/sales" className="text-sm text-primary hover:underline">
          View All
        </Link>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={sales.length === 0}
      emptyText="No sales yet."
    >
      <div className="space-y-3">
        {sales.map((sale) => (
          <div key={sale.id} className="flex items-center justify-between border-b py-2 last:border-0">
            <div>
              <p className="text-sm font-medium">{sale.saleNumber}</p>
              <p className="text-xs text-muted-foreground">{sale.customerId ? 'Customer' : 'Walk-in'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{formatPaiseINR(sale.totalPaise)}</p>
              <p className="text-xs text-muted-foreground">{formatRelative(sale.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </WidgetBody>
  );
}

// ─── Metal rates ──────────────────────────────────────────────────

export interface MetalRateRow {
  metalType: string;
  purity: number;
  ratePerGramPaise: number;
  changePercent: number | null;
}

const KARAT_BY_PURITY: Record<number, string> = { 999: '24K', 916: '22K', 750: '18K', 585: '14K' };

function rateLabel(row: MetalRateRow): string {
  const metal = row.metalType.charAt(0) + row.metalType.slice(1).toLowerCase();
  if (row.metalType.toUpperCase() === 'GOLD') {
    return `${metal} ${KARAT_BY_PURITY[row.purity] ?? row.purity}`;
  }
  return `${metal} ${row.purity}`;
}

export function MetalRatesWidget({
  rates,
  isLoading,
  isError,
  onRetry,
}: {
  rates: MetalRateRow[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <WidgetBody
      title="Metal Rates"
      action={
        <Link href="/finance/rates" className="text-sm text-primary hover:underline">
          Manage
        </Link>
      }
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={rates.length === 0}
      emptyText="No rates recorded yet. Add one on the Rates page."
    >
      <div className="space-y-3">
        {rates.map((row) => {
          const change = row.changePercent ?? 0;
          return (
            <div
              key={`${row.metalType}-${row.purity}`}
              className="flex items-center justify-between border-b py-2 last:border-0"
            >
              <p className="text-sm font-medium">{rateLabel(row)}</p>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatPaiseINR(row.ratePerGramPaise)}/g</p>
                <p
                  className={`text-xs ${
                    change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-muted-foreground'
                  }`}
                >
                  {row.changePercent === null ? '--' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetBody>
  );
}
