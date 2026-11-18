'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AppShell,
  CommandPalette,
  LinkProvider,
  Sidebar,
  Topbar,
  defaultNavItems,
  type TopbarNotification,
} from '@caratflow/ui';
import { useUiStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { applyTheme } from '@/lib/theme';
import { BRAND_NAME } from '@/lib/brand';
import { trpc } from '@/lib/trpc';
import { buildCommandItems } from '@/features/shell/command-items';
import { useCurrentUserId } from '@/features/shell/current-user';
import { toLocationOptions } from '@/features/shell/location-utils';
import { toNotificationView, type ApiNotification } from '@/features/notifications/notification-utils';

// Next's Link applies the app basePath (/admin) to every href.
const renderLink = ({ href, children: linkChildren, className }: { href: string; children: React.ReactNode; className: string }) => (
  <Link href={href} className={className}>
    {linkChildren}
  </Link>
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar, activeBranchId, setActiveBranch, theme, toggleTheme } =
    useUiStore();
  const { logout, user } = useAuthStore();
  const utils = trpc.useUtils();
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // Keep the <html> `dark` class in sync with the persisted theme.
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // ─── Locations (real rows; null selection = all locations) ────
  const locationsQ = trpc.platform.branches.list.useQuery(undefined, { staleTime: 60_000 });
  const branches = React.useMemo(
    () =>
      toLocationOptions(
        locationsQ.data as
          | Array<{ id: string; name: string; city?: string | null; isActive?: boolean }>
          | undefined,
      ),
    [locationsQ.data],
  );
  // A persisted id that is not a real, active location (e.g. the old fake
  // "branch-1") falls back to "All locations".
  const selectedBranchId =
    activeBranchId && branches.some((b) => b.id === activeBranchId) ? activeBranchId : null;
  React.useEffect(() => {
    if (locationsQ.isSuccess && activeBranchId && !selectedBranchId) setActiveBranch(null);
  }, [locationsQ.isSuccess, activeBranchId, selectedBranchId, setActiveBranch]);

  // ─── Signed-in user (store user is empty after a reload) ──────
  const currentUserId = useCurrentUserId();
  const meQ = trpc.platform.users.getById.useQuery(
    { userId: currentUserId ?? '' },
    { enabled: !!currentUserId, staleTime: 5 * 60_000 },
  );
  const me = meQ.data as { firstName?: string; email?: string } | undefined;

  // ─── Notifications (real procedures; bell badge = unread count) ─
  const unreadQ = trpc.platform.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const recentQ = trpc.platform.notifications.list.useQuery({ page: 1, limit: 8 });
  const refreshNotifications = () => utils.platform.notifications.invalidate();
  const markAllRead = trpc.platform.notifications.markAllAsRead.useMutation({
    onSuccess: refreshNotifications,
  });
  const markRead = trpc.platform.notifications.markAsRead.useMutation({
    onSuccess: refreshNotifications,
  });
  const notifications: TopbarNotification[] = (
    ((recentQ.data as { items?: ApiNotification[] } | undefined)?.items ?? []) as ApiNotification[]
  ).map(toNotificationView);

  const paletteItems = React.useMemo(
    () => buildCommandItems(defaultNavItems, (href) => router.push(href)),
    [router],
  );

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // LinkProvider wraps the whole shell so the Topbar (Profile / View all) and
  // Sidebar also resolve hrefs through next/link (basePath /admin).
  return (
    <LinkProvider renderLink={renderLink}>
    <AppShell
      sidebar={
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          currentPath={pathname}
          renderLink={renderLink}
          brandName={BRAND_NAME}
        />
      }
      topbar={
        <Topbar
          branches={branches}
          activeBranchId={selectedBranchId}
          allBranchesLabel="All locations"
          onBranchChange={setActiveBranch}
          userName={me?.firstName ?? user?.firstName ?? 'Admin'}
          userEmail={me?.email ?? user?.email ?? ''}
          onSearch={() => setPaletteOpen(true)}
          onSettings={() => router.push('/settings')}
          onLogout={handleLogout}
          theme={theme}
          onThemeToggle={toggleTheme}
          notificationCount={(unreadQ.data as number | undefined) ?? 0}
          notifications={notifications}
          notificationsLoading={recentQ.isLoading}
          onMarkAllNotificationsRead={() => markAllRead.mutate()}
          onNotificationSelect={(n) => {
            if (!n.isRead) markRead.mutate({ notificationId: n.id });
            if (n.href) router.push(n.href);
          }}
          notificationsHref="/notifications"
          profileHref="/profile"
        />
      }
    >
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={paletteItems}
        placeholder="Search pages and actions..."
      />
      {children}
    </AppShell>
    </LinkProvider>
  );
}
