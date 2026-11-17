import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  authFetch,
  refreshAccessToken,
  resetAuthSessionState,
  isSessionExpired,
  isPublicAppPath,
} from '@/lib/auth-session';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const assign = vi.fn();
let fetchMock: ReturnType<typeof vi.fn>;

function setLocation(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, search, assign },
  });
}

function authHeader(call: unknown[]): string | null {
  return new Headers((call[1] as RequestInit).headers).get('Authorization');
}

beforeEach(() => {
  resetAuthSessionState();
  assign.mockReset();
  localStorage.clear();
  localStorage.setItem('accessToken', 'old-access');
  localStorage.setItem('refreshToken', 'old-refresh');
  setLocation('/admin/dashboard', '?x=1');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const trpcInit = () => ({ method: 'GET', headers: { Authorization: 'Bearer old-access' } });

describe('authFetch refresh-then-retry', () => {
  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: 'x' }))
      .mockResolvedValueOnce(json(200, { success: true, data: { accessToken: 'new-access', refreshToken: 'new-refresh' } }))
      .mockResolvedValueOnce(json(200, [{ result: { data: 1 } }]));

    const res = await authFetch('/api/v1/trpc/a.b', trpcInit());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshCall = fetchMock.mock.calls[1]!;
    expect(refreshCall[0]).toBe('/api/v1/auth/refresh');
    expect(JSON.parse((refreshCall[1] as RequestInit).body as string)).toEqual({ refreshToken: 'old-refresh' });
    expect(authHeader(fetchMock.mock.calls[2]!)).toBe('Bearer new-access');
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
    expect(assign).not.toHaveBeenCalled();
  });

  it('passes non-401 responses straight through', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    const res = await authFetch('/x', trpcInit());
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh again when the retry is also 401 (redirects instead)', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { data: { accessToken: 'n', refreshToken: 'r' } }))
      .mockResolvedValueOnce(json(401, {}));
    const res = await authFetch('/x', trpcInit());
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe('redirect when refresh fails', () => {
  it('clears tokens and goes to /admin/login with expired=1 and next', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(401, { message: 'invalid refresh token' }));
    const res = await authFetch('/x', trpcInit());
    expect(res.status).toBe(401);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(assign).toHaveBeenCalledWith(`/admin/login?expired=1&next=${encodeURIComponent('/dashboard?x=1')}`);
    expect(isSessionExpired()).toBe(true);
  });

  it('redirects without calling refresh when no refresh token is stored', async () => {
    localStorage.removeItem('refreshToken');
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await authFetch('/x', trpcInit());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('redirects once even if several requests fail', async () => {
    fetchMock.mockImplementation(async (url: string) => json(401, { url }));
    await Promise.all([authFetch('/a', trpcInit()), authFetch('/b', trpcInit()), authFetch('/c', trpcInit())]);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe('no redirect loop on public pages', () => {
  it.each(['/admin/login', '/admin/register', '/admin/forgot-password'])('%s', async (path) => {
    setLocation(path);
    expect(isPublicAppPath(path)).toBe(true);
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));
    const res = await authFetch('/x', trpcInit());
    expect(res.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
    expect(isSessionExpired()).toBe(false);
  });

  it('treats dashboard as protected', () => {
    expect(isPublicAppPath('/admin/dashboard')).toBe(false);
    expect(isPublicAppPath('/admin/loginx')).toBe(false);
  });
});

describe('single-flight refresh', () => {
  it('concurrent 401s share one refresh call and all retry with the new token', async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/auth/refresh') {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });
      }
      const auth = new Headers(init.headers).get('Authorization');
      return auth === 'Bearer new-access' ? json(200, { ok: 1 }) : json(401, {});
    });

    const results = await Promise.all([
      authFetch('/a', trpcInit()),
      authFetch('/b', trpcInit()),
      authFetch('/c', trpcInit()),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('refreshAccessToken returns the same in-flight promise', async () => {
    fetchMock.mockResolvedValue(json(200, { data: { accessToken: 'a2', refreshToken: 'r2' } }));
    const p1 = refreshAccessToken();
    const p2 = refreshAccessToken();
    expect(p1).toBe(p2);
    expect(await p1).toBe('a2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a late 401 with the already-refreshed stored token without refreshing again', async () => {
    localStorage.setItem('accessToken', 'fresh');
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, {}));
    const res = await authFetch('/x', trpcInit());
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(fetchMock.mock.calls[1]!)).toBe('Bearer fresh');
  });
});

describe('cross-tab refresh race', () => {
  it('adopts tokens another tab stored instead of logging out when our refresh is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockImplementationOnce(async () => {
        // another tab rotated meanwhile
        localStorage.setItem('accessToken', 'tab2-access');
        localStorage.setItem('refreshToken', 'tab2-refresh');
        return json(401, { message: 'Invalid or expired refresh token' });
      })
      .mockResolvedValueOnce(json(200, [{ result: { data: 1 } }]));

    const res = await authFetch('/api/v1/trpc/a.b', trpcInit());

    expect(res.status).toBe(200);
    expect(assign).not.toHaveBeenCalled();
    expect(authHeader(fetchMock.mock.calls[2]!)).toBe('Bearer tab2-access');
    expect(localStorage.getItem('refreshToken')).toBe('tab2-refresh');
  });

  it('skips the network call when another tab rotated while waiting for the lock', async () => {
    const locks = {
      request: vi.fn(async (_n: string, cb: () => Promise<unknown>) => {
        localStorage.setItem('accessToken', 'tab2-access');
        localStorage.setItem('refreshToken', 'tab2-refresh');
        return cb();
      }),
    };
    vi.stubGlobal('navigator', { ...navigator, locks });
    const token = await refreshAccessToken();
    expect(token).toBe('tab2-access');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
