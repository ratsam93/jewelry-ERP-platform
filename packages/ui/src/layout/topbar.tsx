'use client';

import { Bell, ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, User } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../lib/utils';
import { useMobileNav } from './mobile-nav';
import { useRenderLink } from './link-context';

interface Branch {
  id: string;
  name: string;
}

export interface TopbarNotification {
  id: string;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt?: string;
  href?: string;
}

interface TopbarProps {
  branches?: Branch[];
  activeBranchId?: string | null;
  /** Receives null when the "all locations" option is chosen. */
  onBranchChange?: (branchId: string | null) => void;
  /** When set, adds an "all locations" option at the top of the location menu. */
  allBranchesLabel?: string;
  /** When provided, the bell opens a dropdown listing these notifications. */
  notifications?: TopbarNotification[];
  notificationsLoading?: boolean;
  onMarkAllNotificationsRead?: () => void;
  onNotificationSelect?: (notification: TopbarNotification) => void;
  /** Destination of the "View all" link in the notification dropdown. */
  notificationsHref?: string;
  /** Adds a "Profile" entry to the user menu. */
  profileHref?: string;
  userName?: string;
  userEmail?: string;
  onSearch?: () => void;
  onNotifications?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  theme?: 'light' | 'dark';
  onThemeToggle?: () => void;
  notificationCount?: number;
}

export function Topbar({
  branches = [],
  activeBranchId,
  onBranchChange,
  allBranchesLabel,
  notifications,
  notificationsLoading = false,
  onMarkAllNotificationsRead,
  onNotificationSelect,
  notificationsHref,
  profileHref,
  userName = 'User',
  userEmail = '',
  onSearch,
  onNotifications,
  onSettings,
  onLogout,
  theme = 'light',
  onThemeToggle,
  notificationCount = 0,
}: TopbarProps) {
  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const renderLink = useRenderLink();
  const branchLabel = activeBranch?.name ?? allBranchesLabel ?? 'Select Branch';
  const { open: menuOpen, toggle: toggleMenu, triggerRef } = useMobileNav();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-3 sm:px-4">
      {/* Left side: menu button (below lg) + branch selector */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <button
          type="button"
          ref={triggerRef}
          onClick={toggleMenu}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {branches.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="flex h-10 min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-background px-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
              >
                <span className="max-w-[6.5rem] truncate sm:max-w-none">
                  {branchLabel}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[200px] rounded-md border bg-popover p-1 shadow-md"
                sideOffset={5}
              >
                {allBranchesLabel && (
                  <DropdownMenu.Item
                    onClick={() => onBranchChange?.(null)}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent',
                      !activeBranch && 'bg-accent font-medium',
                    )}
                  >
                    {allBranchesLabel}
                  </DropdownMenu.Item>
                )}
                {branches.map((branch) => (
                  <DropdownMenu.Item
                    key={branch.id}
                    onClick={() => onBranchChange?.(branch.id)}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent',
                      branch.id === activeBranchId && 'bg-accent font-medium',
                    )}
                  >
                    {branch.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      {/* Right side: Search, notifications, theme, profile */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Search: icon-only below sm */}
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search"
          className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-md border bg-background text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">
            Ctrl+K
          </kbd>
        </button>

        {/* Notifications */}
        {notifications ? (
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={
                  notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'
                }
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell className="h-4 w-4" />
                {notificationCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                aria-label="Notifications"
                className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-md border bg-popover p-1 shadow-md"
                sideOffset={5}
                align="end"
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <p className="text-sm font-medium">Notifications</p>
                  <button
                    type="button"
                    onClick={onMarkAllNotificationsRead}
                    disabled={notificationCount === 0}
                    className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                  >
                    Mark all read
                  </button>
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <div className="max-h-80 overflow-y-auto">
                  {notificationsLoading ? (
                    <p className="px-2 py-4 text-center text-sm text-muted-foreground">Loading...</p>
                  ) : notifications.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <DropdownMenu.Item
                        key={n.id}
                        onSelect={() => onNotificationSelect?.(n)}
                        className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent focus:bg-accent"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            n.isRead ? 'bg-transparent' : 'bg-primary',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate', !n.isRead && 'font-medium')}>
                            {n.title}
                            {!n.isRead && <span className="sr-only"> (unread)</span>}
                          </span>
                          {n.message && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {n.message}
                            </span>
                          )}
                        </span>
                      </DropdownMenu.Item>
                    ))
                  )}
                </div>
                {notificationsHref && (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item asChild>
                      {renderLink({
                        href: notificationsHref,
                        className:
                          'block cursor-pointer rounded-sm px-2 py-1.5 text-center text-sm font-medium text-primary outline-none hover:bg-accent focus:bg-accent',
                        children: 'View all',
                      })}
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <button
            type="button"
            onClick={onNotifications}
            aria-label={
              notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'
            }
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="h-4 w-4" />
            {notificationCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

        )}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label="Toggle dark mode"
          aria-pressed={theme === 'dark'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        {/* User menu */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={`User menu: ${userName}`}
              className="flex h-10 items-center gap-2 rounded-md px-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="hidden text-sm font-medium sm:inline">{userName}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 sm:block" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[200px] rounded-md border bg-popover p-1 shadow-md"
              sideOffset={5}
              align="end"
            >
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{userName}</p>
                {userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              {profileHref && (
                <DropdownMenu.Item asChild>
                  {renderLink({
                    href: profileHref,
                    className:
                      'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent',
                    children: (
                      <>
                        <User className="h-3.5 w-3.5" /> Profile
                      </>
                    ),
                  })}
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                onClick={onSettings}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
              >
                <Settings className="h-3.5 w-3.5" /> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onClick={onLogout}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-accent"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
