'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import type { ChartData, ForecastResult, SeasonalPattern } from '@caratflow/shared-types';
import { trpc } from '@/lib/trpc';
import { ForecastChart } from '@/features/reporting/ForecastChart';
import { ReportChart } from '@/features/reporting/ReportChart';
import { ReportExportMenu } from '@/features/reporting/ReportExportMenu';
import type { ExportTable } from '@/lib/report-export';

type Tab = 'forecast' | 'seasonality' | 'reorder';

interface ReorderResult {
  reorderPoint?: number;
  safetyStock?: number;
  avgDailyDemand?: number;
  demandStdDev?: number;
}

const num = (v: unknown, digits = 0): string =>
  typeof v === 'number' && Number.isFinite(v)
    ? v.toLocaleString('en-IN', { maximumFractionDigits: digits })
    : '-';

export default function ForecastReportsPage() {
  const [tab, setTab] = useState<Tab>('forecast');
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [periods, setPeriods] = useState(6);
  const [leadTimeDays, setLeadTimeDays] = useState(14);
  const [serviceLevel, setServiceLevel] = useState(0.95);
  const [years, setYears] = useState(2);

  const productsQuery = trpc.storefront.catalog.list.useQuery({
    page: 1,
    limit: 50,
    sortOrder: 'desc',
    search: productSearch || undefined,
  });
  const products =
    (
      productsQuery.data as
        | { items?: Array<{ id: string; name?: string; sku?: string }> }
        | undefined
    )?.items ?? [];

  const forecastQuery = trpc.reporting.demandForecast.useQuery(
    { productId: productId || undefined, categoryId: categoryId || undefined, periods },
    { enabled: tab === 'forecast' },
  );
  const seasonalityQuery = trpc.reporting.seasonalityAnalysis.useQuery(
    { categoryId: categoryId || undefined, years },
    { enabled: tab === 'seasonality' },
  );
  const reorderQuery = trpc.reporting.reorderPointCalculation.useQuery(
    { productId, leadTimeDays, serviceLevel },
    { enabled: tab === 'reorder' && !!productId },
  );

  const rawForecast = forecastQuery.data as Partial<ForecastResult> | undefined;
  const forecastResult: ForecastResult | undefined = rawForecast
    ? ({ ...rawForecast, predictions: Array.isArray(rawForecast.predictions) ? rawForecast.predictions : [] } as ForecastResult)
    : undefined;

  const seasonalityRows = useMemo(
    () => (Array.isArray(seasonalityQuery.data) ? (seasonalityQuery.data as Array<Partial<SeasonalPattern>>) : []),
    [seasonalityQuery.data],
  );
  const seasonalityChart = useMemo<ChartData>(
    () => ({
      title: 'Seasonal index by month',
      chartType: 'bar' as ChartData['chartType'],
      labels: seasonalityRows.map((p) => String(p.monthName ?? p.month ?? '').slice(0, 3)),
      datasets: [{ label: 'Seasonal index', data: seasonalityRows.map((p) => p.seasonalIndex ?? 0) }],
    }),
    [seasonalityRows],
  );

  const reorder = reorderQuery.data as ReorderResult | undefined;
  const selectedProduct = products.find((p) => p.id === productId);
  const productLabel = selectedProduct?.name ?? selectedProduct?.sku ?? productId;

  const getTable = (): ExportTable | null => {
    if (tab === 'forecast') {
      if (!forecastResult) return null;
      return {
        headers: ['Period', 'Actual', 'Predicted', 'Lower bound', 'Upper bound', 'Confidence'],
        rows: forecastResult.predictions.map((p) => [p.period, p.actual, p.predicted, p.lowerBound, p.upperBound, p.confidence]),
      };
    }
    if (tab === 'seasonality') {
      if (seasonalityRows.length === 0) return null;
      return {
        headers: ['Month', 'Month name', 'Average demand', 'Seasonal index'],
        rows: seasonalityRows.map((p) => [p.month, p.monthName, p.avgDemand, p.seasonalIndex]),
      };
    }
    if (!reorder) return null;
    return {
      headers: ['Product', 'Reorder point (units)', 'Safety stock (units)', 'Avg daily demand (units/day)', 'Demand std dev (units/day)', 'Lead time (days)'],
      rows: [[productLabel, reorder.reorderPoint, reorder.safetyStock, reorder.avgDailyDemand, reorder.demandStdDev, leadTimeDays]],
    };
  };
  const exportBase = tab === 'forecast' ? 'demand-forecast' : tab === 'seasonality' ? 'seasonality-report' : 'reorder-point-report';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecasting"
        description="Demand forecasting, seasonality analysis, and reorder point calculations."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Reports', href: '/reports' },
          { label: 'Forecast' },
        ]}
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(
          [
            { id: 'forecast', label: 'Demand Forecast' },
            { id: 'seasonality', label: 'Seasonality' },
            { id: 'reorder', label: 'Reorder Point' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl">
        <div className="space-y-2">
          <label className="text-sm font-medium">Product search</label>
          <input
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">(none)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? p.sku ?? p.id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Category ID</label>
          <input
            type="text"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="UUID (optional)"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        {tab === 'forecast' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Periods</label>
            <input
              type="number"
              min={1}
              max={24}
              value={periods}
              onChange={(e) => setPeriods(Math.max(1, Math.min(24, parseInt(e.target.value) || 6)))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}
        {tab === 'seasonality' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Years</label>
            <input
              type="number"
              min={1}
              max={5}
              value={years}
              onChange={(e) => setYears(Math.max(1, Math.min(5, parseInt(e.target.value) || 2)))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}
        {tab === 'reorder' && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Lead Time (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(Math.max(1, parseInt(e.target.value) || 14))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Service Level</label>
              <input
                type="number"
                step="0.01"
                min={0.5}
                max={0.999}
                value={serviceLevel}
                onChange={(e) => setServiceLevel(parseFloat(e.target.value) || 0.95)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <ReportExportMenu fileBase={exportBase} getTable={getTable} />
      </div>

      {/* Content */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        {tab === 'forecast' && (
          <>
            <h3 className="text-lg font-semibold">Demand Forecast</h3>
            {forecastQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {forecastQuery.isError && (
              <p className="text-sm text-destructive">{forecastQuery.error.message}</p>
            )}
            {forecastResult != null && (
              <>
                <ForecastChart data={forecastResult} />
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Raw data</summary>
                  <pre className="mt-2 rounded-md bg-muted p-3 overflow-auto max-h-60">
                    {JSON.stringify(forecastResult, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </>
        )}

        {tab === 'seasonality' && (
          <>
            <h3 className="text-lg font-semibold">Seasonality Analysis</h3>
            {seasonalityQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {seasonalityQuery.isError && (
              <p className="text-sm text-destructive">{seasonalityQuery.error.message}</p>
            )}
            {seasonalityQuery.data != null && (
              <>
                {seasonalityRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No seasonality data for this selection.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Seasonal index: 1.00 is an average month; above 1.00 is a busier-than-average month.
                    </p>
                    <ReportChart data={seasonalityChart} height={260} formatValue={(v) => v.toFixed(2)} />
                  </>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Raw data</summary>
                  <pre className="mt-2 rounded-md bg-muted p-3 overflow-auto max-h-60">
                    {JSON.stringify(seasonalityQuery.data, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </>
        )}

        {tab === 'reorder' && (
          <>
            <h3 className="text-lg font-semibold">Reorder Point Calculation</h3>
            {!productId && (
              <p className="text-sm text-muted-foreground">
                Select a product to calculate reorder point.
              </p>
            )}
            {reorderQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {reorderQuery.isError && (
              <p className="text-sm text-destructive">{reorderQuery.error.message}</p>
            )}
            {reorder != null && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 text-right font-medium">Reorder point (units)</th>
                      <th className="px-3 py-2 text-right font-medium">Safety stock (units)</th>
                      <th className="px-3 py-2 text-right font-medium">Avg daily demand (units/day)</th>
                      <th className="px-3 py-2 text-right font-medium">Demand std dev (units/day)</th>
                      <th className="px-3 py-2 text-right font-medium">Lead time (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-3 py-2 font-medium">{productLabel}</td>
                      <td className="px-3 py-2 text-right font-semibold">{num(reorder.reorderPoint)}</td>
                      <td className="px-3 py-2 text-right">{num(reorder.safetyStock)}</td>
                      <td className="px-3 py-2 text-right">{num(reorder.avgDailyDemand, 2)}</td>
                      <td className="px-3 py-2 text-right">{num(reorder.demandStdDev, 2)}</td>
                      <td className="px-3 py-2 text-right">{num(leadTimeDays)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
