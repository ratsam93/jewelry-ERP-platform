'use client';

import * as React from 'react';
import { useAuthStore } from '@/store/auth-store';

/** Reads the `sub` claim (user id) of a JWT without verifying it (display only). */
export function userIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            Array.from(atob(padded))
              .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
              .join(''),
          )
        : Buffer.from(padded, 'base64').toString('utf8');
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in staff user's id. The auth store's `user` is not populated after
 * a reload, so fall back to the access token's `sub` claim.
 */
export function useCurrentUserId(): string | null {
  const hydrated = useHydrated();
  const userId = useAuthStore((s) => s.user?.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  // The auth store reads localStorage at module init, so on the client the very
  // first render would differ from the server's (null) render: React hydration
  // error #418. Report no user until after mount.
  if (!hydrated) return null;
  return userId ?? userIdFromToken(accessToken);
}

/** False during SSR and the hydrating render, true after mount (client-only values). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return hydrated;
}
