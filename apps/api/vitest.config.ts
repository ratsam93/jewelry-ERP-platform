import { defineConfig } from 'vitest/config';
import path from 'path';
import swc from 'unplugin-swc';
import fs from 'fs';

// Integration tests boot AppModule, which needs the local MySQL/Redis settings.
// Load the repo-root .env (if present) without overriding variables already set.
try {
  const envFile = path.resolve(__dirname, '../../.env');
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // no .env: tests that need services will fail with a clear connection error
}

export default defineConfig({
  // esbuild does not emit decorator metadata, which NestJS DI needs for constructor
  // injection in integration tests. Compile TS with SWC (same as the real build).
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/**/*.test.ts',
      'src/__tests__/**/*.spec.ts',
      'src/modules/**/*.spec.ts',
      'src/auth/**/*.spec.ts',
      'src/common/**/*.spec.ts',
      'src/event-bus/**/*.spec.ts',
      'src/trpc/**/*.spec.ts',
    ],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 30_000,
    // Integration suites boot the full AppModule in beforeAll; allow time for it
    // (coverage instrumentation makes startup noticeably slower).
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/auth/**/*.ts',
        'src/modules/**/*.ts',
        'src/common/**/*.ts',
        'src/event-bus/**/*.ts',
        'src/trpc/**/*.ts',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.module.ts',
        'src/main.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@caratflow/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@caratflow/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@caratflow/db': path.resolve(__dirname, '../../packages/db/src'),
    },
  },
});
