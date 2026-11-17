import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fake server: remembers the last saved layout like reporting.saveDashboardLayout does.
const h = vi.hoisted(() => ({
  server: { layout: null as null | { layout: unknown[]; updatedAt: Date }, saves: 0, failSaves: false, hold: false, pending: [] as Array<() => void>, inFlightMax: 0, inFlight: 0 },
  analytics: {} as Record<string, unknown>,
}));

vi.mock('@/lib/trpc', () => {
  function proxy(path: string[]): unknown {
    return new Proxy({}, {
      get(_t, prop: string) {
        const full = path.join('.');
        if (prop === 'useQuery') {
          return () => {
            if (full === 'reporting.getDashboardLayout') {
              return { data: h.server.layout, isSuccess: true, isError: false, isLoading: false, refetch: vi.fn() };
            }
            if (full === 'reporting.getAnalyticsDashboard') {
              return { data: h.analytics.data, isSuccess: !h.analytics.error, isError: Boolean(h.analytics.error), error: h.analytics.error ?? null, isLoading: false, refetch: vi.fn() };
            }
            return { data: undefined, isSuccess: true, isError: false, isLoading: false, refetch: vi.fn() };
          };
        }
        if (prop === 'useMutation') {
          return (opts: { onSuccess?: () => void; onError?: (e: Error) => void }) => ({
            isPending: false,
            mutate: (input: { layout: unknown[] }) => {
              if (full !== 'reporting.saveDashboardLayout') return;
              if (h.server.failSaves) { opts.onError?.(new Error('offline')); return; }
              const commit = () => {
                h.server.inFlight -= 1;
                h.server.saves += 1;
                h.server.layout = { layout: JSON.parse(JSON.stringify(input.layout)), updatedAt: new Date() };
                opts.onSuccess?.();
              };
              h.server.inFlight += 1;
              h.server.inFlightMax = Math.max(h.server.inFlightMax, h.server.inFlight);
              if (h.server.hold) h.server.pending.push(commit);
              else commit();
            },
          });
        }
        if (prop === 'useUtils') return () => proxy(['utils']);
        if (prop === 'invalidate') return () => Promise.resolve();
        return proxy([...path, prop]);
      },
    });
  }
  return { trpc: proxy([]) };
});
vi.mock('@caratflow/ui', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    // The shared mock drops header actions; the Customize buttons live there.
    PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
      <div><h1>{title}</h1>{actions}</div>
    ),
  };
});
vi.mock('@/store/ui-store', () => ({ useUiStore: (sel: (s: { activeBranchId: string | null }) => unknown) => sel({ activeBranchId: null }) }));

import DashboardPage from '../../../app/(dashboard)/dashboard/page';

