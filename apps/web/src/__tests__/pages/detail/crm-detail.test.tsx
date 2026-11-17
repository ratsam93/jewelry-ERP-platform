import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test query results keyed by tRPC path (e.g. 'crm.customer360').
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, { data?: unknown; isLoading?: boolean; error?: unknown }>,
}));

const routeState = vi.hoisted(() => ({ id: '6ecfac52-f967-41a6-a76c-1abd8712078e' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({ id: routeState.id }),
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

// Real crm.customer360 shape ({ profile, loyalty, purchaseHistory, ... }).
const customerFixture = {
  profile: {
    id: '6ecfac52-f967-41a6-a76c-1abd8712078e',
    firstName: 'Asha',
    lastName: 'Rao',
    phone: '+919800000001',
    email: 'asha@example.com',
    city: 'Mumbai',
    customerType: 'RETAIL',
    panNumber: 'ABXXXXXXXF',
    aadhaarNumber: 'XXXX-XXXX-0124',
  },
  loyalty: { currentPoints: 120, tier: null, lifetimeEarned: 120, lifetimeRedeemed: 0, recentTransactions: [] },
  purchaseHistory: [
    { id: 'i1', totalPaise: 4000000, date: '2026-01-01T00:00:00.000Z', itemCount: 2 },
    { id: 'i2', totalPaise: 1000000, date: '2026-02-01T00:00:00.000Z', itemCount: 1 },
  ],
  occasions: [], recentInteractions: [], feedback: [], schemes: [],
};

// Real crm.leadGet shape: firstName/lastName, BigInt paise as a string.
const leadFixture = {
  id: 'lead-1',
  firstName: 'Vikram',
  lastName: 'Shah',
  estimatedValuePaise: '2614800',
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
  totalRecipients: 120,
  sentCount: 100,
  deliveredCount: 90,
  failedCount: 2,
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
      expect(screen.getByText('asha@example.com')).toBeInTheDocument();
      expect(screen.getAllByText('+919800000001').length).toBeGreaterThan(0);
      expect(screen.getByText('Mumbai')).toBeInTheDocument();
      expect(screen.getByText('ABXXXXXXXF')).toBeInTheDocument();
      expect(screen.getByText('₹50,000.00')).toBeInTheDocument(); // total spent from purchaseHistory
      expect(screen.getByText('120')).toBeInTheDocument(); // loyalty points
    });

    it('renders not-found (not a load error) for a non-UUID id such as "new"', async () => {
      routeState.id = 'new';
      mockState.queries['crm.customer360'] = { error: { message: 'Invalid input', data: { code: 'BAD_REQUEST' } } };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/crm/customers/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Customer not found' })).toBeInTheDocument();
      expect(screen.queryByText(/could not load/i)).toBeNull();
      routeState.id = '6ecfac52-f967-41a6-a76c-1abd8712078e';
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
      expect(screen.getByText('₹26,148.00')).toBeInTheDocument(); // estimated value
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
      expect(screen.getByText('120')).toBeInTheDocument(); // totalRecipients
      expect(screen.getByText('100 / 90 / 2')).toBeInTheDocument();
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
