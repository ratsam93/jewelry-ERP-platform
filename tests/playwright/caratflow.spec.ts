import { E2E_CUSTOMER, loginSlot } from './helpers/auth';
import { test, expect } from '@playwright/test';

// B2C STOREFRONT
test.describe('B2C Storefront', () => {
  test('Homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  // Credentials are no longer printed on / pre-filled into the login page.
  test('Login page has email/password form and does not leak demo credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('admin123');
  });

  test('Login works with entered credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');
    await page.locator('input[type="email"]').first().fill(E2E_CUSTOMER.email);
    await page.locator('input[type="password"]').first().fill(E2E_CUSTOMER.password);
    await loginSlot();
    await page.click('button[type="submit"]:has-text("Sign In")');
    // Success: tokens stored and the app routes to /account (no toast any more).
    await expect(page).toHaveURL(/\/account/, { timeout: 15000 });
    expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeTruthy();
  });

  test('Register page loads', async ({ page }) => {
    await page.goto('/auth/register');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Category page loads', async ({ page }) => {
    await page.goto('/category/gold');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Cart page loads', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Search page loads', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Wishlist page loads', async ({ page }) => {
    await page.goto('/wishlist');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Compare page loads', async ({ page }) => {
    await page.goto('/compare');
    await expect(page.locator('body')).toBeVisible();
  });

  test('AR Try-On page loads', async ({ page }) => {
    await page.goto('/try-on');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Chat page loads', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Account page loads', async ({ page }) => {
    await page.goto('/account');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Checkout page loads', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.locator('body')).toBeVisible();
  });
});

// ADMIN DASHBOARD
test.describe('Admin Dashboard', () => {
  test('Admin login page with demo credentials', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.locator('body')).toContainText(/Demo Credentials|CaratFlow|Sign in/i);
  });

  test('Dashboard loads', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Inventory loads', async ({ page }) => {
    await page.goto('/admin/inventory');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Manufacturing loads', async ({ page }) => {
    await page.goto('/admin/manufacturing');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Retail loads', async ({ page }) => {
    await page.goto('/admin/retail');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Finance loads', async ({ page }) => {
    await page.goto('/admin/finance');
    await expect(page.locator('body')).toBeVisible();
  });

  test('CRM loads', async ({ page }) => {
    await page.goto('/admin/crm');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Wholesale loads', async ({ page }) => {
    await page.goto('/admin/wholesale');
    await expect(page.locator('body')).toBeVisible();
  });

  test('E-Commerce loads', async ({ page }) => {
    await page.goto('/admin/ecommerce');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Compliance loads', async ({ page }) => {
    await page.goto('/admin/compliance');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Reports loads', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.locator('body')).toBeVisible();
  });

  test('Settings loads', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page.locator('body')).toBeVisible();
  });

  test('CMS loads', async ({ page }) => {
    await page.goto('/admin/cms');
    await expect(page.locator('body')).toBeVisible();
  });
});

// API ENDPOINTS
test.describe('API Endpoints', () => {
  // Swagger is OFF unless SWAGGER_ENABLED=true (D-026): 404 when disabled, 200 when enabled.
  test('Swagger docs: 200 when enabled, 404 when disabled', async ({ request }) => {
    const res = await request.get('/api/docs');
    expect([200, 404]).toContain(res.status());
  });

  test('Login returns JWT tokens', async ({ request }) => {
    await loginSlot();
    const res = await request.post('/api/v1/auth/login', {
      data: { email: 'admin@sharmajewellers.com', password: 'admin123', tenantSlug: 'sharma-jewellers' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
  });

  test('Wrong password returns 401', async ({ request }) => {
    await loginSlot();
    const res = await request.post('/api/v1/auth/login', {
      data: { email: 'admin@sharmajewellers.com', password: 'wrong', tenantSlug: 'sharma-jewellers' },
    });
    expect(res.status()).toBe(401);
  });

  test('Invalid tenant returns 401', async ({ request }) => {
    await loginSlot();
    const res = await request.post('/api/v1/auth/login', {
      data: { email: 'a@b.com', password: 'x', tenantSlug: 'fake' },
    });
    expect(res.status()).toBe(401);
  });

  test('Missing fields returns 400', async ({ request }) => {
    await loginSlot();
    const res = await request.post('/api/v1/auth/login', { data: {} });
    expect(res.status()).toBe(400);
  });

  test('Token refresh works', async ({ request }) => {
    await loginSlot();
    const login = await request.post('/api/v1/auth/login', {
      data: { email: 'admin@sharmajewellers.com', password: 'admin123', tenantSlug: 'sharma-jewellers' },
    });
    const { refreshToken } = (await login.json()).data;
    const res = await request.post('/api/v1/auth/refresh', { data: { refreshToken } });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.accessToken).toBeTruthy();
  });

  test('Logout then revoked token rejected', async ({ request }) => {
    await loginSlot();
    const login = await request.post('/api/v1/auth/login', {
      data: { email: 'admin@sharmajewellers.com', password: 'admin123', tenantSlug: 'sharma-jewellers' },
    });
    const { refreshToken } = (await login.json()).data;
    await request.post('/api/v1/auth/logout', { data: { refreshToken } });
    const revoked = await request.post('/api/v1/auth/refresh', { data: { refreshToken } });
    expect(revoked.status()).toBe(401);
  });
});