const text = () => document.body.textContent ?? '';
async function customize() {
  await waitFor(() => expect((screen.getByRole('button', { name: /Customize/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /Customize/ }));
}
const reload = () => { cleanup(); return render(<DashboardPage />); };

beforeEach(() => {
  localStorage.clear();
  h.server.layout = null;
  h.server.saves = 0;
  h.server.failSaves = false;
  h.server.hold = false;
  h.server.pending = [];
  h.server.inFlight = 0;
  h.server.inFlightMax = 0;
  h.analytics = {};
});
afterEach(() => cleanup());

describe('dashboard Customize flow (HK-RPT-01)', () => {
  it('hide -> Done -> reload keeps Alerts hidden; Reset -> Done -> reload shows everything', async () => {
    render(<DashboardPage />);
    await customize();
    fireEvent.click(screen.getByRole('button', { name: /Hide Alerts|Hide widget Alerts|Hide.*Alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(h.server.saves).toBe(1);

    reload();
    await waitFor(() => expect(screen.getByRole('button', { name: /Customize/ })).toBeTruthy());
    expect(screen.queryByText('Alerts')).toBeNull();

    await customize();
    expect(screen.getByRole('button', { name: /Show Alerts/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(screen.queryByRole('button', { name: /Show Alerts/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(h.server.saves).toBe(2);
    expect((h.server.layout!.layout as Array<{ widgetId: string; config: { hidden: boolean } }>).every((w) => w.config.hidden === false)).toBe(true);

    reload();
    await waitFor(() => expect(screen.getByRole('button', { name: /Customize/ })).toBeTruthy());
    expect(screen.getAllByText('Alerts').length).toBeGreaterThan(0);
  });

  it('a reset made while the server is unreachable beats the stale hidden server layout on reload', async () => {
    // Server still has Alerts hidden (stale)
    h.server.layout = {
      updatedAt: new Date('2026-01-01'),
      layout: ['kpi-revenue', 'kpi-sales-count', 'kpi-avg-ticket', 'kpi-new-customers', 'revenue-chart', 'alerts', 'branch-performance', 'recent-sales', 'metal-rates']
        .map((id, y) => ({ widgetId: id, x: 0, y, w: 3, h: 1, config: { hidden: id === 'alerts' } })),
    };
    h.server.failSaves = true;
    render(<DashboardPage />);
    await customize();
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    h.server.failSaves = false;
    reload();
    await waitFor(() => expect(screen.getByRole('button', { name: /Customize/ })).toBeTruthy());
    expect(screen.getAllByText('Alerts').length).toBeGreaterThan(0);
    // and the pending reset was pushed to the server on load
    await waitFor(() => expect(h.server.saves).toBe(1));
  });
});

describe('save ordering', () => {
  it('a pending sync of a stale hidden layout cannot overwrite a later Reset', async () => {
    // Local copy is an unsynced "Alerts hidden" layout (e.g. a previous Done whose save failed).
    const hiddenOrder = ['kpi-revenue', 'kpi-sales-count', 'kpi-avg-ticket', 'kpi-new-customers', 'revenue-chart', 'alerts', 'branch-performance', 'recent-sales', 'metal-rates'];
    localStorage.setItem('caratflow.dashboard.layout.v1', JSON.stringify({ state: { order: hiddenOrder, hidden: ['alerts'] }, dirty: true }));
    h.server.hold = true;
    render(<DashboardPage />);
    await customize(); // load pushed the stale layout (request 1 is still in flight)
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    // Only one request may be in flight; the reset waits its turn.
    expect(h.server.inFlightMax).toBe(1);
    expect(h.server.pending).toHaveLength(1);
    await act(async () => { h.server.pending.shift()!(); });
    expect(h.server.pending).toHaveLength(1);
    await act(async () => { h.server.pending.shift()!(); });
    const layout = h.server.layout!.layout as Array<{ config: { hidden: boolean } }>;
    expect(layout.every((w) => w.config.hidden === false)).toBe(true);
    expect(JSON.parse(localStorage.getItem('caratflow.dashboard.layout.v1')!).dirty).toBe(false);
  });
});

describe('dashboard date range validity (HK-RPT-03)', () => {
  it('shows a neutral state instead of stale KPI numbers for an end-before-start range', async () => {
    h.analytics = {
      data: {
        kpis: [{ label: 'Total Revenue', formattedValue: '₹9,99,999', value: 1, trend: null }],
        charts: [],
        alerts: [],
      },
    };
    render(<DashboardPage />);
    await waitFor(() => expect(text()).toContain('₹9,99,999'));
    const from = screen.getByLabelText('From date') as HTMLInputElement;
    const to = screen.getByLabelText('To date') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-11-20' } });
    fireEvent.change(to, { target: { value: '2026-11-10' } });
    await waitFor(() => expect(text()).toContain('Select a valid date range'));
    expect(text()).not.toContain('₹9,99,999');
    // fixing the range restores the numbers
    fireEvent.change(to, { target: { value: '2026-11-25' } });
    await waitFor(() => expect(text()).toContain('₹9,99,999'));
  });
});
