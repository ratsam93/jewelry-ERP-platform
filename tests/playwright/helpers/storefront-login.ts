import type { Page } from '@playwright/test';
import { E2E_CUSTOMER, customerTokens, loginSlot } from './auth';

/**
 * Log in to the B2C storefront.
 *
 * The storefront login page no longer pre-fills a demo customer and the API login route is rate
 * limited, so by default we reuse the tokens produced once by global-setup (the registered E2E test customer; staff users are not storefront customers)
 * and seed them into localStorage (`accessToken` / `refreshToken`, the keys the storefront api
 * client reads). Pass explicit `email` / `password` to drive the real /auth/login form instead
 * (throttled so it cannot trip the rate limit).
 *
 * Returns true if login appears to have succeeded (accessToken present), false otherwise.
 */
export async function loginAsCustomer(
  page: Page,
  options: { goto?: string; email?: string; password?: string } = {},
): Promise<boolean> {
  const { goto, email, password } = options;

  if (!email && !password) {
    const t = customerTokens();
    await page.addInitScript(
      ([a, r]) => {
        localStorage.setItem('accessToken', a);
        localStorage.setItem('refreshToken', r);
      },
      [t.accessToken, t.refreshToken],
    );
    await page.goto(goto ?? '/account');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    return !!(await page.evaluate(() => localStorage.getItem('accessToken')));
  }

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const emailTab = page.locator('button:has-text("Email")').first();
  if (await emailTab.isVisible().catch(() => false)) {
    await emailTab.click().catch(() => undefined);
  }
  await page.locator('input[type="email"]').first().fill(email ?? E2E_CUSTOMER.email);
  await page.locator('input[type="password"]').first().fill(password ?? E2E_CUSTOMER.password);
  await loginSlot();
  // Avoid the social buttons ("Continue with ..."): click the email/password Sign In.
  await page.locator('button[type="submit"]:has-text("Sign In")').first().click();

  // (waitForFunction is blocked by the storefront CSP (no unsafe-eval): poll via evaluate instead.)
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) {
    ok = !!(await page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null));
    if (!ok) await page.waitForTimeout(500);
  }

  if (ok && goto) {
    await page.goto(goto);
    await page.waitForLoadState('networkidle').catch(() => undefined);
  }
  return ok;
}
