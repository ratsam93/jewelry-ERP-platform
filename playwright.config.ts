import { defineConfig } from '@playwright/test';

/**
 * Run locally against the live stack:
 *   API http://localhost:4000, admin http://localhost:3000/admin, storefront http://localhost:3003
 * A tiny path-routing proxy (tests/playwright/helpers/dev-proxy.js) is started automatically and
 * mimics the hosted demo domain layout (/api -> API, /admin -> admin, / -> storefront).
 *
 * Env vars:
 *   E2E_BASE_URL     use an already-hosted origin instead (e.g. https://caratflow.globusdemos.com); disables the proxy
 *   E2E_PROXY_PORT   proxy port (default 3001: must be a CORS-allowed origin of the API, see CORS_ORIGINS)
 *   E2E_API_URL / E2E_ADMIN_URL / E2E_STORE_URL   upstream targets for the proxy
 *   E2E_REPORT_DIR   where the JSON report is written (optional)
 */
const external = process.env.E2E_BASE_URL;
const proxyPort = Number(process.env.E2E_PROXY_PORT || 3001);
const baseURL = external || `http://localhost:${proxyPort}`;

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 60000,
  globalSetup: './tests/playwright/helpers/global-setup.ts',
  retries: 1,
  workers: 2,
  reporter: process.env.E2E_REPORT_DIR
    ? [['line'], ['json', { outputFile: `${process.env.E2E_REPORT_DIR}/report.json` }]]
    : [['line']],
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
  },
  webServer: external
    ? undefined
    : {
        command: 'node tests/playwright/helpers/dev-proxy.js',
        url: `${baseURL}/health`,
        reuseExistingServer: true,
        timeout: 20000,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
