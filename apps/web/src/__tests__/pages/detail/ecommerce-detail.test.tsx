import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-procedure query results for the tRPC mock. Keys are the dotted procedure
// path (e.g. 'ecommerce.getOrder'). Unset keys resolve to `data: undefined`,
// which the detail pages render as their not-found state.
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
}));

// Re-mock @/lib/trpc so each detail procedure can return realistic data.
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

// Mock feature components used by ecommerce detail pages
vi.mock('@/features/ecommerce', () => ({
  OrderTimeline: ({ events }: { events?: unknown[] }) => (
    <div data-testid="order-timeline">Order Timeline ({events?.length ?? 0} events)</div>
  ),
  ChannelBadge: ({ channel }: { channel: string }) => (
    <span data-testid="channel-badge">{channel}</span>
  ),
  PaymentStatusBadge: ({ status }: { status: string }) => (
    <span data-testid="payment-status-badge">{status}</span>
  ),
  ShipmentTracker: (_props: Record<string, unknown>) => (
    <div data-testid="shipment-tracker">Shipment Tracker</div>
  ),
  SyncStatusIndicator: ({ status }: { status: string }) => (
    <span data-testid="sync-status">{status}</span>
  ),
}));

const orderFixture = {
  id: 'ord-1',
  orderNumber: 'ORD-1001',
  status: 'PENDING',
  customerName: 'Asha Rao',
  placedAt: '2026-04-10T00:00:00.000Z',
  totalPaise: 100000,
  items: [
    { id: 'item-1', title: 'Gold Ring 22K', quantity: 1, unitPricePaise: 100000, totalPaise: 100000 },
  ],
};

const channelFixture = {
  id: 'ch-1',
  name: 'Website Store',
  channelType: 'SHOPIFY',
  storeUrl: 'https://store.example.com',
  isActive: true,
  lastSyncAt: null,
};

const preOrderFixture = {
  id: 'po-1',
  preOrderNumber: 'PO-2026-001',
  status: 'CONFIRMED',
  customerName: 'Asha Rao',
  product: { name: 'Bridal Necklace' },
  totalPaise: 4500000,
  depositPaise: 1000000,
  expectedDate: '2026-09-01T00:00:00.000Z',
};

const catalogFixture = {
  id: 'cat-1',
  product: { name: 'Temple Jhumka Set' },
  channel: { name: 'Website Store' },
  syncStatus: 'SYNCED',
  pricePaise: 4500000,
  lastSyncAt: null,
};

beforeEach(() => {
  mockState.queries = {};
});

describe('E-Commerce Detail Pages', () => {
  describe('Order Detail [id]', () => {
    it('renders without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/orders/[id]/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });

    it('renders the order number and items when data is loaded', async () => {
      mockState.queries['ecommerce.getOrder'] = orderFixture;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/orders/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('ORD-1001');
      expect(screen.getByText('Gold Ring 22K')).toBeInTheDocument();
    });

    it('renders a not-found state when the order does not exist', async () => {
      mockState.queries['ecommerce.getOrder'] = null;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/orders/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Order not found' })).toBeInTheDocument();
      expect(screen.queryByTestId('page-header')).toBeNull();
    });
  });

  describe('Channel Detail [id]', () => {
    it('renders without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/channels/[id]/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });

    it('renders the channel name when data is loaded', async () => {
      mockState.queries['ecommerce.getChannel'] = channelFixture;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/channels/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('Website Store');
    });
  });

  describe('Pre-Order Detail [id]', () => {
    it('renders without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/preorders/[id]/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });

    it('renders the pre-order number when data is loaded', async () => {
      mockState.queries['preorder.getPreOrder'] = preOrderFixture;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/preorders/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('PO-2026-001');
    });
  });

  describe('Catalog Item Detail [id]', () => {
    it('renders the product name when data is loaded', async () => {
      mockState.queries['ecommerce.getCatalogItem'] = catalogFixture;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/catalog/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('Temple Jhumka Set');
    });

    it('renders a not-found state when the catalog item does not exist', async () => {
      mockState.queries['ecommerce.getCatalogItem'] = null;
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/catalog/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Catalog item not found' })).toBeInTheDocument();
    });
  });

  describe('AR Config [productId]', () => {
    it('renders without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/ar/[productId]/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });

    it('renders page header element', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/ecommerce/ar/[productId]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toBeInTheDocument();
    });
  });
});
