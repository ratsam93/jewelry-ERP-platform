import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test query results keyed by tRPC path (e.g. 'compliance.certificates.getById').
// Paths not set here return { data: undefined } like the global setup mock.
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, { data?: unknown; isLoading?: boolean; error?: unknown }>,
}));

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'useQuery') {
            return () => {
              const entry = mockState.queries[path.join('.')];
              return {
                data: entry?.data,
                isLoading: entry?.isLoading ?? false,
                error: entry?.error ?? null,
                refetch: vi.fn(),
              };
            };
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null, isSuccess: false });
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

// Mock feature components used by compliance detail pages
vi.mock('@/features/compliance', () => ({
  HuidBadge: ({ huid }: { huid: string }) => (
    <span data-testid="huid-badge">{huid}</span>
  ),
  HallmarkStatusTracker: ({ status }: { status: string }) => (
    <div data-testid="hallmark-status-tracker">Status: {status}</div>
  ),
  TraceabilityTimeline: ({ chain }: { chain: unknown[] }) => (
    <div data-testid="traceability-timeline">Traceability ({chain?.length ?? 0} events)</div>
  ),
}));

const certificateFixture = {
  id: 'cert-1',
  certificateNumber: 'GIA-2201',
  issuingLab: 'GIA',
  stoneType: 'DIAMOND',
  caratWeight: 100,
  shape: 'Round',
  color: 'F',
  clarity: 'VS1',
  cut: 'Excellent',
  fluorescence: 'None',
  dimensions: null,
  imageUrl: null,
  certificateUrl: null,
  isVerified: false,
  verifiedAt: null,
  product: { id: 'prod-1', sku: 'RG-001', name: 'Solitaire Ring' },
};

const traceabilityFixture = {
  product: { id: 'prod-1', sku: 'RG-001', name: 'Solitaire Ring' },
  huidRecord: null,
  certificates: [],
  events: [],
};

beforeEach(() => {
  mockState.queries = {};
});

describe('Compliance Detail Pages', () => {
  describe('HUID Detail [id]', () => {
    it('renders HUID Detail page header when loading', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/huid/[id]/page'
      );
      render(<Page />);
      // tRPC mock returns undefined data with isLoading: false -> shows "not found"
      expect(screen.getByText('HUID Not Found')).toBeInTheDocument();
    });

    it('renders not found message for missing records', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/huid/[id]/page'
      );
      render(<Page />);
      expect(
        screen.getByText('The requested HUID record could not be found.')
      ).toBeInTheDocument();
    });
  });

  describe('Hallmark Submission Detail [id]', () => {
    it('renders Submission Detail or Not Found page header', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/hallmark/[id]/page'
      );
      render(<Page />);
      // tRPC mock returns undefined -> shows not-found variant
      expect(screen.getByTestId('page-header')).toBeInTheDocument();
    });
  });

  describe('New Hallmark Submission', () => {
    it('renders with page header title "New Hallmark Submission"', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/hallmark/new/page'
      );
      render(<Page />);
      expect(screen.getByText('New Hallmark Submission')).toBeInTheDocument();
    });

    it('renders the submission form without crashing', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/hallmark/new/page'
      );
      const { container } = render(<Page />);
      expect(container).toBeTruthy();
    });
  });

  describe('Certificate Detail [id]', () => {
    it('renders the certificate page header when data is present', async () => {
      mockState.queries['compliance.certificates.getById'] = { data: certificateFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/certificates/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toBeInTheDocument();
      expect(screen.getByText('Certificate: GIA-2201')).toBeInTheDocument();
    });

    it('renders a not-found state when the certificate is null', async () => {
      mockState.queries['compliance.certificates.getById'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/certificates/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Certificate not found' })).toBeInTheDocument();
    });
  });

  describe('Traceability [productId]', () => {
    it('renders the traceability page header when data is present', async () => {
      mockState.queries['compliance.traceability.getChain'] = { data: traceabilityFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/traceability/[productId]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toBeInTheDocument();
      expect(screen.getByText('Traceability: Solitaire Ring')).toBeInTheDocument();
    });

    it('renders a not-found state when the chain is null', async () => {
      mockState.queries['compliance.traceability.getChain'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/compliance/traceability/[productId]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument();
    });
  });
});
