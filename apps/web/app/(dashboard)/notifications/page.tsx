'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { PaginationControls } from '@/components/pagination-controls';
import {
  formatRelativeTime,
  toNotificationView,
  type ApiNotification,
} from '@/features/notifications/notification-utils';

interface NotificationPage {
  items: ApiNotification[];
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const utils = trpc.useUtils();

  const query = trpc.platform.notifications.list.useQuery(
    { page, limit: 20, unreadOnly: unreadOnly || undefined },
    { refetchOnMount: 'always' },
  );
  const data = query.data as NotificationPage | undefined;
  const items = (data?.items ?? []).map(toNotificationView);

  const refresh = () => utils.platform.notifications.invalidate();
  const markRead = trpc.platform.notifications.markAsRead.useMutation({ onSuccess: refresh });
  const markAll = trpc.platform.notifications.markAllAsRead.useMutation({ onSuccess: refresh });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Alerts and updates for your account."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notifications' }]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter notifications" className="inline-flex rounded-md border">
          <button
            type="button"
            aria-pressed={!unreadOnly}
            onClick={() => { setUnreadOnly(false); setPage(1); }}
            className={`px-3 py-1.5 text-sm ${!unreadOnly ? 'bg-accent font-medium' : ''}`}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => { setUnreadOnly(true); setPage(1); }}
            className={`border-l px-3 py-1.5 text-sm ${unreadOnly ? 'bg-accent font-medium' : ''}`}
          >
            Unread
          </button>
        </div>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={markAll.isPending}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>

      {query.isLoading ? (
        <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">Loading notifications...</div>
      ) : query.error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load notifications: {query.error.message}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <h3 className="text-lg font-semibold">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</h3>
          <p className="mt-1 text-sm text-muted-foreground">New alerts will show up here.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 p-4">
              <span
                aria-hidden="true"
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-primary'}`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.isRead ? '' : 'font-semibold'}`}>
                  {n.title}
                  <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {n.isRead ? 'Read' : 'Unread'}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeTime(n.createdAt)}
                  {n.href && (
                    <>
                      {' · '}
                      <Link href={n.href} className="text-primary hover:underline">Open</Link>
                    </>
                  )}
                </p>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => markRead.mutate({ notificationId: n.id })}
                  disabled={markRead.isPending}
                  className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <PaginationControls
        page={page}
        totalPages={data?.totalPages ?? 1}
        hasPrevious={data?.hasPrevious ?? false}
        hasNext={data?.hasNext ?? false}
        onChange={setPage}
      />
    </div>
  );
}
