'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@caratflow/ui';
import { Users, UserPlus, Search, MoreVertical, Check, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { extractErrorMessage } from '@/lib/api-error';
import { PasswordField } from '@/features/settings/PasswordField';
import { CredentialsPanel } from '@/features/settings/CredentialsPanel';
import { validateCreateUser, type CreateUserErrors } from '@/features/settings/password-tools';

type BannerType = 'success' | 'error' | 'warning';
const BANNER_CLASS: Record<BannerType, string> = {
  success: 'border-green-200 bg-green-50 text-green-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
};
const EMPTY_CREATE = { firstName: '', lastName: '', email: '', roleId: '', password: '', confirmPassword: '' };

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string } | null;
}

export default function UsersPage() {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createData, setCreateData] = useState(EMPTY_CREATE);
  const [createErrors, setCreateErrors] = useState<CreateUserErrors>({});
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inviteData, setInviteData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    roleId: '',
  });
  const [banner, setBanner] = useState<{ type: BannerType; message: string } | null>(null);

  const usersQuery = trpc.platform.users.list.useQuery({
    page: 1,
    limit: 100,
    sortOrder: 'desc',
    search: searchQuery || undefined,
  });
  const rolesQuery = trpc.platform.roles.list.useQuery();
  const loginInfoQuery = trpc.platform.users.getLoginInfo.useQuery();
  const tenantSlug =
    (loginInfoQuery.data as { tenantSlug?: string } | undefined)?.tenantSlug ??
    process.env.NEXT_PUBLIC_TENANT_SLUG ??
    '';

  const createMutation = trpc.platform.users.create.useMutation({
    onSuccess: (_data, variables) => {
      setCredentials({ email: variables.email, password: variables.password });
      setBanner({ type: 'success', message: 'User created and active. They can sign in now.' });
      setShowCreateForm(false);
      setCreateData(EMPTY_CREATE);
      setCreateErrors({});
      void usersQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const inviteMutation = trpc.platform.users.invite.useMutation({
    onSuccess: (data) => {
      const emailSent = (data as { emailSent?: boolean } | undefined)?.emailSent === true;
      setBanner(
        emailSent
          ? { type: 'success', message: 'Invite sent successfully.' }
          : {
              type: 'warning',
              message:
                'User created, but no email could be sent (email is not configured). Use Create user with a password instead.',
            },
      );
      setShowInviteForm(false);
      setInviteData({ email: '', firstName: '', lastName: '', roleId: '' });
      void usersQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const activateMutation = trpc.platform.users.activate.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'User activated.' });
      void usersQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const deactivateMutation = trpc.platform.users.deactivate.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'User deactivated.' });
      void usersQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const users = ((usersQuery.data as { items?: UserRow[] } | undefined)?.items ?? []) as UserRow[];
  const roles = (rolesQuery.data as Array<{ id: string; name: string }> | undefined) ?? [];

  const handleInvite = () => {
    if (!inviteData.email || !inviteData.firstName || !inviteData.lastName) {
      setBanner({ type: 'error', message: 'First name, last name, and email are required.' });
      return;
    }
    inviteMutation.mutate({
      email: inviteData.email,
      firstName: inviteData.firstName,
      lastName: inviteData.lastName,
      roleId: inviteData.roleId || undefined,
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateCreateUser(createData);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setCredentials(null);
    createMutation.mutate({
      email: createData.email.trim(),
      firstName: createData.firstName.trim(),
      lastName: createData.lastName.trim(),
      roleId: createData.roleId,
      password: createData.password,
    });
  };

  const handleToggleActive = (userId: string, isActive: boolean) => {
    if (isActive) {
      deactivateMutation.mutate({ userId });
    } else {
      activateMutation.mutate({ userId });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage user accounts and access."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'Users' },
        ]}
      />

      {banner && (
        <div role={banner.type === 'error' ? 'alert' : 'status'} className={`rounded-md border p-3 text-sm ${BANNER_CLASS[banner.type]}`}>
          {banner.message}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border py-2 pl-9 pr-3 text-sm sm:w-72"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(true);
              setShowInviteForm(false);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add user
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInviteForm(true);
              setShowCreateForm(false);
            }}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Invite by email
          </button>
        </div>
      </div>

      {credentials && (
        <CredentialsPanel
          tenantSlug={tenantSlug}
          email={credentials.email}
          password={credentials.password}
          onDone={() => setCredentials(null)}
        />
      )}

      {/* Add user (with password) */}
      {showCreateForm && (
        <form onSubmit={handleCreate} noValidate aria-labelledby="add-user-heading" className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 id="add-user-heading" className="mb-1 text-lg font-semibold">Add user</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Creates an active account right away. No email is needed: you share the password yourself.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="add-first-name">First name</label>
              <input id="add-first-name" type="text" value={createData.firstName} onChange={(e) => setCreateData({ ...createData, firstName: e.target.value })} aria-invalid={createErrors.firstName ? true : undefined} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              {createErrors.firstName && <p role="alert" className="mt-1 text-xs text-red-600">{createErrors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="add-last-name">Last name</label>
              <input id="add-last-name" type="text" value={createData.lastName} onChange={(e) => setCreateData({ ...createData, lastName: e.target.value })} aria-invalid={createErrors.lastName ? true : undefined} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              {createErrors.lastName && <p role="alert" className="mt-1 text-xs text-red-600">{createErrors.lastName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="add-email">Email</label>
              <input id="add-email" type="email" autoComplete="off" value={createData.email} onChange={(e) => setCreateData({ ...createData, email: e.target.value })} aria-invalid={createErrors.email ? true : undefined} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              {createErrors.email && <p role="alert" className="mt-1 text-xs text-red-600">{createErrors.email}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="add-role">Role</label>
              <select id="add-role" value={createData.roleId} onChange={(e) => setCreateData({ ...createData, roleId: e.target.value })} aria-invalid={createErrors.roleId ? true : undefined} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Select a role...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              {createErrors.roleId && <p role="alert" className="mt-1 text-xs text-red-600">{createErrors.roleId}</p>}
            </div>
            <div className="md:col-span-2">
              <PasswordField
                label="Password"
                value={createData.password}
                onChange={(password) => setCreateData((d) => ({ ...d, password }))}
                confirmValue={createData.confirmPassword}
                onConfirmChange={(confirmPassword) => setCreateData((d) => ({ ...d, confirmPassword }))}
                error={createErrors.password}
                confirmError={createErrors.confirmPassword}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {createMutation.isPending ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      )}

      {/* Invite Form */}
      {showInviteForm && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold">Invite by email</h3>
          <p className="mb-4 text-sm text-muted-foreground">Sends a temporary password by email. Requires an email provider to be configured; otherwise use Add user.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="invite-first-name">First Name</label>
              <input id="invite-first-name" type="text" value={inviteData.firstName} onChange={(e) => setInviteData({ ...inviteData, firstName: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="invite-last-name">Last Name</label>
              <input id="invite-last-name" type="text" value={inviteData.lastName} onChange={(e) => setInviteData({ ...inviteData, lastName: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="invite-email">Email</label>
              <input id="invite-email" type="email" value={inviteData.email} onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="invite-role">Role</label>
              <select id="invite-role" value={inviteData.roleId} onChange={(e) => setInviteData({ ...inviteData, roleId: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                <option value="">Select a role...</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowInviteForm(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button
              onClick={handleInvite}
              disabled={inviteMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {inviteMutation.isPending ? 'Sending...' : 'Send invite'}
            </button>
          </div>
        </div>
      )}

      {/* User Table */}
      {usersQuery.isLoading ? (
        <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No users yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add your first team member to get started.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Last Login</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/settings/users/${user.id}`} className="font-medium hover:text-primary">
                      {user.firstName} {user.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {user.role?.name ?? 'No role'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.isActive ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleActive(user.id, user.isActive)}
                      disabled={activateMutation.isPending || deactivateMutation.isPending}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      title={user.isActive ? 'Deactivate user' : 'Activate user'}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
