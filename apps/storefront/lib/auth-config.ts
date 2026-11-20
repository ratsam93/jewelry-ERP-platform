// Auth feature switches and server capabilities for the storefront.
import { AUTH_API } from "@/lib/constants";

/**
 * Build-time switch (NEXT_PUBLIC_REQUIRE_PHONE_OTP, default "false"). When "true",
 * registration with a phone number goes through the OTP verify step. Otherwise
 * phone verification never blocks sign-up. Read at call time so tests can toggle it.
 */
export function requirePhoneOtp(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_PHONE_OTP === "true";
}

export interface AuthCapabilities {
  phoneOtp: boolean;
  emailVerification: boolean;
}

let capabilitiesPromise: Promise<AuthCapabilities | null> | null = null;

/** Reads GET /b2c/auth/capabilities once per page load. Resolves null when unknown. */
export function fetchAuthCapabilities(): Promise<AuthCapabilities | null> {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      try {
        const res = await fetch(`${AUTH_API}/capabilities`);
        if (!res || !res.ok) return null;
        const body = await res.json();
        const d = body?.data;
        if (!d || typeof d.phoneOtp !== "boolean") return null;
        return { phoneOtp: d.phoneOtp, emailVerification: !!d.emailVerification };
      } catch {
        return null;
      }
    })();
  }
  return capabilitiesPromise;
}

/** Test helper. */
export function resetAuthCapabilitiesCache(): void {
  capabilitiesPromise = null;
}

// ─── One-shot notice shown after navigation (e.g. after sign-up) ──────────────

const FLASH_KEY = "cf_flash_notice";

export function setFlashNotice(message: string): void {
  try {
    window.sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    /* storage unavailable: the notice is optional */
  }
}

export function takeFlashNotice(): string | null {
  try {
    const v = window.sessionStorage.getItem(FLASH_KEY);
    if (v) window.sessionStorage.removeItem(FLASH_KEY);
    return v;
  } catch {
    return null;
  }
}

export const ACCOUNT_CREATED_NOTICE = "Account created. You can verify your phone later from your profile.";
