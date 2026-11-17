import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mutable state for the tRPC and router mocks, so each test can set the payload it needs.
const mockState = vi.hoisted(() => ({
  trialBalance: { data: undefined as unknown, isLoading: false, isError: false } as {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
  },
  highRiskCustomers: { data: undefined as unknown } as { data: unknown },
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockState.replace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
}));

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'useQuery') {
            return () => {
              const key = path.join('.');
              if (key === 'financial.reports.trialBalance') {
                return { ...mockState.trialBalance, error: null, refetch: vi.fn() };
              }
              if (key === 'aml.highRiskCustomers') {
                return { data: mockState.highRiskCustomers.data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
              }
              return { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
            };
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
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

// The trial balance response exactly as the API returns it (TrialBalanceReport in shared-types).
const realTrialBalance = {
  asOfDate: '2026-11-30T00:00:00.000Z',
  accounts: [
    {
      accountId: 'acc-1',
      accountCode: '1001',
      accountName: 'Cash in Hand',
      accountType: 'ASSET',
      debitTotal: 150000,
      creditTotal: 0,
      balance: 150000,
    },
    {
      accountId: 'acc-2',
      accountCode: '4001',
      accountName: 'Sales Revenue',
      accountType: 'REVENUE',
      debitTotal: 0,
      creditTotal: 150000,
      balance: -150000,
    },
  ],
  totalDebits: 150000,
  totalCredits: 150000,
};

describe('ADM-003: Trial balance page', () => {
  beforeEach(() => {
    mockState.trialBalance = { data: undefined, isLoading: false, isError: false };
  });

  it('renders accounts, totals and range label from the real response shape', async () => {
    mockState.trialBalance = { data: realTrialBalance, isLoading: false, isError: false };
    const { default: Page } = await import('../../../../app/(dashboard)/finance/reports/trial-balance/page');
    render(<Page />);

    expect(screen.getByText('Cash in Hand')).toBeInTheDocument();
    expect(screen.getByText('Sales Revenue')).toBeInTheDocument();
    expect(screen.getByText('1001')).toBeInTheDocument();
    // Paise amounts are formatted as rupees: 150000 paise = 1,500.00
    expect(screen.getAllByText(/1,500\.00/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Total')).toBeInTheDocument();
    // The label shows the selected range (HK-FIN-14), not only the end date.
    expect(screen.getByText(/^From \d{2} \w{3} \d{4} to \d{2} \w{3} \d{4}$/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no accounts', async () => {
    mockState.trialBalance = {
      data: { asOfDate: '2026-11-30T00:00:00.000Z', accounts: [], totalDebits: 0, totalCredits: 0 },
      isLoading: false,
      isError: false,
    };
    const { default: Page } = await import('../../../../app/(dashboard)/finance/reports/trial-balance/page');
    render(<Page />);
    expect(screen.getByText(/No accounts with activity/)).toBeInTheDocument();
  });

  it('shows loading state without crashing', async () => {
    mockState.trialBalance = { data: undefined, isLoading: true, isError: false };
    const { default: Page } = await import('../../../../app/(dashboard)/finance/reports/trial-balance/page');
    render(<Page />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error state without crashing', async () => {
    mockState.trialBalance = { data: undefined, isLoading: false, isError: true };
    const { default: Page } = await import('../../../../app/(dashboard)/finance/reports/trial-balance/page');
    render(<Page />);
    expect(screen.getByText('Failed to load trial balance.')).toBeInTheDocument();
  });
});

describe('ADM-005: AML customers page links', () => {
  afterEach(() => cleanup());

  it('links the view action to the CRM customer detail route', async () => {
    mockState.highRiskCustomers = {
      data: {
        items: [
          {
            id: 'risk-1',
            customerId: 'cust-123',
            customerName: 'Asha Rao',
            riskScore: 80,
            riskLevel: 'HIGH',
            kycStatus: 'PARTIAL',
            transactionVolumePaise: 500000,
            transactionCount: 4,
            flagCount: 1,
            lastAssessedAt: null,
            nextReviewDate: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    };
    const { default: Page } = await import('../../../../app/(dashboard)/compliance/aml/customers/page');
    render(<Page />);
    await waitFor(() => expect(screen.getByText('Asha Rao')).toBeInTheDocument());
    const link = screen.getByTitle('View Customer');
    expect(link.getAttribute('href')).toBe('/crm/customers/cust-123');
  });
});

describe('ADM-006: Ecommerce search is deterministic', () => {
  it('formats mock analytics numbers with the en-IN locale', async () => {
    const { default: Page } = await import('../../../../app/(dashboard)/ecommerce/search/page');
    render(<Page />);
    expect(screen.getByText('12,847')).toBeInTheDocument();
    expect(screen.getByText('3,421')).toBeInTheDocument();
  });
});

describe('ADM-007: Root route redirect', () => {
  beforeEach(() => {
    mockState.replace.mockClear();
    window.localStorage.clear();
  });

  it('redirects to /dashboard when an access token exists', async () => {
    window.localStorage.setItem('accessToken', 'token-value');
    const { default: Page } = await import('../../../../app/page');
    const { container } = render(<Page />);
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(mockState.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('redirects to /login when no access token exists', async () => {
    const { default: Page } = await import('../../../../app/page');
    render(<Page />);
    await waitFor(() => expect(mockState.replace).toHaveBeenCalledWith('/login'));
  });
});
