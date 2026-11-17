'use client';

import * as React from 'react';
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppRouter } from '../../../api/src/trpc/trpc.router';
import { shouldRetryQuery } from './query-retry';
import { authFetch } from './auth-session';

/**
 * Real tRPC v11 React client wired against the NestJS backend at /trpc.
 *
 * AppRouter is imported as a type-only reference from apps/api so we get
 * end-to-end type safety without pulling apps/api into the runtime bundle.
 */
export const trpc = createTRPCReact<AppRouter>();

/** Resolve the API base URL. Empty string in the browser uses the current origin. */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? '';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

/** Read the JWT access token from the same place apps/web/src/lib/api.ts uses. */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/v1/trpc`,
        // The server router (apps/api/src/trpc/trpc.service.ts) sets a custom
        // transformer, and tRPC v11 types require the client link to declare one.
        // Identity functions mirror the server's input/output deserialize steps,
        // so requests and responses are sent exactly as before.
        transformer: {
          input: { serialize: (obj: unknown) => obj, deserialize: (obj: unknown) => obj },
          output: { serialize: (obj: unknown) => obj, deserialize: (obj: unknown) => obj },
        },
        // On HTTP 401: one silent token refresh + retry, else redirect to login.
        fetch: authFetch,
        headers() {
          const token = getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

/** Backwards-compatible alias kept so existing imports keep working. */
export function getTrpcClient() {
  return createTrpcClient();
}

export function TrpcProvider({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient?: QueryClient;
}) {
  const [client] = React.useState(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 5 * 60 * 1000, retry: shouldRetryQuery },
        },
      }),
  );
  const [trpcClient] = React.useState(() => createTrpcClient());

  // Note: cast children through `as any` to bridge a known
  // duplicate-@types/react instance issue between @tanstack/react-query and the
  // workspace root that pre-dates this file. Runtime is unaffected.
  return (
    <trpc.Provider client={trpcClient} queryClient={client}>
      <QueryClientProvider client={client}>{children as any}</QueryClientProvider>
    </trpc.Provider>
  );
}
