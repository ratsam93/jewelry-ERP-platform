'use client';

import * as React from 'react';
import { PageHeader } from '@caratflow/ui';
import { IndianRupee, Users, ShoppingCart, TrendingUp, Settings2, RotateCcw, Check, Eye } from 'lucide-react';
import { DateRangePicker } from '@/features/reporting';
import { trpc } from '@/lib/trpc';
import { defaultMonthToDate, toLocalDateString, type DateRangeValue } from '@/lib/date-presets';
import { useUiStore } from '@/store/ui-store';
import { toLocationFilter } from '@/features/shell/location-utils';
import {
  DEFAULT_LAYOUT_STATE,
  WIDGET_DEFINITIONS,
  readLocalLayout,
  resolveInitialLayout,
  writeLocalLayout,
  buildLayoutState,
  getWidgetDefinition,
  moveWidget,
  toLayoutPayload,
  type WidgetId,
  type WidgetLayoutState,
} from '@/features/dashboard/layout';
import { WidgetCard } from '@/features/dashboard/WidgetCard';
import {
  AlertsWidget,
  BranchPerformanceWidget,
  KpiWidget,
  MetalRatesWidget,
  RecentSalesWidget,
  RevenueChartWidget,
  InvalidRangeNotice,
  saleCustomerName,
  toNumber,
  type BranchRow,
  type MetalRateRow,
  type RecentSaleRow,
} from '@/features/dashboard/DashboardWidgets';

const KPI_META: Partial<Record<WidgetId, { label: string; icon: React.ReactNode }>> = {
  'kpi-revenue': { label: 'Total Revenue', icon: <IndianRupee className="h-5 w-5" /> },
  'kpi-sales-count': { label: 'Sales Count', icon: <ShoppingCart className="h-5 w-5" /> },
  'kpi-avg-ticket': { label: 'Average Ticket', icon: <TrendingUp className="h-5 w-5" /> },
  'kpi-new-customers': { label: 'New Customers', icon: <Users className="h-5 w-5" /> },
};

