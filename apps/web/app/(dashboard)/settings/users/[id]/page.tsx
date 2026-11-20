'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { Save, ShieldCheck, Key } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { renderDetailState } from '@/components/detail-states';
import { extractErrorMessage } from '@/lib/api-error';
import { PasswordField } from '@/features/settings/PasswordField';
import { validateNewPassword } from '@/features/settings/password-tools';

interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string | null;
  isActive: boolean;
  role: { id: string; name: string } | null;
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const userQuery = trpc.platform.users.getById.useQuery({ userId }, { enabled: !!userId });
  const rolesQuery = trpc.platform.roles.list.useQuery();

  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    roleId: '',
    isActive: true,
  });
  const [initialProfile, setInitialProfile] = useState(profile);

  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const u = userQuery.data as UserDetail | undefined;
    if (!u) return;
    const next = {
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      email: u.email ?? '',
      roleId: u.roleId ?? '',
      isActive: u.isActive,
    };
    setProfile(next);
    setInitialProfile(next);
  }, [userQuery.data]);

  const roles = (rolesQuery.data as Array<{ id: string; name: string }> | undefined) ?? [];

  const updateProfileMutation = trpc.platform.users.updateProfile.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'Profile updated.' });
      setInitialProfile(profile);
      void userQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const assignRoleMutation = trpc.platform.roles.assignToUser.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'Role updated.' });
      void userQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const setPasswordMutation = trpc.platform.users.setPassword.useMutation({
    onSuccess: () => {
      setBanner({
        type: 'success',
        message: 'Password reset. The user has been signed out everywhere and must use the new password. Share it securely.',
      });
      setShowPasswordForm(false);
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const activateMutation = trpc.platform.users.activate.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'User activated.' });
      void userQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const deactivateMutation = trpc.platform.users.deactivate.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'User deactivated.' });
      void userQuery.refetch();
    },
    onError: (err) => setBanner({ type: 'error', message: extractErrorMessage(err) }),
  });

  const isDirty =
    profile.firstName !== initialProfile.firstName ||
    profile.lastName !== initialProfile.lastName;

  const handleSaveProfile = () => {
    if (!isDirty) return;
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setBanner({ type: 'error', message: 'First and last name are required.' });
      return;
    }
    updateProfileMutation.mutate({
      userId,
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
    });
  };

  const handleAssignRole = (roleId: string) => {
    setProfile({ ...profile, roleId });
    if (!roleId) {
      setBanner({ type: 'error', message: 'Select a role to assign.' });
      return;
    }
    assignRoleMutation.mutate({ userId, roleId });
  };

  const handleResetPassword = () => {
    const errors = validateNewPassword(passwordForm.newPassword, passwordForm.confirmPassword);
    setPasswordErrors(errors);
    if (errors.password || errors.confirmPassword) return;
    setPasswordMutation.mutate({ userId, newPassword: passwordForm.newPassword });
  };

  const handleToggleActive = () => {
    if (profile.isActive) {
      deactivateMutation.mutate({ userId });
    } else {
      activateMutation.mutate({ userId });
    }
  };

  const state = renderDetailState({
    isLoading: userQuery.isLoading,
    error: userQuery.error,
    data: userQuery.data,
    entity: 'User',
    backHref: '/settings/users',
    onRetry: () => void userQuery.refetch(),
  });
  if (state) return state;

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Profile"
        description="View and manage user account details."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Settings', href: '/settings' },
          { label: 'Users', href: '/settings/users' },
          { label: `${profile.firstName || 'User'} ${profile.lastName || ''}`.trim() },
        ]}
      />

      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`rounded-md border p-3 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      {/* Profile Section */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold">Profile Information</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium" htmlFor="user-first-name">First Name</label>
            <input id="user-first-name" type="text" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="user-last-name">Last Name</label>
            <input id="user-last-name" type="text" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium" htmlFor="user-email">Email</label>
            <input id="user-email" type="email" value={profile.email} disabled className="mt-1 w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground" />
            <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed after account creation.</p>
          </div>
        </div>
        <div className="flex justify-end border-t p-4">
          <button
            onClick={handleSaveProfile}
            disabled={updateProfileMutation.isPending || !isDirty}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Role Assignment */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Role Assignment</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The assigned role determines what this user can access and modify.
          </p>
        </div>
        <div className="p-6">
          <select
            value={profile.roleId}
            onChange={(e) => handleAssignRole(e.target.value)}
            disabled={assignRoleMutation.isPending}
            className="w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50 md:w-1/2"
          >
            <option value="">No role assigned</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Reset password (admin) */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b p-6">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Password</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a new password for this user. They will be signed out everywhere. To change your own password, use your profile page.
          </p>
        </div>
        <div className="p-6">
          {!showPasswordForm ? (
            <button type="button" onClick={() => setShowPasswordForm(true)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              Reset password
            </button>
          ) : (
            <div className="max-w-lg space-y-4">
              <PasswordField
                label="New password"
                value={passwordForm.newPassword}
                onChange={(newPassword) => setPasswordForm((f) => ({ ...f, newPassword }))}
                confirmLabel="Confirm new password"
                confirmValue={passwordForm.confirmPassword}
                onConfirmChange={(confirmPassword) => setPasswordForm((f) => ({ ...f, confirmPassword }))}
                error={passwordErrors.password}
                confirmError={passwordErrors.confirmPassword}
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPasswordForm(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={setPasswordMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {setPasswordMutation.isPending ? 'Resetting...' : 'Reset password'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Status */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold">Account Status</h2>
        </div>
        <div className="flex items-center justify-between p-6">
          <div>
            <p className="font-medium">
              Status: <span className={profile.isActive ? 'text-green-600' : 'text-red-600'}>{profile.isActive ? 'Active' : 'Inactive'}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {profile.isActive ? 'This user can log in and access the system.' : 'This user is deactivated and cannot log in.'}
            </p>
          </div>
          <button
            onClick={handleToggleActive}
            disabled={activateMutation.isPending || deactivateMutation.isPending}
            className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${profile.isActive ? 'border border-red-300 text-red-700 hover:bg-red-50' : 'bg-green-600 text-white hover:bg-green-700'}`}
          >
            {profile.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
