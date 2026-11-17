import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sale: {
    id: 'e17b180f-0e09-4d81-8238-c02ea59fe604',
    saleNumber: 'INV-DEMO-00024',
    status: 'COMPLETED',
    subtotalPaise: 13489580,
    taxPaise: 404686,
    discountPaise: 0,
    totalPaise: 13894266,
    lineItems: [
      { id: 'l1', description: 'Gold ring 22K', quantity: 1, unitPricePaise: 8515880, lineTotalPaise: 8771356 },
      { id: 'l2', description: 'Gold chain 18K', quantity: 2, unitPricePaise: 4973700, lineTotalPaise: 5122910 },
    ],
    payments: [],
  },
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    retail: {
      getSale: { useQuery: () => ({ data: h.sale, isLoading: false, error: null, refetch: vi.fn() }) },
      voidSale: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'e17b180f-0e09-4d81-8238-c02ea59fe604' }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

import SaleDetailPage from '../../../../app/(dashboard)/retail/sales/[id]/page';

describe('sale detail page', () => {
  it('renders the API lineItems and the sale number', () => {
    render(<SaleDetailPage />);
    expect(screen.queryByText('No items')).not.toBeInTheDocument();
    expect(screen.getByText('Gold ring 22K')).toBeInTheDocument();
    expect(screen.getByText('Gold chain 18K')).toBeInTheDocument();
    expect(screen.getAllByText('INV-DEMO-00024').length).toBeGreaterThan(0);
  });
});
