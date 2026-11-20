// ─── CaratFlow B2C Authentication Types & Schemas ──────────────
import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────

export enum SocialProviderEnum {
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  APPLE = 'APPLE',
}

export enum OtpPurposeEnum {
  LOGIN = 'LOGIN',
  REGISTRATION = 'REGISTRATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TRANSACTION_2FA = 'TRANSACTION_2FA',
}

export enum LoginProviderEnum {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  APPLE = 'APPLE',
}

// ─── Registration ─────────────────────────────────────────────

export const RegisterB2CEmailInputSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantSlug: z.string().min(1).max(100),
});
export type RegisterB2CEmailInput = z.infer<typeof RegisterB2CEmailInputSchema>;

export const RegisterB2CPhoneInputSchema = z.object({
  phone: z.string().min(10).max(20),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantSlug: z.string().min(1).max(100),
});
export type RegisterB2CPhoneInput = z.infer<typeof RegisterB2CPhoneInputSchema>;

// ─── Login ────────────────────────────────────────────────────

export const LoginB2CEmailInputSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  tenantSlug: z.string().min(1).max(100),
  twoFactorCode: z.string().length(6).optional(),
});
export type LoginB2CEmailInput = z.infer<typeof LoginB2CEmailInputSchema>;

export const LoginB2CPhoneInputSchema = z.object({
  phone: z.string().min(10).max(20),
  tenantSlug: z.string().min(1).max(100),
});
export type LoginB2CPhoneInput = z.infer<typeof LoginB2CPhoneInputSchema>;

// ─── OTP ──────────────────────────────────────────────────────

export const OtpRequestInputSchema = z.object({
  identifier: z.string().min(1).max(255),
  purpose: z.nativeEnum(OtpPurposeEnum),
});
export type OtpRequestInput = z.infer<typeof OtpRequestInputSchema>;

export const OtpVerifyInputSchema = z.object({
  identifier: z.string().min(1).max(255),
  otp: z.string().length(6),
  purpose: z.nativeEnum(OtpPurposeEnum),
  tenantSlug: z.string().min(1).max(100).optional(),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifyInputSchema>;

// ─── Social Login ─────────────────────────────────────────────

export const SocialLoginInputSchema = z.object({
  provider: z.nativeEnum(SocialProviderEnum),
  idToken: z.string().optional(),
  accessToken: z.string().optional(),
  tenantSlug: z.string().min(1).max(100),
}).refine(
  (data) => data.idToken || data.accessToken,
  { message: 'Either idToken or accessToken must be provided' },
);
export type SocialLoginInput = z.infer<typeof SocialLoginInputSchema>;

// ─── Two-Factor Auth ──────────────────────────────────────────

export const Enable2FAInputSchema = z.object({
  customerId: z.guid(),
});
export type Enable2FAInput = z.infer<typeof Enable2FAInputSchema>;

export const Verify2FAInputSchema = z.object({
  code: z.string().length(6),
});
export type Verify2FAInput = z.infer<typeof Verify2FAInputSchema>;

export const Disable2FAInputSchema = z.object({
  code: z.string().length(6),
});
export type Disable2FAInput = z.infer<typeof Disable2FAInputSchema>;

// ─── Refresh Token ────────────────────────────────────────────

export const B2CRefreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});
export type B2CRefreshInput = z.infer<typeof B2CRefreshInputSchema>;

// ─── Response Types ───────────────────────────────────────────

export interface B2CCustomerProfile {
  id: string;
  customerId: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  twoFactorEnabled: boolean;
  loginProvider: LoginProviderEnum;
  tenantId: string;
}

export interface B2CAuthResponse {
  customer: B2CCustomerProfile;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface B2CTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
}

// ─── B2C JWT Payload ──────────────────────────────────────────

export interface B2CJwtPayload {
  sub: string;           // customerAuthId
  customerId: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  type: 'b2c';
}

// ─── Staff password policy ────────────────────────────────────
// Single source of truth for staff/admin passwords (admin-created users,
// admin password reset, change-own-password): 10-128 characters with at least
// one uppercase letter, one lowercase letter, one digit and one symbol.

export const STAFF_PASSWORD_MIN_LENGTH = 10;
export const STAFF_PASSWORD_MAX_LENGTH = 128;
export const STAFF_PASSWORD_HINT =
  'At least 10 characters with an uppercase letter, a lowercase letter, a number and a symbol.';

/** Returns a list of human-readable policy violations (empty when valid). */
export function getStaffPasswordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < STAFF_PASSWORD_MIN_LENGTH) {
    issues.push(`Password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters`);
  }
  if (password.length > STAFF_PASSWORD_MAX_LENGTH) {
    issues.push(`Password must be at most ${STAFF_PASSWORD_MAX_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(password)) issues.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) issues.push('Password must contain at least one lowercase letter');
  if (!/\d/.test(password)) issues.push('Password must contain at least one number');
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('Password must contain at least one symbol');
  return issues;
}

export const StaffPasswordSchema = z
  .string()
  .max(STAFF_PASSWORD_MAX_LENGTH)
  .superRefine((value, ctx) => {
    for (const message of getStaffPasswordIssues(value)) {
      ctx.addIssue({ code: 'custom', message });
    }
  });
