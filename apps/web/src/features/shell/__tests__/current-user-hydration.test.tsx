import * as React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { useCurrentUserId } from '../current-user';
import { useAuthStore } from '@/store/auth-store';

function b64url(o: object) {
  return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const token = `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'user-42' })}.sig`;

function Probe() {
  const id = useCurrentUserId();
  return <span data-testid="id">{id ?? 'none'}</span>;
}

describe('useCurrentUserId hydration safety', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: token, user: null } as never);
  });

  it('renders null on the first (server/hydrating) render even when a token is stored', () => {
    expect(renderToString(<Probe />)).toContain('none');
  });

  it('exposes the id from the token after mount', async () => {
    render(<Probe />);
    expect(await screen.findByText('user-42')).toBeInTheDocument();
  });
});
