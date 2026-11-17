import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SUP = '11111111-1111-4111-8111-111111111111';

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  push: vi.fn(),
  error: null as unknown,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    wholesale: {
      getSupplier: {
        useQuery: () => ({
          data: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Zaveri Refinery',
            city: 'Mumbai',
            email: null,
            phone: '+919800000000',
            country: 'IN',
            isActive: true,
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      updateSupplier: {
        useMutation: () => ({ mutateAsync: state.mutateAsync, isPending: false, get error() { return state.error; } }),
      },
    },
  },
}));

describe('Supplier edit page', () => {
  beforeEach(() => {
    state.mutateAsync.mockReset().mockResolvedValue({});
    state.push.mockReset();
    state.error = null;
  });

  it('prefills and sends only changed fields via updateSupplier { id, data }', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/wholesale/suppliers/[id]/edit/page');
    render(<Page />);
    expect((screen.getByLabelText('Supplier name *') as HTMLInputElement).value).toBe('Zaveri Refinery');
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
    expect(state.mutateAsync).toHaveBeenCalledWith({ id: SUP, data: { city: 'Pune' } });
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/wholesale/suppliers/${SUP}`));
  });

  it('does not call the API when nothing changed, and validates', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/wholesale/suppliers/[id]/edit/page');
    render(<Page />);
    fireEvent.click(screen.getByText('Save changes'));
    expect(screen.getByText('No changes to save.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Save changes'));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a readable server error', async () => {
    state.error = { message: 'Supplier not found' };
    const { default: Page } = await import('../../../app/(dashboard)/wholesale/suppliers/[id]/edit/page');
    render(<Page />);
    expect(screen.getByRole('alert')).toHaveTextContent('Supplier not found');
  });
});
