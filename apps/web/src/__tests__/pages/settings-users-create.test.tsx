import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type MutationOpts = { onSuccess?: (data: unknown, vars: Record<string, unknown>) => void; onError?: (e: unknown) => void };

const h = vi.hoisted(() => ({
  opts: {} as Record<string, MutationOpts>,
  mutate: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('@/lib/trpc', () => {
  function proxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          const key = path.join('.');
          if (prop === 'useQuery') {
            return () => {
              if (key === 'platform.roles.list') return { data: [{ id: 'role-1', name: 'Manager' }], isLoading: false, error: null, refetch: vi.fn() };
              if (key === 'platform.users.getLoginInfo') return { data: { tenantSlug: 'acme-jewels', tenantName: 'Acme' }, isLoading: false, error: null, refetch: vi.fn() };
              if (key === 'platform.users.list') return { data: { items: [] }, isLoading: false, error: null, refetch: vi.fn() };
              return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
            };
          }
          if (prop === 'useMutation') {
            return (o: MutationOpts) => {
              h.opts[key] = o;
              h.mutate[key] ??= vi.fn();
              return { mutate: h.mutate[key], isPending: false, error: null };
            };
          }
          return proxy([...path, prop]);
        },
      },
    );
  }
  return { trpc: proxy([]) };
});

import UsersPage from '../../../app/(dashboard)/settings/users/page';

const PW = 'Str0ng!Passw0rd';

beforeEach(() => {
  h.opts = {};
  h.mutate = {};
});

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^add user$/i }));
  return screen.getByRole('form', { name: /add user/i });
}

describe('Settings > Users: Add user with password', () => {
  it('offers Add user as the primary action and keeps Invite by email as secondary', () => {
    render(<UsersPage />);
    expect(screen.getByRole('button', { name: /^add user$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /invite by email/i })).toBeInTheDocument();
  });

  it('shows readable validation errors and does not call the API', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: /create user/i }));
    expect(within(form).getByText('Enter a first name.')).toBeInTheDocument();
    expect(within(form).getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(within(form).getByText('Select a role.')).toBeInTheDocument();
    expect(h.mutate['platform.users.create']).not.toHaveBeenCalled();
  });

  it('generates a strong password into both fields and can show/hide it', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: /generate strong password/i }));
    const pw = within(form).getByLabelText('Password') as HTMLInputElement;
    const confirm = within(form).getByLabelText('Confirm password') as HTMLInputElement;
    expect(pw.value).toHaveLength(16);
    expect(confirm.value).toBe(pw.value);
    expect(pw.type).toBe('text'); // generated passwords are revealed so the admin can see them
    await user.click(within(form).getByRole('button', { name: /hide password/i }));
    expect(pw.type).toBe('password');
    expect(within(form).getByText('Strong')).toBeInTheDocument();
  });

  it('submits the form, then shows the one-time credentials panel with slug, email and password', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    const form = await openForm(user);
    await user.type(within(form).getByLabelText('First name'), 'Asha');
    await user.type(within(form).getByLabelText('Last name'), 'Rao');
    await user.type(within(form).getByLabelText('Email'), 'asha@example.com');
    await user.selectOptions(within(form).getByLabelText('Role'), 'role-1');
    await user.type(within(form).getByLabelText('Password'), PW);
    await user.type(within(form).getByLabelText('Confirm password'), PW);
    await user.click(within(form).getByRole('button', { name: /create user/i }));

    expect(h.mutate['platform.users.create']).toHaveBeenCalledWith({
      email: 'asha@example.com',
      firstName: 'Asha',
      lastName: 'Rao',
      roleId: 'role-1',
      password: PW,
    });

    // Server accepted it.
    h.opts['platform.users.create']!.onSuccess!({}, { email: 'asha@example.com', password: PW });
    const panel = await screen.findByRole('region', { name: /share these login details securely/i });
    expect(within(panel).getByText('acme-jewels')).toBeInTheDocument();
    expect(within(panel).getByText('asha@example.com')).toBeInTheDocument();
    expect(within(panel).getByText(PW)).toBeInTheDocument();
    expect(within(panel).getByText(/ask the user to change it after first login/i)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /copy/i })).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /i have saved these details/i }));
    await waitFor(() => expect(screen.queryByText(PW)).toBeNull());
  });

  it('shows the server error (for example a duplicate email) in readable form', async () => {
    render(<UsersPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^add user$/i }));
    h.opts['platform.users.create']!.onError!(new Error('A user with this email already exists in this tenant'));
    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists in this tenant');
  });
});

describe('Settings > Users: invite is truthful', () => {
  it('warns when no email could be sent', async () => {
    render(<UsersPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: /invite by email/i }));
    h.opts['platform.users.invite']!.onSuccess!({ emailSent: false }, {});
    expect(
      await screen.findByText(
        'User created, but no email could be sent (email is not configured). Use Create user with a password instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Invite sent successfully.')).toBeNull();
  });

  it('confirms only when the email was really sent', async () => {
    render(<UsersPage />);
    await userEvent.setup().click(screen.getByRole('button', { name: /invite by email/i }));
    h.opts['platform.users.invite']!.onSuccess!({ emailSent: true }, {});
    expect(await screen.findByText('Invite sent successfully.')).toBeInTheDocument();
  });
});
