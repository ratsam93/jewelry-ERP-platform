import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test query results keyed by tRPC path (e.g. 'platform.branches.getById').
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

const branchFixture = {
  id: 'branch-1',
  name: 'Mumbai Showroom',
  locationType: 'SHOWROOM',
  address: 'Linking Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  postalCode: '400050',
  phone: '+912212345678',
  email: 'mumbai@example.com',
  isActive: true,
  settings: null,
};

const userFixture = {
  id: 'user-1',
  email: 'ravi@example.com',
  firstName: 'Ravi',
  lastName: 'Kumar',
  roleId: null,
  isActive: true,
  role: null,
};

beforeEach(() => {
  mockState.queries = {};
});

describe('Settings Detail Pages', () => {
  describe('Branch Detail [id]', () => {
    it('renders with page header title "Branch Details" when data is present', async () => {
      mockState.queries['platform.branches.getById'] = { data: branchFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/settings/branches/[id]/page'
      );
      render(<Page />);
      expect(screen.getByText('Branch Details')).toBeInTheDocument();
    });

    it('renders the branch form populated with the branch data', async () => {
      mockState.queries['platform.branches.getById'] = { data: branchFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/settings/branches/[id]/page'
      );
      render(<Page />);
      expect(screen.getByDisplayValue('Mumbai Showroom')).toBeInTheDocument();
    });

    it('renders a not-found state instead of an empty form when the branch is null', async () => {
      mockState.queries['platform.branches.getById'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/settings/branches/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Branch not found' })).toBeInTheDocument();
      expect(screen.queryByText('General Information')).toBeNull();
    });
  });

  describe('User Detail [id]', () => {
    it('renders with page header title "User Profile" when data is present', async () => {
      mockState.queries['platform.users.getById'] = { data: userFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/settings/users/[id]/page'
      );
      render(<Page />);
      expect(screen.getByText('User Profile')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Ravi')).toBeInTheDocument();
    });

    it('renders a not-found state instead of an empty form when the user is null', async () => {
      mockState.queries['platform.users.getById'] = { data: null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/settings/users/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'User not found' })).toBeInTheDocument();
      expect(screen.queryByText('Profile Information')).toBeNull();
    });
  });
});
