import path from 'node:path';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:4000';
  }
}

const api = apiOrigin();
const wsApi = api.replace(/^http/, 'ws');

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${api} ${wsApi}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// Container builds (docker/web.Dockerfile) set NEXT_OUTPUT=standalone to emit a minimal
// self-contained server. Off by default so local builds are unchanged.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

const nextConfig: NextConfig = {
  ...(standalone
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(process.cwd(), '../..') }
    : {}),
  basePath: '/admin',
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@caratflow/ui', '@caratflow/shared-types', '@caratflow/utils'],
  // Local/dev convenience: the browser calls relative /api/v1 URLs (designed for a
  // reverse proxy). Forward them to the API when no proxy is in front.
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*`, basePath: false }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
