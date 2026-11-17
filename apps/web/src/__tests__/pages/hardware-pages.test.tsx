import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const state = vi.hoisted(() => ({
  deviceList: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  i18nList: { data: undefined as unknown },
  updateMutate: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/lib/trpc', () => {
  const noopQuery = () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
  const noopMutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
  return {
    trpc: {
      useUtils: () => ({}),
      hardware: {
        devices: {
          list: { useQuery: () => ({ ...state.deviceList, refetch: state.refetch }) },
          register: { useMutation: noopMutation },
          remove: { useMutation: noopMutation },
        },
      },
      platform: {
        branches: { list: { useQuery: noopQuery } },
        i18n: {
          list: { useQuery: () => ({ ...state.i18nList, isLoading: false, refetch: vi.fn() }) },
          namespaces: { useQuery: noopQuery },
          create: { useMutation: noopMutation },
          update: { useMutation: () => ({ mutate: state.updateMutate, isPending: false }) },
          delete: { useMutation: noopMutation },
        },
      },
    },
  };
});

describe('hardware devices page states', () => {
  beforeEach(() => {
    state.deviceList = { data: undefined, isLoading: false, isError: false, error: null };
    state.refetch.mockClear();
  });

  it('shows an error state with Retry when the list call fails (not the empty state)', async () => {
    state.deviceList = { data: undefined, isLoading: false, isError: true, error: new Error('UNAUTHORIZED') };
    const { default: Page } = await import('../../../app/(dashboard)/settings/hardware/page');
    render(<Page />);
    expect(screen.getByRole('alert').textContent).toMatch(/Could not load hardware devices/);
    expect(screen.queryByText(/No hardware devices registered/)).toBeNull();
    fireEvent.click(screen.getByText('Retry'));
    expect(state.refetch).toHaveBeenCalled();
  });

  it('shows readable connection labels instead of raw enums', async () => {
    state.deviceList = {
      data: {
        items: [
          { id: 'd1', name: 'Scale 1', deviceType: 'WEIGHING_SCALE', connectionType: 'USB_HID', isActive: true, status: 'DISCONNECTED' },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    };
    const { default: Page } = await import('../../../app/(dashboard)/settings/hardware/page');
    render(<Page />);
    expect(screen.getByText(/Weighing Scale \| USB HID/)).toBeInTheDocument();
    expect(screen.queryByText(/USB_HID/)).toBeNull();
  });

  it('shows the empty state only when the call succeeded with no rows', async () => {
    state.deviceList = { data: { items: [] }, isLoading: false, isError: false, error: null };
    const { default: Page } = await import('../../../app/(dashboard)/settings/hardware/page');
    render(<Page />);
    expect(screen.getByText(/No hardware devices registered/)).toBeInTheDocument();
  });
});

describe('i18n translation cell keyboard handling', () => {
  it('Enter saves and Escape cancels the editor', async () => {
    state.i18nList = {
      data: { items: [{ id: 'k1', namespace: 'common', key: 'save', defaultValue: 'Save', translations: {} }] },
    };
    const { default: Page } = await import('../../../app/(dashboard)/settings/i18n/page');
    render(<Page />);
    fireEvent.change(screen.getAllByRole('combobox')[1] as HTMLElement, { target: { value: 'hi' } });
    fireEvent.click(screen.getByText('Click to translate'));
    const input = screen.getByLabelText('Translation');
    fireEvent.change(input, { target: { value: 'सहेजें' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state.updateMutate).toHaveBeenCalledWith({ id: 'k1', translations: { hi: 'सहेजें' } });

    fireEvent.keyDown(screen.getByLabelText('Translation'), { key: 'Escape' });
    expect(screen.queryByLabelText('Translation')).toBeNull();
  });
});
