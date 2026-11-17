export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  type?: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string | Date;
}

export interface NotificationView {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  href?: string;
  createdAt: string;
}

/** Only same-app paths are followed (never an arbitrary external URL from data). */
export function safeInternalHref(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  return link.startsWith('/') && !link.startsWith('//') ? link : undefined;
}

export function toNotificationView(n: ApiNotification): NotificationView {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    href: safeInternalHref(n.link),
    createdAt: new Date(n.createdAt).toISOString(),
  };
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
