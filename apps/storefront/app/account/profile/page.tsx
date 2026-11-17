"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { validateProfile, type ProfileErrors } from "@/lib/profile-validation";

interface ProfileResponse {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  fullName?: string;
}

export default function ProfilePage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    newPassword: "",
    confirm: "",
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ProfileErrors>({});

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch<ProfileResponse>("/api/v1/store/account/profile");
        if (cancelled) return;
        const fullName = data.fullName ?? "";
        const parts = fullName.trim().split(/\s+/);
        setForm({
          firstName: data.firstName ?? parts[0] ?? "",
          lastName: data.lastName ?? parts.slice(1).join(" ") ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          if (typeof window !== "undefined") window.location.href = "/auth/login";
          return;
        }
        if (!cancelled) setProfileError(err instanceof Error ? err.message : "Could not load profile");
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    const errs = validateProfile(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSavingProfile(true);
    try {
      await apiFetch("/api/v1/store/account/profile", {
        method: "PUT",
        body: {
          firstName: form.firstName.trim() || undefined,
          lastName: form.lastName.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
        },
      });
      setProfileSuccess("Profile updated successfully.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (typeof window !== "undefined") window.location.href = "/auth/login";
        return;
      }
      setProfileError(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (!passwordForm.current || !passwordForm.newPassword) {
      setPasswordError("Please fill in both current and new password");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch("/api/v1/store/account/password", {
        method: "PUT",
        body: {
          currentPassword: passwordForm.current,
          newPassword: passwordForm.newPassword,
        },
      });
      setPasswordForm({ current: "", newPassword: "", confirm: "" });
      setPasswordSuccess("Password changed successfully.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        if (typeof window !== "undefined") window.location.href = "/auth/login";
        return;
      }
      setPasswordError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSavingPassword(false);
    }
  }

  const fullName = `${form.firstName} ${form.lastName}`.trim();

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-6" style={{ fontFamily: "var(--font-serif)" }}>My Profile</h1>

      <div className="space-y-6">
        {/* Profile info */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-navy mb-4">Personal Information</h2>
          {loadingProfile ? (
            <p className="text-sm text-navy/50">Loading profile...</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSaveProfile} noValidate>
              {profileError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{profileError}</div>
              )}
              {profileSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">{profileSuccess}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-firstName" className="block text-xs font-medium text-navy/60 mb-1">First Name *</label>
                  <input
                    id="profile-firstName"
                    type="text"
                    value={form.firstName}
                    aria-invalid={fieldErrors.firstName ? true : undefined}
                    onChange={(e) => { setForm({ ...form, firstName: e.target.value }); if (fieldErrors.firstName) setFieldErrors({ ...fieldErrors, firstName: undefined }); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
                  />
                  {fieldErrors.firstName && <p role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="profile-lastName" className="block text-xs font-medium text-navy/60 mb-1">Last Name</label>
                  <input
                    id="profile-lastName"
                    type="text"
                    value={form.lastName}
                    aria-invalid={fieldErrors.lastName ? true : undefined}
                    onChange={(e) => { setForm({ ...form, lastName: e.target.value }); if (fieldErrors.lastName) setFieldErrors({ ...fieldErrors, lastName: undefined }); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
                  />
                  {fieldErrors.lastName && <p role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.lastName}</p>}
                </div>
                <div>
                  <label htmlFor="profile-email" className="block text-xs font-medium text-navy/60 mb-1">Email</label>
                  <input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    aria-invalid={fieldErrors.email ? true : undefined}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined }); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
                  />
                  {fieldErrors.email && <p role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.email}</p>}
                </div>
                <div>
                  <label htmlFor="profile-phone" className="block text-xs font-medium text-navy/60 mb-1">Phone</label>
                  <input
                    id="profile-phone"
                    type="tel"
                    value={form.phone}
                    aria-invalid={fieldErrors.phone ? true : undefined}
                    onChange={(e) => { setForm({ ...form, phone: e.target.value }); if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: undefined }); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
                  />
                  {fieldErrors.phone && <p role="alert" className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>}
                </div>
              </div>
              {fullName && <p className="text-xs text-navy/40">Displayed as: {fullName}</p>}
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 bg-gold text-white text-sm font-semibold rounded-lg hover:bg-gold-dark transition-colors disabled:opacity-60"
              >
                {savingProfile ? "Saving..." : "Save Changes"}
              </button>
            </form>
          )}
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="font-semibold text-navy mb-4">Change Password</h2>
          <form className="space-y-4 max-w-md" onSubmit={handleChangePassword}>
            {passwordError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{passwordError}</div>
            )}
            {passwordSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">{passwordSuccess}</div>
            )}
            <div>
              <label className="block text-xs font-medium text-navy/60 mb-1">Current Password</label>
              <input aria-label="Current Password"
                type="password"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 mb-1">New Password</label>
              <input aria-label="New Password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 mb-1">Confirm New Password</label>
              <input aria-label="Confirm New Password"
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="px-6 py-2.5 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-navy-light transition-colors disabled:opacity-60"
            >
              {savingPassword ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