export default function DashboardPage() {
  // Local-calendar range: 1st of this month (00:00) to today (23:59:59.999), both inclusive.
  const [range, setRange] = React.useState<DateRangeValue>(() => defaultMonthToDate());
  // True while the picker shows an unusable range (end before start). The queries keep the
  // last valid range, so the range-dependent widgets must not show its numbers meanwhile.
  const [rangeInvalid, setRangeInvalid] = React.useState(false);
  const dateRange = React.useMemo(
    () => ({ from: range.from, to: range.to }),
    [range.from, range.to],
  );

  // ─── Data ────────────────────────────────────────────────────
  // Header location switcher: undefined = all locations.
  const locationId = toLocationFilter(useUiStore((s) => s.activeBranchId));
  const analyticsQ = trpc.reporting.getAnalyticsDashboard.useQuery({ dateRange, locationId });
  const branchesQ = trpc.reporting.salesByLocation.useQuery({ dateRange });
  const salesQ = trpc.retail.listSales.useQuery({
    filters: { locationId },
    pagination: { page: 1, limit: 5, sortOrder: 'desc' },
  });
  const ratesQ = trpc.india.rates.getAll.useQuery();
  const layoutQ = trpc.reporting.getDashboardLayout.useQuery();

  const utils = trpc.useUtils();
  // The layout is saved to localStorage first (optimistic) and then synced. `dirty`
  // stays true until the server confirms, so a reload in between keeps the layout
  // and the next load pushes it to the server.
  // Saves are serialized: only one request is in flight and a newer layout replaces any
  // queued one. Concurrent requests can commit out of order on the server (an older
  // layout overwriting a Reset), and an older ack must never mark a newer layout synced.
  const inFlightRef = React.useRef<WidgetLayoutState | null>(null);
  const queuedRef = React.useRef<WidgetLayoutState | null>(null);
  const flushRef = React.useRef<() => void>(() => undefined);
  const saveLayout = trpc.reporting.saveDashboardLayout.useMutation({
    onSuccess: () => {
      const saved = inFlightRef.current;
      inFlightRef.current = null;
      if (queuedRef.current) {
        flushRef.current();
        return;
      }
      setSaveError(null);
      if (saved) writeLocalLayout(saved, false);
      void utils.reporting.getDashboardLayout.invalidate();
    },
    onError: (err) => {
      inFlightRef.current = null;
      if (queuedRef.current) {
        flushRef.current();
        return;
      }
      setSaveError(`${err.message} Your layout is kept on this device and will sync when you next open the dashboard.`);
    },
  });
  flushRef.current = () => {
    if (inFlightRef.current || !queuedRef.current) return;
    const next = queuedRef.current;
    queuedRef.current = null;
    inFlightRef.current = next;
    saveLayout.mutate({ name: 'My Dashboard', isDefault: true, layout: toLayoutPayload(next) });
  };
  /** Persist locally (dirty until the server confirms) and sync to the server. */
  const lastPersistedRef = React.useRef<string | null>(null);
  const persistLayout = (state: WidgetLayoutState) => {
    const key = JSON.stringify(state);
    if (key === lastPersistedRef.current) return; // e.g. Done right after Reset: nothing new to save
    lastPersistedRef.current = key;
    writeLocalLayout(state, true);
    queuedRef.current = state;
    flushRef.current();
  };

  // ─── Layout state ────────────────────────────────────────────
  const [layout, setLayout] = React.useState<WidgetLayoutState>(DEFAULT_LAYOUT_STATE);
  const [layoutReady, setLayoutReady] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<WidgetId | null>(null);
  const [dropId, setDropId] = React.useState<WidgetId | null>(null);

  React.useEffect(() => {
    if (layoutReady) return;
    if (layoutQ.isSuccess) {
      const { state, needsSync } = resolveInitialLayout(layoutQ.data?.layout, readLocalLayout());
      setLayout(state);
      lastPersistedRef.current = JSON.stringify(state);
      setLayoutReady(true);
      if (needsSync) {
        queuedRef.current = state;
        flushRef.current();
      } else {
        writeLocalLayout(state, false);
      }
    } else if (layoutQ.isError) {
      // Server unavailable: fall back to the locally saved layout, else the default.
      setLayout(readLocalLayout()?.state ?? DEFAULT_LAYOUT_STATE);
      setLayoutReady(true);
    }
  }, [layoutReady, layoutQ.isSuccess, layoutQ.isError, layoutQ.data]);

  const visibleIds = layout.order.filter((id) => !layout.hidden.includes(id));
  const hiddenIds = layout.order.filter((id) => layout.hidden.includes(id));

  // ─── Derived data ────────────────────────────────────────────
  const analytics = analyticsQ.data;
  const kpiByLabel = new Map((analytics?.kpis ?? []).map((k) => [k.label, k]));
  const branchRows: BranchRow[] = ((branchesQ.data ?? []) as unknown as Array<{
    locationId: string;
    locationName: string;
    salesCount: number;
    totalRevenuePaise: unknown;
  }>).map((row) => ({
    locationId: row.locationId,
    locationName: row.locationName,
    salesCount: row.salesCount,
    totalRevenuePaise: toNumber(row.totalRevenuePaise),
  }));
  const recentSales: RecentSaleRow[] = ((salesQ.data?.items ?? []) as unknown as Array<{
    id: string;
    saleNumber: string;
    customerId: string | null;
    customerName?: unknown;
    customer?: unknown;
    totalPaise: unknown;
    createdAt: string | Date;
  }>).map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    customerId: s.customerId,
    customerName: saleCustomerName(s),
    totalPaise: toNumber(s.totalPaise),
    createdAt: new Date(s.createdAt).toISOString(),
  }));
  const metalRates: MetalRateRow[] = ((ratesQ.data ?? []) as unknown as Array<{
    metalType: string;
    purity: number;
    ratePerGramPaise: unknown;
    changePercent: number | null;
  }>).map((r) => ({
    metalType: r.metalType,
    purity: r.purity,
    ratePerGramPaise: toNumber(r.ratePerGramPaise),
    changePercent: r.changePercent,
  }));

  // ─── Layout actions ──────────────────────────────────────────
  const hideWidget = (id: WidgetId) =>
    setLayout((l) => (l.hidden.includes(id) ? l : { ...l, hidden: [...l.hidden, id] }));
  const showWidget = (id: WidgetId) =>
    setLayout((l) => ({ ...l, hidden: l.hidden.filter((h) => h !== id) }));
  // Reset restores every widget in the default order and persists it right away
  // (local + server), so a stale hidden layout can never come back on reload.
  const resetLayout = () => {
    setSaveError(null);
    setLayout(DEFAULT_LAYOUT_STATE);
    persistLayout(DEFAULT_LAYOUT_STATE);
  };

  const handleDone = () => {
    if (!editMode) return;
    setSaveError(null);
    // Optimistic: persist locally and leave edit mode immediately, then sync.
    setEditMode(false);
    persistLayout(layout);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDragId(null);
    setDropId(null);
    setSaveError(null);
    // Discard unsaved changes: back to the last saved layout (local first, else server).
    const local = readLocalLayout();
    const restored = local ? local.state : buildLayoutState(layoutQ.data?.layout);
    setLayout(restored);
  };

  const endDrag = () => {
    setDragId(null);
    setDropId(null);
  };

  const dropOn = (targetId: WidgetId) => {
    if (dragId && dragId !== targetId) {
      setLayout((l) => ({ ...l, order: moveWidget(l.order, dragId, targetId) }));
    }
    endDrag();
  };

  // ─── Widget rendering ────────────────────────────────────────
  const renderWidget = (id: WidgetId) => {
    const def = getWidgetDefinition(id);
    const retryAnalytics = () => void analyticsQ.refetch();

    let body: React.ReactNode;
    if (KPI_META[id]) {
      const meta = KPI_META[id]!;
      body = (
        <KpiWidget
          title={meta.label}
          icon={meta.icon}
          kpi={kpiByLabel.get(meta.label)}
          isLoading={analyticsQ.isLoading}
          isError={analyticsQ.isError}
          onRetry={retryAnalytics}
          invalidRange={rangeInvalid}
        />
      );
    } else {
      switch (id) {
        case 'revenue-chart':
          body = rangeInvalid ? <InvalidRangeNotice /> : (
            <RevenueChartWidget
              chart={analytics?.charts[0]}
              from={toLocalDateString(range.from)}
              to={toLocalDateString(range.to)}
              isLoading={analyticsQ.isLoading}
              isError={analyticsQ.isError}
              onRetry={retryAnalytics}
            />
          );
          break;
        case 'alerts':
          body = (
            <AlertsWidget
              alerts={analytics?.alerts ?? []}
              isLoading={analyticsQ.isLoading}
              isError={analyticsQ.isError}
              onRetry={retryAnalytics}
            />
          );
          break;
        case 'branch-performance':
          body = rangeInvalid ? <InvalidRangeNotice /> : (
            <BranchPerformanceWidget
              rows={branchRows}
              isLoading={branchesQ.isLoading}
              isError={branchesQ.isError}
              onRetry={() => void branchesQ.refetch()}
            />
          );
          break;
        case 'recent-sales':
          body = (
            <RecentSalesWidget
              sales={recentSales}
              isLoading={salesQ.isLoading}
              isError={salesQ.isError}
              onRetry={() => void salesQ.refetch()}
            />
          );
          break;
        case 'metal-rates':
          body = (
            <MetalRatesWidget
              rates={metalRates}
              isLoading={ratesQ.isLoading}
              isError={ratesQ.isError}
              onRetry={() => void ratesQ.refetch()}
            />
          );
          break;
        default:
          body = null;
      }
    }

    return (
      <WidgetCard
        key={id}
        id={id}
        span={def.span}
        title={def.title}
        editMode={editMode}
        isDragging={dragId === id}
        isDropTarget={dropId === id}
        onHide={hideWidget}
        onDragStart={setDragId}
        onDragOver={(overId) => setDropId(overId)}
        onDrop={dropOn}
        onDragEnd={endDrag}
      >
        {body}
      </WidgetCard>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here is an overview of your business."
        actions={
          <div className="flex max-w-full flex-wrap items-center gap-2 sm:gap-3">
            <DateRangePicker
              from={range.from}
              to={range.to}
              onChange={(from, to) => setRange({ from, to })}
              onValidityChange={(valid) => setRangeInvalid(!valid)}
            />
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={resetLayout}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <RotateCcw className="h-4 w-4" /> Reset
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDone}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Done
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                disabled={!layoutReady}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                <Settings2 className="h-4 w-4" /> Customize
              </button>
            )}
          </div>
        }
      />

      {saveError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not save layout: {saveError}
        </div>
      )}

      {editMode && (
        <p className="text-sm text-muted-foreground">
          Drag widgets by their grip to reorder them, or hide ones you do not need. Click Done to save
          the layout for your account.
        </p>
      )}

      <div className="grid grid-cols-12 gap-6">{visibleIds.map((id) => renderWidget(id))}</div>

      {visibleIds.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          All widgets are hidden.{' '}
          {!editMode && 'Click Customize to show them again.'}
        </div>
      )}

      {editMode && hiddenIds.length > 0 && (
        <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-6">
          <h3 className="mb-3 text-sm font-semibold text-primary/80">Hidden widgets</h3>
          <div className="flex flex-wrap gap-2">
            {hiddenIds.map((id) => {
              const def = getWidgetDefinition(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => showWidget(id)}
                  className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
                >
                  <Eye className="h-4 w-4" /> Show {def.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {editMode && hiddenIds.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {WIDGET_DEFINITIONS.length} widgets available. Hidden widgets appear here.
        </p>
      )}
    </div>
  );
}
