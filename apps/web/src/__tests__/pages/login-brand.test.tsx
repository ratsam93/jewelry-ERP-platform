import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import LoginPage from '../../../app/(auth)/login/page';
import RegisterPage from '../../../app/(auth)/register/page';

describe('admin brand on auth pages', () => {
  it('login page shows TechBeyond', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'TechBeyond' })).toBeTruthy();
    expect(screen.queryByText(/CaratFlow/)).toBeNull();
  });

  it('register page shows TechBeyond', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('heading', { name: 'TechBeyond' })).toBeTruthy();
  });
});
