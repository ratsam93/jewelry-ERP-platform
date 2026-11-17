import * as React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Controllable tRPC mock (overrides the global recursive proxy) ───
const h = vi.hoisted(() => ({
  invalidate: vi.fn(() => Promise.resolve()),
  rolesData: [] as unknown[],
  permsData: {} as Record<string, unknown[]>,
  mutations: {} as Record<string, { mutate: ReturnType<typeof vi.fn>; opts?: { onSuccess?: (d?: unknown) => unknown } }>,
  meData: undefined as unknown,
  notifData: undefined as unknown,
}));

function mutationFor(name: string) {
  return (opts?: { onSuccess?: (d?: unknown) => unknown }) => {
    const m = h.mutations[name] ?? (h.mutations[name] = { mutate: vi.fn() });
    m.opts = opts;
    return { mutate: m.mutate, isPending: false, error: null, isSuccess: false };
  };
}

vi.mock('@/lib/trpc', () => {
  const query = (data: () => unknown) => ({
    useQuery: () => ({ data: data(), isLoading: false, error: null, refetch: vi.fn() }),
    invalidate: h.invalidate,
  });
  return {
    trpc: {
      useUtils: () => ({
        platform: {
          roles: { list: { invalidate: h.invalidate }, permissions: { invalidate: h.invalidate } },
          users: { getById: { invalidate: h.invalidate } },
          notifications: { invalidate: h.invalidate },
        },
      }),
      platform: {
        roles: {
          list: query(() => h.rolesData),
          permissions: query(() => h.permsData),
          create: { useMutation: mutationFor('roles.create') },
          update: { useMutation: mutationFor('roles.update') },
          delete: { useMutation: mutationFor('roles.delete') },
          seedPermissions: { useMutation: mutationFor('roles.seed') },
        },
        users: {
          getById: query(() => h.meData),
          updateProfile: { useMutation: mutationFor('users.updateProfile') },
          changePassword: { useMutation: mutationFor('users.changePassword') },
        },
        notifications: {
          list: query(() => h.notifData),
          markAsRead: { useMutation: mutationFor('notif.markRead') },
          markAllAsRead: { useMutation: mutationFor('notif.markAll') },
        },
      },
    },
  };
});

vi.mock('@/features/shell/current-user', () => ({ useCurrentUserId: () => 'user-1', useHydrated: () => true }));

beforeEach(() => {
  h.invalidate.mockClear();
  h.mutations = {};
  h.rolesData = [];
  h.permsData = {};
});

describe('Roles page', () => {
  it('invalidates the role list after create so the new role shows without reload', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/settings/roles/page');
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: /create role/i }));
    await user.type(screen.getByLabelText('Role Name'), 'Store Manager');
    const save = screen.getAllByRole('button', { name: /create role/i }).at(-1)!;
    await user.click(save);
    expect(h.mutations['roles.create']!.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Store Manager', permissions: [] }),
    );
    await h.mutations['roles.create']!.opts!.onSuccess!();
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('shows a "No permissions defined" hint with a load button when the catalog is empty', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/settings/roles/page');
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByRole('button', { name: /create role/i }));
    expect(screen.getAllByText(/no permissions defined/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /load default permissions/i }));
    expect(h.mutations['roles.seed']!.mutate).toHaveBeenCalled();
  });

  it('confirms deletion in a dialog naming the role (no native confirm)', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    h.rolesData = [
      { id: 'r1', name: 'Cashier', description: null, permissions: {}, isSystem: false, _count: { users: 0 } },
    ];
    const { default: Page } = await import('../../../app/(dashboard)/settings/roles/page');
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByTitle('Delete role'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Cashier');
    expect(h.mutations['roles.delete']!.mutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    expect(h.mutations['roles.delete']!.mutate).toHaveBeenCalledWith({ roleId: 'r1' });
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe('Profile page', () => {
  beforeEach(() => {
    h.meData = {
      id: 'user-1', email: 'admin@sharmajewellers.com', firstName: 'Admin', lastName: 'User',
      role: { id: 'r', name: 'Admin' },
    };
  });

  it('shows read-only email/role and saves the display name via updateProfile', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/profile/page');
    const user = userEvent.setup();
    render(<Page />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Role')).toHaveValue('Admin');
    const first = screen.getByLabelText('First name');
    await user.clear(first);
    await user.type(first, 'Sam');
    await user.click(screen.getByRole('button', { name: /save name/i }));
    expect(h.mutations['users.updateProfile']!.mutate).toHaveBeenCalledWith({
      userId: 'user-1', firstName: 'Sam', lastName: 'User',
    });
  });

  it('validates the password form before calling changePassword', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/profile/page');
    const user = userEvent.setup();
    render(<Page />);
    await user.type(screen.getByLabelText('Current password'), 'oldpass');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'other');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument();
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(h.mutations['users.changePassword']!.mutate).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('New password'), 'GoodPassw0rd!x');
    await user.type(screen.getByLabelText('Confirm new password'), 'GoodPassw0rd!x');
    await user.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() =>
      expect(h.mutations['users.changePassword']!.mutate).toHaveBeenCalledWith({
        currentPassword: 'oldpass', newPassword: 'GoodPassw0rd!x',
      }),
    );
  });
});

describe('Notifications page', () => {
  it('lists read and unread notifications and marks all read', async () => {
    h.notifData = {
      items: [
        { id: 'n1', title: 'Low stock', message: 'Ring R1 below minimum', isRead: false, link: '/inventory', createdAt: new Date().toISOString() },
        { id: 'n2', title: 'Rate update', message: 'Gold rate changed', isRead: true, link: null, createdAt: new Date().toISOString() },
      ],
      total: 2, page: 1, limit: 20, totalPages: 1, hasNext: false, hasPrevious: false,
    };
    const { default: Page } = await import('../../../app/(dashboard)/notifications/page');
    const user = userEvent.setup();
    render(<Page />);
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getAllByText('Unread').length).toBeGreaterThan(1);
    expect(screen.getByText('Read')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(h.mutations['notif.markRead']!.mutate).toHaveBeenCalledWith({ notificationId: 'n1' });
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(h.mutations['notif.markAll']!.mutate).toHaveBeenCalled();
  });

  it('shows an empty state', async () => {
    h.notifData = { items: [], total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrevious: false };
    const { default: Page } = await import('../../../app/(dashboard)/notifications/page');
    render(<Page />);
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });
});
