'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@caratflow/ui';
import { trpc } from '@/lib/trpc';
import { useCurrentUserId, useHydrated } from '@/features/shell/current-user';
import { validatePasswordChange, type PasswordErrors } from '@/features/settings/password-validation';

interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: { id: string; name: string } | null;
}

type Banner = { type: 'success' | 'error'; message: string } | null;

export default function ProfilePage() {
  const hydrated = useHydrated();
  const userId = useCurrentUserId();
  const utils = trpc.useUtils();
  const meQuery = trpc.platform.users.getById.useQuery(
    { userId: userId ?? '' },
    { enabled: !!userId },
  );
  const me = meQuery.data as Me | undefined;

  const [names, setNames] = useState({ firstName: '', lastName: '' });
  const [nameBanner, setNameBanner] = useState<Banner>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwErrors, setPwErrors] = useState<PasswordErrors>({});
  const [pwBanner, setPwBanner] = useState<Banner>(null);

  useEffect(() => {
    if (me) setNames({ firstName: me.firstName ?? '', lastName: me.lastName ?? '' });
  }, [me]);

  const updateProfile = trpc.platform.users.updateProfile.useMutation({
    onSuccess: async () => {
      setNameBanner({ type: 'success', message: 'Display name updated.' });
      await utils.platform.users.getById.invalidate();
    },
    onError: (err) => setNameBanner({ type: 'error', message: err.message }),
  });

  const changePassword = trpc.platform.users.changePassword.useMutation({
    onSuccess: () => {
      setPwBanner({ type: 'success', message: 'Password changed.' });
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwErrors({});
    },
    onError: (err) => setPwBanner({ type: 'error', message: err.message }),
  });

  const saveName = () => {
    const firstName = names.firstName.trim();
    const lastName = names.lastName.trim();
    if (!userId || !firstName || !lastName) {
      setNameBanner({ type: 'error', message: 'First and last name are required.' });
      return;
    }
    setNameBanner(null);
    updateProfile.mutate({ userId, firstName, lastName });
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwBanner(null);
    const errors = validatePasswordChange(pw);
    setPwErrors(errors);
    if (Object.keys(errors).length > 0) return;
    changePassword.mutate({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
  };

  const bannerClass = (b: NonNullable<Banner>) =>
    `rounded-md border p-3 text-sm ${
      b.type === 'success'
        ? 'border-green-200 bg-green-50 text-green-700'
        : 'border-red-200 bg-red-50 text-red-700'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Your account details and password."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Profile' }]}
      />

      <section className="rounded-lg border bg-card shadow-sm" aria-labelledby="profile-details">
        <div className="border-b p-6">
          <h2 id="profile-details" className="text-lg font-semibold">Account</h2>
        </div>
        <div className="space-y-4 p-6">
          {nameBanner && <div role="status" className={bannerClass(nameBanner)}>{nameBanner.message}</div>}
          {!hydrated || meQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading profile...</p>
          ) : !me ? (
            <p className="text-sm text-muted-foreground">Could not load your profile.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium" htmlFor="profile-first">First name</label>
                <input id="profile-first" type="text" value={names.firstName} onChange={(e) => setNames({ ...names, firstName: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="profile-last">Last name</label>
                <input id="profile-last" type="text" value={names.lastName} onChange={(e) => setNames({ ...names, lastName: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="profile-email">Email</label>
                <input id="profile-email" type="email" value={me.email} readOnly className="mt-1 w-full rounded-md border bg-muted px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium" htmlFor="profile-role">Role</label>
                <input id="profile-role" type="text" value={me.role?.name ?? 'No role assigned'} readOnly className="mt-1 w-full rounded-md border bg-muted px-3 py-2 text-sm" />
              </div>
            </div>
          )}
        </div>
        {me && (
          <div className="flex justify-end border-t p-4">
            <button type="button" onClick={saveName} disabled={updateProfile.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {updateProfile.isPending ? 'Saving...' : 'Save name'}
            </button>
          </div>
        )}
      </section>

      <form onSubmit={submitPassword} noValidate className="rounded-lg border bg-card shadow-sm" aria-labelledby="profile-password">
        <div className="border-b p-6">
          <h2 id="profile-password" className="text-lg font-semibold">Change password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            At least 10 characters with upper and lower case letters, a number and a symbol.
          </p>
        </div>
        <div className="space-y-4 p-6">
          {pwBanner && <div role="status" className={bannerClass(pwBanner)}>{pwBanner.message}</div>}
          {(
            [
              ['currentPassword', 'Current password', 'current-password'],
              ['newPassword', 'New password', 'new-password'],
              ['confirmPassword', 'Confirm new password', 'new-password'],
            ] as const
          ).map(([key, label, autoComplete]) => (
            <div key={key} className="md:w-1/2">
              <label className="block text-sm font-medium" htmlFor={`pw-${key}`}>{label}</label>
              <input
                id={`pw-${key}`}
                type="password"
                autoComplete={autoComplete}
                value={pw[key]}
                onChange={(e) => setPw({ ...pw, [key]: e.target.value })}
                aria-invalid={pwErrors[key] ? true : undefined}
                aria-describedby={pwErrors[key] ? `pw-${key}-err` : undefined}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
              {pwErrors[key] && (
                <p id={`pw-${key}-err`} className="mt-1 text-xs text-red-600">{pwErrors[key]}</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t p-4">
          <button type="submit" disabled={changePassword.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {changePassword.isPending ? 'Changing...' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}
