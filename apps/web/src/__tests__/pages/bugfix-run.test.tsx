import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  analyticsInputs: [] as unknown[],
  createSupplier: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/trpc', () => {
  function proxy(path: string[]): unknown {
    return new Proxy({}, {
      get(_t, prop: string) {
        const full = path.join('.');
        if (prop === 'useQuery') {
          return (input: unknown) => {
            if (full === 'reporting.getAnalyticsDashboard') h.analyticsInputs.push(input);
            return { data: undefined, isLoading: false, error: null };
          };
        }
        if (prop === 'useMutation') {
          return () => ({
            mutateAsync: full === 'wholesale.createSupplier' ? h.createSupplier : vi.fn(),
            isPending: false,
            error: null,
          });
        }
        return proxy([...path, prop]);
      },
    });
  }
  return { trpc: proxy([]) };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import ReportsDashboardPage from '../../../app/(dashboard)/reports/page';
import NewSupplierPage from '../../../app/(dashboard)/wholesale/suppliers/new/page';
import { pickDefaultLocation } from '@/lib/pos-location';

beforeEach(() => {
  h.analyticsInputs.length = 0;
  h.createSupplier.mockReset();
  h.push.mockReset();
});

describe('reports dashboard query input', () => {
  it('is referentially stable across rerenders', () => {
    const { rerender } = render(<ReportsDashboardPage />);
    rerender(<ReportsDashboardPage />);
    rerender(<ReportsDashboardPage />);
    expect(h.analyticsInputs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(h.analyticsInputs).size).toBe(1);
  });
});

describe('new supplier page', () => {
  it('shows validation errors and does not submit without a name', async () => {
    render(<NewSupplierPage />);
    fireEvent.click(screen.getByRole('button', { name: /create supplier/i }));
    expect(await screen.findByText('Supplier name is required')).toBeInTheDocument();
    expect(h.createSupplier).not.toHaveBeenCalled();
  });

  it('submits and redirects to the detail page', async () => {
    h.createSupplier.mockResolvedValue({ id: 'abc' });
    render(<NewSupplierPage />);
    fireEvent.change(screen.getByLabelText('Supplier name *'), { target: { value: ' Acme Gold ' } });
    fireEvent.click(screen.getByRole('button', { name: /create supplier/i }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/wholesale/suppliers/abc'));
    expect(h.createSupplier).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme Gold', isActive: true, country: 'IN' }));
  });
});

describe('pickDefaultLocation', () => {
  const branches = [
    { id: 'a', name: 'Warehouse', locationType: 'WAREHOUSE' },
    { id: 'b', name: 'Main Showroom', locationType: 'SHOWROOM' },
    { id: 'c', name: 'Vault', locationType: 'VAULT', isPrimary: true },
  ];
  it('skips locations without stock', () => {
    expect(pickDefaultLocation(branches, new Set(['b']))).toBe('b');
    expect(pickDefaultLocation(branches, new Set(['a']))).toBe('a');
  });
  it('prefers primary among stocked, then showroom', () => {
    expect(pickDefaultLocation(branches, new Set(['a', 'b', 'c']))).toBe('c');
    expect(pickDefaultLocation(branches, new Set(['a', 'b']))).toBe('b');
  });
  it('falls back without stock data', () => {
    expect(pickDefaultLocation(branches, null)).toBe('c');
    expect(pickDefaultLocation(branches, new Set())).toBe('c');
    expect(pickDefaultLocation([], null)).toBe('');
  });
});
