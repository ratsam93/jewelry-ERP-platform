'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { api } from '@/lib/api';
import { loginErrorMessage } from '@/lib/api-error';
import { BRAND_NAME } from '@/lib/brand';

export default function LoginPage() {
  const router = useRouter();
  const { setTokens } = useAuthStore();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  // Build-time default (empty when unset): never hard-code a demo business here.
  const [tenantSlug, setTenantSlug] = React.useState(process.env.NEXT_PUBLIC_TENANT_SLUG ?? '');
  const showDemoHint = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [expired, setExpired] = React.useState(false);
  const nextRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExpired(params.get('expired') === '1');
    const next = params.get('next');
    // Same-app relative paths only (no open redirect), never back to an auth page.
    if (
      next &&
      next.startsWith('/') &&
      !next.startsWith('//') &&
      !next.includes('\\') &&
      !/^\/(login|register|forgot-password)/.test(next)
    ) {
      nextRef.current = next;
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await api.post<{
        success: boolean;
        data: { accessToken: string; refreshToken: string };
      }>('/auth/login', { email, password, tenantSlug });

      if (result.success && result.data) {
        setTokens(result.data.accessToken, result.data.refreshToken);
        // Keep the button in its loading state until navigation completes
        // (first dashboard load can take a while in dev).
        router.push(nextRef.current ?? '/dashboard');
        return;
      }
      setLoading(false);
    } catch (err) {
      setError(loginErrorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-navy-50 px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-brand-700">{BRAND_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your jewelry management system
          </p>
        </div>

        {/* Demo hint: shown only when NEXT_PUBLIC_DEMO_MODE=true. Never prints credentials. */}
        {showDemoHint && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-800">Demo mode is enabled</p>
            <p className="text-amber-700 mt-1">Use the demo account credentials provided by your administrator.</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-8 shadow-sm">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="tenant">
              Business
            </label>
            <input
              id="tenant"
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="your-business-slug"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="you@yourbusiness.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Enter your password"
              required
            />
          </div>

          {expired && !error && (
            <div role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Your session expired, please sign in again.
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="flex justify-between text-sm">
            <Link href="/forgot-password" className="inline-flex min-h-10 items-center rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Forgot password?
            </Link>
            <Link href="/register" className="inline-flex min-h-10 items-center rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
