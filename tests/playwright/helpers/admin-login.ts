import type { Page } from '@playwright/test';
import { DEMO, loginSlot, sharedTokens } from './auth';

/**
 * Log in to the admin app.
 *
 * The login page no longer pre-fills credentials and the API login route is rate limited
 * (5/min/IP), so by default we reuse the tokens produced once by global-setup and seed them into
 * localStorage (the admin auth store reads `accessToken` / `refreshToken` from there).
 *
 * Pass explicit `tenant` / `email` / `password` to drive the real login form instead
 * (throttled so it cannot trip the rate limit).
 *
 * Callers may pass a `goto` URL to land on after login (relative to baseURL).
 */
export async function loginAsAdmin(
  page: Page,
  options: { goto?: string; tenant?: string; email?: string; password?: string } = {},
): Promise<void> {
  const { goto, tenant, email, password } = options;

  if (!tenant && !email && !password) {
    const t = sharedTokens();
    await page.addInitScript(
      ([a, r]) => {
        localStorage.setItem('accessToken', a);
        localStorage.setItem('refreshToken', r);
      },
      [t.accessToken, t.refreshToken],
    );
    await page.goto(goto ?? '/admin/dashboard');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    return;
  }

  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
  await page.locator('#tenant').fill(tenant ?? DEMO.tenantSlug);
  await page.locator('#email').fill(email ?? DEMO.email);
  await page.locator('#password').fill(password ?? DEMO.password);
  await loginSlot();
  await page.locator('button[type="submit"]').first().click();
  // (waitForFunction can be blocked by the CSP (no unsafe-eval): poll via evaluate instead.)
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null)) break;
    await page.waitForTimeout(500);
  }

  if (goto) {
    await page.goto(goto);
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }
}
