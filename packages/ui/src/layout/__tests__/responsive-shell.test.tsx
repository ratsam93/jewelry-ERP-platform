import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../app-shell';
import { Sidebar } from '../sidebar';
import { Topbar } from '../topbar';
import { PageHeader } from '../page-header';

function Shell({ collapsed = false, path = '/dashboard' }: { collapsed?: boolean; path?: string }) {
  return (
    <AppShell
      sidebar={<Sidebar collapsed={collapsed} onToggle={vi.fn()} currentPath={path} />}
      topbar={<Topbar userName="Admin" onThemeToggle={vi.fn()} />}
    >
      <p>content</p>
    </AppShell>
  );
}

const aside = () => document.querySelector('aside') as HTMLElement;

describe('responsive shell: off-canvas drawer below lg, static sidebar at lg+', () => {
  it('sidebar is an off-canvas drawer by default and static at lg', () => {
    render(<Shell />);
    const cls = aside().className;
    expect(cls).toContain('fixed');
    expect(cls).toContain('-translate-x-full');
    expect(cls).toContain('invisible'); // not focusable while closed
    expect(cls).toContain('lg:static');
    expect(cls).toContain('lg:translate-x-0');
    expect(cls).toContain('lg:visible');
    expect(aside()).toHaveAttribute('data-mobile-open', 'false');
    expect(screen.queryByTestId('sidebar-overlay')).toBeNull();
  });

  it('hamburger has an accessible name, is hidden at lg, and toggles aria-expanded', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const burger = screen.getByRole('button', { name: 'Open menu' });
    expect(burger.className).toContain('lg:hidden');
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    await user.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
    expect(aside()).toHaveAttribute('data-mobile-open', 'true');
    expect(aside().className).toContain('translate-x-0');
    expect(aside().className).not.toContain('-translate-x-full');
    expect(aside()).toHaveAttribute('role', 'dialog');
    expect(aside()).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('sidebar-overlay')).toBeInTheDocument();
  });

  it('locks body scroll while open and restores it on close', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape and returns focus to the hamburger', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    const burger = screen.getByRole('button', { name: 'Open menu' });
    await user.click(burger);
    expect(aside().contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(aside()).toHaveAttribute('data-mobile-open', 'false');
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(burger);
  });

  it('closes when the overlay is clicked', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByTestId('sidebar-overlay'));
    expect(aside()).toHaveAttribute('data-mobile-open', 'false');
  });

  it('closes via the Close menu button', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(aside()).toHaveAttribute('data-mobile-open', 'false');
  });

  it('closes after navigating via a link', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const link = screen.getByText('Dashboard').closest('a')!;
    link.addEventListener('click', (e) => e.preventDefault());
    await user.click(link);
    expect(aside()).toHaveAttribute('data-mobile-open', 'false');
  });

  it('traps Tab focus inside the open drawer', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const focusables = aside().querySelectorAll<HTMLElement>('a[href], button');
    const last = focusables[focusables.length - 1]!;
    last.focus();
    await user.tab();
    expect(aside().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('shows labels in the open drawer even when desktop collapse is on', async () => {
    const user = userEvent.setup();
    render(<Shell collapsed />);
    expect(screen.queryByText('CaratFlow')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByText('CaratFlow')).toBeInTheDocument();
    expect(aside().className).toContain('lg:w-16'); // desktop width untouched
  });

  it('closes when the viewport grows to the desktop breakpoint', async () => {
    const user = userEvent.setup();
    let listener: ((e: { matches: boolean }) => void) | undefined;
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        listener = cb;
      },
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      render(<Shell />);
      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(aside()).toHaveAttribute('data-mobile-open', 'true');
      act(() => listener?.({ matches: true }));
      expect(aside()).toHaveAttribute('data-mobile-open', 'false');
    } finally {
      window.matchMedia = original;
    }
  });

  it('keeps the desktop collapse chevron (desktop-only wrapper)', () => {
    render(<Shell />);
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(toggle.parentElement?.className).toContain('lg:block');
    expect(toggle.parentElement?.className).toContain('hidden');
  });
});

describe('topbar and chrome sizing', () => {
  it('icon buttons are at least 40x40 with accessible names', () => {
    render(
      <Topbar
        userName="Admin"
        notificationCount={3}
        branches={[{ id: 'a', name: 'Zaveri Bazaar - Main' }]}
        activeBranchId="a"
      />,
    );
    for (const name of ['Open menu', 'Search', 'Notifications, 3 unread', 'Toggle dark mode']) {
      const b = screen.getByRole('button', { name });
      expect(b.className).toMatch(/h-10/);
      expect(b.className).toMatch(/w-10/);
    }
    expect(screen.getByRole('button', { name: 'User menu: Admin' }).className).toContain('h-10');
  });

  it('search collapses to an icon under sm and branch label truncates', () => {
    render(<Topbar branches={[{ id: 'a', name: 'Zaveri Bazaar - Main' }]} activeBranchId="a" />);
    expect(screen.getByText('Search...').className).toContain('hidden');
    expect(screen.getByText('Search...').className).toContain('sm:inline');
    const label = screen.getByText('Zaveri Bazaar - Main');
    expect(label.className).toContain('truncate');
    expect(label.className).toContain('sm:max-w-none');
  });

  it('theme toggle reflects state via aria-pressed', () => {
    render(<Topbar theme="dark" />);
    expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('PageHeader wraps breadcrumbs and actions', () => {
    render(
      <PageHeader
        title="T"
        breadcrumbs={[{ label: 'A', href: '/a' }, { label: 'B' }]}
        actions={<button>Go</button>}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).className).toContain('flex-wrap');
    expect(screen.getByText('Go').parentElement?.className).toContain('flex-wrap');
    expect(
      screen.getByRole('heading', { level: 1 }).parentElement?.parentElement?.className,
    ).toContain('flex-wrap');
  });

  it('sidebar group buttons have a 40px minimum height', () => {
    render(<Sidebar collapsed={false} onToggle={vi.fn()} />);
    const inv = screen.getByText('Inventory').closest('button')!;
    expect(inv.className).toContain('min-h-10');
    expect(inv).toHaveAttribute('aria-expanded', 'false');
  });
});
