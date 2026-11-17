import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-procedure query results for the tRPC mock. Unset keys resolve to
// `data: undefined`, which the detail pages render as their not-found state.
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
}));

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'useQuery') {
            return () => ({
              data: mockState.queries[path.join('.')],
              isLoading: false,
              isError: false,
              error: null,
              refetch: vi.fn(),
            });
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, isError: false });
          }
          if (prop === 'useUtils') {
            return () => createProxy([]);
          }
          return createProxy([...path, prop]);
        },
      },
    );
  }
  return { trpc: createProxy([]) };
});

const exportOrderFixture = {
  id: 'exo-1',
  orderNumber: 'EXP-ORD-0042',
  status: 'DRAFT',
  buyerName: 'Gem Imports LLC',
  destinationCountry: 'US',
  totalValuePaise: 25000000,
  orderDate: '2026-05-01T00:00:00.000Z',
  shipmentDate: null,
};

const exportInvoiceFixture = {
  id: 'exi-1',
  invoiceNumber: 'EXP-INV-0007',
  invoiceType: 'EXPORT',
  currency: 'USD',
  totalPaise: 25000000,
  issuedDate: '2026-05-02T00:00:00.000Z',
};

beforeEach(() => {
  mockState.queries = {};
});

describe('Export Detail Pages', () => {
  describe('Export Order Detail [id]', () => {
    it('renders without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/orders/[id]/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });

    it('renders the order number and buyer when data is loaded', async () => {
      mockState.queries['export.getOrder'] = exportOrderFixture;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/orders/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('EXP-ORD-0042');
      expect(screen.getByText('Gem Imports LLC')).toBeInTheDocument();
    });

    it('renders a not-found state when the export order does not exist', async () => {
      mockState.queries['export.getOrder'] = null;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/orders/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Export order not found' })).toBeInTheDocument();
    });
  });

  describe('New Export Order', () => {
    it('renders with page header title "New Export Order"', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/orders/new/page'
      );
      render(<Page />);
      expect(screen.getByText('New Export Order')).toBeInTheDocument();
    });
  });

  describe('Export Invoice Detail [id]', () => {
    it('renders without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/invoices/[id]/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });

    it('renders the invoice number when data is loaded', async () => {
      mockState.queries['export.getInvoice'] = exportInvoiceFixture;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/invoices/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('EXP-INV-0007');
    });

    it('renders a not-found state when the invoice does not exist', async () => {
      mockState.queries['export.getInvoice'] = null;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/invoices/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Export invoice not found' })).toBeInTheDocument();
    });
  });

  describe('New Export Invoice', () => {
    it('renders with page header title "New Export Invoice"', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/export/invoices/new/page'
      );
      render(<Page />);
      expect(screen.getByText('New Export Invoice')).toBeInTheDocument();
    });
  });
});
