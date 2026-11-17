import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Topbar } from '../topbar';
import { LinkProvider } from '../link-context';
import { CommandPalette } from '../../components/command-palette';

const notifications = [
  { id: 'n1', title: 'Low stock', message: 'Ring R1', isRead: false },
  { id: 'n2', title: 'Rate update', isRead: true },
];

describe('Topbar notifications dropdown', () => {
  it('opens a list with Mark all read and a View all link', async () => {
    const user = userEvent.setup();
    const markAll = vi.fn();
    const select = vi.fn();
    render(
      <LinkProvider renderLink={({ href, children, className }) => <a href={'/admin' + href} className={className}>{children}</a>}>
        <Topbar
          notificationCount={1}
          notifications={notifications}
          onMarkAllNotificationsRead={markAll}
          onNotificationSelect={select}
          notificationsHref="/notifications"
        />
      </LinkProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('(unread)')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View all' })).toHaveAttribute('href', '/admin/notifications');
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(markAll).toHaveBeenCalled();
    await user.click(screen.getByText('Low stock'));
    expect(select).toHaveBeenCalledWith(notifications[0]);
  });

  it('shows an empty state and disables Mark all read when there is nothing unread', async () => {
    const user = userEvent.setup();
    render(<Topbar notificationCount={0} notifications={[]} />);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });
});

describe('Topbar user + location menus', () => {
  it('adds a Profile link to the user menu', async () => {
    const user = userEvent.setup();
    render(<Topbar userName="Rajesh" profileHref="/profile" />);
    await user.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByRole('menuitem', { name: /profile/i })).toHaveAttribute('href', '/profile');
  });

  it('resolves Profile through the app link context (basePath-aware)', async () => {
    const user = userEvent.setup();
    render(
      <LinkProvider renderLink={({ href, children, className }) => <a href={'/admin' + href} className={className}>{children}</a>}>
        <Topbar userName="Rajesh" profileHref="/profile" />
      </LinkProvider>,
    );
    await user.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByRole('menuitem', { name: /profile/i })).toHaveAttribute('href', '/admin/profile');
  });

  it('offers All locations and reports null when chosen', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Topbar
        branches={[{ id: 'b1', name: 'Main' }]}
        activeBranchId="b1"
        allBranchesLabel="All locations"
        onBranchChange={change}
      />,
    );
    await user.click(screen.getByText('Main'));
    await user.click(screen.getByRole('menuitem', { name: 'All locations' }));
    expect(change).toHaveBeenCalledWith(null);
  });

  it('labels the trigger "All locations" when nothing is selected', () => {
    render(<Topbar branches={[{ id: 'b1', name: 'Main' }]} activeBranchId={null} allBranchesLabel="All locations" />);
    expect(screen.getByText('All locations')).toBeInTheDocument();
  });
});

describe('CommandPalette controlled mode', () => {
  const items = [
    { id: 'a', label: 'Finance / Invoices', group: 'Go to', onSelect: vi.fn() },
    { id: 'b', label: 'New customer', group: 'Quick actions', onSelect: vi.fn() },
  ];

  it('opens from the search box via the open prop and exposes combobox/listbox roles', () => {
    render(<CommandPalette items={items} open onOpenChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('reports Ctrl+K and Escape through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<CommandPalette items={items} open={false} onOpenChange={onOpenChange} />);
    await user.keyboard('{Control>}k{/Control}');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    rerender(<CommandPalette items={items} open onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('filters by label and runs the item with Arrow keys + Enter, then closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <CommandPalette
        items={[...items.slice(0, 1), { id: 'b', label: 'New customer', group: 'Quick actions', onSelect }]}
        open
        onOpenChange={onOpenChange}
      />,
    );
    await user.type(screen.getByRole('combobox'), 'custom');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
