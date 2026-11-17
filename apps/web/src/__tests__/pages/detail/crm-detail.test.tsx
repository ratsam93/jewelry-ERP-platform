import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test query results keyed by tRPC path (e.g. 'crm.customer360').
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

const customerFixture = {
  customer: {
    firstName: 'Asha',
    lastName: 'Rao',
    phone: '+919800000001',
    email: 'asha@example.com',
    city: 'Mumbai',
    customerType: 'RETAIL',
  },
  stats: { totalSpentPaise: 5000000, totalOrders: 3, loyaltyPoints: 120, averageTicketPaise: 1666667 },
};

const leadFixture = {
  id: 'lead-1',
  name: 'Vikram Shah',
  status: 'NEW',
  source: 'WALK_IN',
  phone: '+919800000002',
  email: null,
  notes: null,
};

const campaignFixture = {
  id: 'camp-1',
  name: 'Diwali Gold Offer',
  status: 'DRAFT',
  channel: 'EMAIL',
  subject: 'Festive offer',
  audienceCount: 120,
  scheduledAt: null,
};

const consultationFixture = {
  id: 'cons-1',
  status: 'REQUESTED',
  customer: { firstName: 'Asha', lastName: 'Rao', phone: null, email: null },
  preferredLang: 'en',
  requestedAt: '2026-04-10T00:00:00.000Z',
  scheduledAt: null,
  startedAt: null,
  endedAt: null,
  meetingUrl: null,
  notes: null,
};

beforeEach(() => {
  mockState.queries = {};
});

describe('CRM Detail Pages', () => {
  describe('Customer Detail [id]', () => {
    it('renders the customer name when data is present', async () => {
      mockState.queries['crm.customer360'] = { data: customerFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/customers/[id]/page'
      );
      render(<Page />);
      expect(screen.getAllByText('Asha Rao').length).toBeGreaterThan(0);
    });

    it('renders a not-found state when the customer is null', async () => {
      mockState.queries['crm.customer360'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/customers/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
    });
  });

  describe('Lead Detail [id]', () => {
    it('renders the lead name when data is present', async () => {
      mockState.queries['crm.leadGet'] = { data: leadFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/leads/[id]/page'
      );
      render(<Page />);
      expect(screen.getAllByText('Vikram Shah').length).toBeGreaterThan(0);
    });

    it('renders a not-found state when the lead is null', async () => {
      mockState.queries['crm.leadGet'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/leads/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Lead not found' })).toBeInTheDocument();
    });
  });

  describe('Campaign Detail [id]', () => {
    it('renders the campaign name when data is present', async () => {
      mockState.queries['crm.campaignGet'] = { data: campaignFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/campaigns/[id]/page'
      );
      render(<Page />);
      expect(screen.getAllByText('Diwali Gold Offer').length).toBeGreaterThan(0);
    });

    it('renders a not-found state when the campaign is null', async () => {
      mockState.queries['crm.campaignGet'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/campaigns/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Campaign not found' })).toBeInTheDocument();
    });
  });

  describe('Consultation Detail [id]', () => {
    it('renders the consultation title when data is present', async () => {
      mockState.queries['crm.videoConsultation.get'] = { data: consultationFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/consultations/[id]/page'
      );
      render(<Page />);
      expect(screen.getAllByText('Consultation with Asha Rao').length).toBeGreaterThan(0);
    });

    it('renders a not-found state when the consultation is null', async () => {
      mockState.queries['crm.videoConsultation.get'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/consultations/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Consultation not found' })).toBeInTheDocument();
    });
  });
});
