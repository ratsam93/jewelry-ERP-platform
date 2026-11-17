import { describe, it, expect } from 'vitest';
import { formatRelativeTime, safeInternalHref, toNotificationView } from '../notification-utils';

describe('notification utils', () => {
  it('only follows same-app links', () => {
    expect(safeInternalHref('/finance/invoices')).toBe('/finance/invoices');
    expect(safeInternalHref('https://evil.example')).toBeUndefined();
    expect(safeInternalHref('//evil.example')).toBeUndefined();
    expect(safeInternalHref(null)).toBeUndefined();
  });

  it('maps an API row', () => {
    const v = toNotificationView({
      id: 'n1', title: 'Low stock', message: 'Ring R1', type: 'WARNING', isRead: false,
      link: '/inventory', createdAt: '2026-11-17T10:00:00.000Z',
    });
    expect(v).toMatchObject({ id: 'n1', isRead: false, href: '/inventory' });
  });

  it('formats relative time', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(formatRelativeTime('2026-11-17T11:59:30Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-11-17T11:30:00Z', now)).toBe('30m ago');
    expect(formatRelativeTime('2026-11-17T09:00:00Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-11-15T12:00:00Z', now)).toBe('2d ago');
  });
});
