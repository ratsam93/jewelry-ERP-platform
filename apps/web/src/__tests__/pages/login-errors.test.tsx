import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import LoginPage from '../../../app/(auth)/login/page';

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }),
  );
}

async function submit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Business'), 'nope');
  await user.type(screen.getByLabelText('Email'), 'a@b.co');
  await user.type(screen.getByLabelText('Password'), 'secret123');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('admin login errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders a friendly message for 401 Invalid tenant (not [object Object])', async () => {
    mockFetch(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid tenant' } });
    render(<LoginPage />);
    await submit();
    expect(
      await screen.findByText('We could not find that business. Check the business name (slug).'),
    ).toBeTruthy();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  it('renders the rate-limit message for 429', async () => {
    mockFetch(429, { message: 'ThrottlerException: Too Many Requests' });
    render(<LoginPage />);
    await submit();
    await waitFor(() => expect(screen.getByText(/Too many attempts/)).toBeTruthy());
  });

  it('does not prefill the business or hard-code demo values', () => {
    mockFetch(200, {});
    render(<LoginPage />);
    expect((screen.getByLabelText('Business') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect(document.body.innerHTML).not.toMatch(/sharma|admin123/i);
  });
});
