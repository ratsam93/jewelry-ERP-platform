/**
 * Staff (admin) session handling for the browser.
 *
 * Access tokens live 15 minutes (apps/api auth.service: JWT_ACCESS_EXPIRY, default 15m);
 * refresh tokens live 7 days. Both are kept in localStorage ('accessToken' /
 * 'refreshToken'). On a 401 from tRPC we try ONE silent refresh against
 * POST /api/v1/auth/refresh { refreshToken } (response: { success, data: { accessToken,
 * refreshToken } }) and retry the request; if that is impossible we clear the tokens and
 * send the user to /admin/login?expired=1&next=<path>.
 */
import { useAuthStore } from '@/store/auth-store';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '/admin';
const PUBLIC_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

let refreshInFlight: Promise<string | null> | null = null;
let sessionExpired = false;
let redirecting = false;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True once a refresh failed and the user is being sent to the login page. */
export function isSessionExpired(): boolean {
  return sessionExpired;
}

/** Test helper: reset module state. */
export function resetAuthSessionState(): void {
  refreshInFlight = null;
  sessionExpired = false;
  redirecting = false;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

export function clearStoredTokens(): void {
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  } catch {
    /* ignore */
  }
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
}

/** Path relative to the app basePath, e.g. /admin/login -> /login. */
function appPath(pathname: string): string {
  if (BASE_PATH && (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`))) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

export function isPublicAppPath(pathname: string): boolean {
  const p = appPath(pathname);
  return PUBLIC_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * Serialise refreshes across tabs of the same browser (the API rotates refresh tokens:
 * each is single-use, so two tabs refreshing with the same token would make the loser's
 * 401 log the user out). Uses the Web Locks API when present; otherwise runs directly.
 */
async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return fn();
  return (await locks.request('caratflow-auth-refresh', fn)) as T;
}

/** Single-flight (in-tab) and cross-tab-safe refresh. Resolves with the new access token, or null on failure. */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  const startRefresh = readStorage('refreshToken');
  if (!startRefresh) return Promise.resolve(null);

  const attempt = withRefreshLock(async () => {
    const refreshToken = readStorage('refreshToken');
    if (!refreshToken) return null;
    // Another tab rotated the pair while we waited for the lock: adopt its tokens.
    if (refreshToken !== startRefresh) {
      const adopted = readStorage('accessToken');
      if (adopted) {
        useAuthStore.setState({ accessToken: adopted, refreshToken, isAuthenticated: true });
        return adopted;
      }
    }
    try {
      const res = await fetch(`${apiBase()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Lost a race with another tab (its rotation revoked our token): use its tokens.
        const current = readStorage('refreshToken');
        const currentAccess = readStorage('accessToken');
        if (current && current !== refreshToken && currentAccess) {
          useAuthStore.setState({ accessToken: currentAccess, refreshToken: current, isAuthenticated: true });
          return currentAccess;
        }
        return null;
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: { accessToken?: string; refreshToken?: string };
      };
      const accessToken = json?.data?.accessToken;
      if (!accessToken) return null;
      const newRefresh = json.data?.refreshToken ?? refreshToken;
      try {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefresh);
      } catch {
        /* ignore */
      }
      useAuthStore.setState({ accessToken, refreshToken: newRefresh, isAuthenticated: true });
      return accessToken;
    } catch {
      return null;
    }
  });
  refreshInFlight = attempt;
  // Release the slot once settled so later expiries can refresh again.
  void attempt.finally(() => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  });
  return attempt;
}

/** Clear tokens and go to the login page (once, never from a public page). */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  clearStoredTokens();
  const { pathname, search } = window.location;
  if (isPublicAppPath(pathname) || redirecting) return;
  sessionExpired = true;
  redirecting = true;
  const next = appPath(pathname) + search;
  window.location.assign(`${BASE_PATH}/login?expired=1&next=${encodeURIComponent(next)}`);
}

function bearerOf(headers: Headers): string | null {
  const auth = headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * fetch() replacement for httpBatchLink: on HTTP 401 refresh the token once and
 * retry the request; if that fails, redirect to login and return the 401.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401 || typeof window === 'undefined') return response;

  const headers = new Headers(init?.headers);
  const used = bearerOf(headers);
  const stored = readStorage('accessToken');

  // Another request already refreshed while this one was in flight: just retry.
  const token = stored && stored !== used && !refreshInFlight ? stored : await refreshAccessToken();

  if (!token) {
    redirectToLogin();
    return response;
  }
  headers.set('Authorization', `Bearer ${token}`);
  const retried = await fetch(input, { ...init, headers });
  if (retried.status === 401) redirectToLogin();
  return retried;
}
