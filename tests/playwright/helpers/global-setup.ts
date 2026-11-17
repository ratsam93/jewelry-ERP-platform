import { request as pwRequest, type APIRequestContext, type FullConfig } from '@playwright/test';
import { DEMO, E2E_CUSTOMER, loginSlot, readTokens, tokenFresh, writeTokens } from './auth';

async function postWithSlot(ctx: APIRequestContext, url: string, data: unknown) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await loginSlot();
    const res = await ctx.post(url, { data });
    if (res.status() !== 429) return res;
  }
  throw new Error(`global-setup: ${url} still rate limited (429)`);
}

/**
 * Log in ONCE for the whole run (staff user for admin/API tests, test customer for the storefront)
 * and cache the tokens; a still-valid cache from an earlier chunked run is reused.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const existing = readTokens();
  if (existing?.customer && tokenFresh(existing.accessToken) && tokenFresh(existing.customer.accessToken)) return;

  const baseURL = config.projects[0].use.baseURL as string;
  const ctx = await pwRequest.newContext({ baseURL, ignoreHTTPSErrors: true });
  try {
    const staff = await postWithSlot(ctx, '/api/v1/auth/login', DEMO);
    if (!staff.ok()) throw new Error(`global-setup staff login failed: ${staff.status()} ${await staff.text()}`);
    const sd = (await staff.json()).data;

    const loginBody = { email: E2E_CUSTOMER.email, password: E2E_CUSTOMER.password, tenantSlug: E2E_CUSTOMER.tenantSlug };
    let cust = await postWithSlot(ctx, '/api/v1/b2c/auth/login/email', loginBody);
    if (!cust.ok()) {
      // First run against this database: register the test customer (idempotent afterwards), then log in.
      await postWithSlot(ctx, '/api/v1/b2c/auth/register/email', E2E_CUSTOMER);
      cust = await postWithSlot(ctx, '/api/v1/b2c/auth/login/email', loginBody);
    }
    if (!cust.ok()) throw new Error(`global-setup customer login failed: ${cust.status()} ${await cust.text()}`);
    const cd = (await cust.json()).data;

    writeTokens({
      accessToken: sd.accessToken,
      refreshToken: sd.refreshToken,
      customer: { accessToken: cd.accessToken, refreshToken: cd.refreshToken },
    });
  } finally {
    await ctx.dispose();
  }
}
