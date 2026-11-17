import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  error: null as { message: string } | null,
  queries: {} as Record<string, unknown>,
  push: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockState.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
}));

// The shared UI mock drops PageHeader `actions`; render them so the header buttons are testable.
vi.mock('@caratflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
      <div data-testid="page-header">
        <h1>{title}</h1>
        {actions}
      </div>
    ),
  };
});

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'useQuery') {
            return () => ({ data: mockState.queries[path.join('.')], isLoading: false, error: null, refetch: vi.fn() });
          }
          if (prop === 'useMutation') {
            return () => ({ mutateAsync: mockState.mutateAsync, mutate: vi.fn(), isPending: false, error: mockState.error });
          }
          if (prop === 'invalidate') return mockState.invalidate;
          if (prop === 'useUtils') return () => createProxy([]);
          return createProxy([...path, prop]);
        },
      },
    );
  }
  return { trpc: createProxy([]) };
});

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  mockState.mutateAsync.mockReset();
  mockState.push.mockReset();
  mockState.invalidate.mockReset();
  mockState.error = null;
  mockState.queries = {};
});

describe('Add Customer flow', () => {
  it('list page links to /crm/customers/new and shows "-" placeholders for missing values', async () => {
    mockState.queries['crm.customerList'] = {
      items: [{ id: 'c1', firstName: 'Asha', lastName: 'Rao', phone: null, email: null, city: null, customerType: 'RETAIL' }],
      totalPages: 1, page: 1,
    };
    const { default: Page } = await import('../../../app/(dashboard)/crm/customers/page');
    render(<Page />);
    expect(screen.getByRole('link', { name: /Add Customer/ })).toHaveAttribute('href', '/crm/customers/new');
    const row = screen.getByText('Asha Rao').closest('a')!;
    expect(row.querySelectorAll('span')).toHaveLength(5); // no cell collapses
    expect(row.textContent).toContain('RETAIL');
    expect(screen.getAllByText('-')).toHaveLength(3);
  });

  it('validates client-side and does not call the API', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/crm/customers/new/page');
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(mockState.mutateAsync).not.toHaveBeenCalled();
  });

  it('submits an E.164 payload, refreshes the list and redirects to the new customer', async () => {
    mockState.mutateAsync.mockResolvedValue({ id: 'new-id' });
    const { default: Page } = await import('../../../app/(dashboard)/crm/customers/new/page');
    render(<Page />);
    fill('First name *', 'Asha');
    fill('Last name *', 'Rao');
    fill('Phone', '9820000001');
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    await waitFor(() => expect(mockState.push).toHaveBeenCalledWith('/crm/customers/new-id'));
    expect(mockState.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Asha', lastName: 'Rao', phone: '+919820000001', customerType: 'RETAIL' }),
    );
    expect(mockState.invalidate).toHaveBeenCalled();
  });

  it('shows the server error and stays on the page', async () => {
    mockState.mutateAsync.mockRejectedValue(new Error('A customer with this phone number already exists'));
    mockState.error = { message: 'A customer with this phone number already exists' };
    const { default: Page } = await import('../../../app/(dashboard)/crm/customers/new/page');
    render(<Page />);
    fill('First name *', 'Asha');
    fill('Last name *', 'Rao');
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    await waitFor(() => expect(mockState.mutateAsync).toHaveBeenCalled());
    expect(mockState.push).not.toHaveBeenCalled();
  });
});

describe('New Lead flow', () => {
  it('list shows the lead name from firstName/lastName and links to /crm/leads/new', async () => {
    mockState.queries['crm.leadList'] = {
      items: [
        { id: 'l1', firstName: 'Sanjay', lastName: 'Malhotra', phone: '+919750331765', source: 'SOCIAL_MEDIA', status: 'WON', createdAt: '2026-11-16T16:15:44.850Z' },
      ],
      totalPages: 1, page: 1,
    };
    const { default: Page } = await import('../../../app/(dashboard)/crm/leads/page');
    render(<Page />);
    expect(screen.getByText('Sanjay Malhotra')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /New Lead/ })).toHaveAttribute('href', '/crm/leads/new');
    expect(screen.getByRole('option', { name: 'Negotiation' })).toBeInTheDocument();
  });

  it('submits paise and redirects', async () => {
    mockState.mutateAsync.mockResolvedValue({ id: 'lead-9' });
    const { default: Page } = await import('../../../app/(dashboard)/crm/leads/new/page');
    render(<Page />);
    fill('First name *', 'Vikram');
    fill('Last name *', 'Shah');
    fill('Estimated value (INR)', '25000');
    fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(mockState.push).toHaveBeenCalledWith('/crm/leads/lead-9'));
    expect(mockState.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Vikram', lastName: 'Shah', source: 'WALK_IN', estimatedValuePaise: 2500000 }),
    );
  });

  it('blocks an empty submit', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/crm/leads/new/page');
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(mockState.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('New Campaign flow', () => {
  it('list shows totalRecipients as the audience and links to /crm/campaigns/new', async () => {
    mockState.queries['crm.campaignList'] = {
      items: [{ id: 'k1', name: 'Diwali Promo 10', channel: 'EMAIL', status: 'DRAFT', scheduledAt: null, totalRecipients: 876 }],
      totalPages: 1, page: 1,
    };
    const { default: Page } = await import('../../../app/(dashboard)/crm/campaigns/page');
    render(<Page />);
    expect(screen.getByText('876')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /New Campaign/ })).toHaveAttribute('href', '/crm/campaigns/new');
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Running' })).toBeNull();
  });

  it('requires a name, then submits and redirects', async () => {
    mockState.mutateAsync.mockResolvedValue({ id: 'camp-3' });
    const { default: Page } = await import('../../../app/(dashboard)/crm/campaigns/new/page');
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(screen.getByText('Campaign name is required')).toBeInTheDocument();
    expect(mockState.mutateAsync).not.toHaveBeenCalled();
    fill('Campaign name *', 'Akshaya Tritiya');
    fill('Channel *', 'SMS');
    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }));
    await waitFor(() => expect(mockState.push).toHaveBeenCalledWith('/crm/campaigns/camp-3'));
    expect(mockState.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: 'Akshaya Tritiya', channel: 'SMS' }));
  });
});
