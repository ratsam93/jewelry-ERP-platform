import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../common/prisma.service';
import type { OtpPurpose } from '@caratflow/db';
import { SmsService } from '../modules/crm/sms.service';
import { EmailService } from '../modules/crm/email.service';
import { WhatsAppService } from '../modules/crm/whatsapp.service';
import { BRAND_NAME } from '../common/brand';

type OtpChannel = 'SMS' | 'EMAIL' | 'WHATSAPP';

export interface OtpSendResult {
  message: string;
  /** True only when a provider accepted the message. */
  delivered: boolean;
  channel: OtpChannel;
  /** Only present when ALLOW_DEV_OTP=true. */
  otp?: string;
}

export interface AuthCapabilities {
  phoneOtp: boolean;
  emailVerification: boolean;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  /** OTP validity duration in minutes */
  private readonly OTP_EXPIRY_MINUTES = 5;

  constructor(
    private readonly prisma: PrismaService,
    // These are optional so tests (and any partial wiring) continue to work.
    // When unset, we fall back to logging the OTP to stdout.
    @Optional() private readonly smsService?: SmsService,
    @Optional() private readonly emailService?: EmailService,
    @Optional() private readonly whatsappService?: WhatsAppService,
  ) {}

  /**
   * Generate a 6-digit OTP, store it, and trigger delivery.
   * Returns the OTP only when ALLOW_DEV_OTP=true; otherwise it is only dispatched via SMS/email/WhatsApp.
   */
  async generateOtp(
    identifier: string,
    purpose: OtpPurpose,
    tenantId?: string,
  ): Promise<OtpSendResult> {
    // Invalidate any existing unexpired OTPs for this identifier + purpose
    await this.prisma.otpVerification.updateMany({
      where: {
        identifier,
        purpose,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() }, // expire them immediately
    });

    const otpCode = this.generateSecureOtp();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    await this.prisma.otpVerification.create({
      data: {
        id: uuid(),
        identifier,
        otpCode,
        purpose,
        expiresAt,
      },
    });

    // Real provider dispatch (best-effort; never throws into the login flow)
    const { delivered, channel } = await this.sendOtp(identifier, otpCode, tenantId);

    // The OTP is returned to the caller only when ALLOW_DEV_OTP=true (default off).
    // This is deliberately not keyed off NODE_ENV.
    const allowDevOtp = process.env.ALLOW_DEV_OTP === 'true';
    return {
      message: delivered
        ? 'OTP sent successfully'
        : channel === 'EMAIL'
          ? 'We could not send an email right now.'
          : 'We could not send an SMS right now.',
      delivered,
      channel,
      ...(allowDevOtp ? { otp: otpCode } : {}),
    };
  }

  /**
   * Verify an OTP. Returns true if valid, throws on failure.
   */
  async verifyOtp(
    identifier: string,
    otp: string,
    purpose: OtpPurpose,
  ): Promise<boolean> {
    const record = await this.prisma.otpVerification.findFirst({
      where: {
        identifier,
        purpose,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('No valid OTP found. Please request a new one.');
    }

    // Check max attempts
    if (record.attempts >= record.maxAttempts) {
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
    }

    // Increment attempts
    await this.prisma.otpVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });

    if (record.otpCode !== otp) {
      const remaining = record.maxAttempts - record.attempts - 1;
      throw new BadRequestException(
        `Invalid OTP. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'No attempts remaining. Please request a new OTP.'}`,
      );
    }

    // Mark as verified
    await this.prisma.otpVerification.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });

    return true;
  }

  /**
   * Cleanup expired OTP records. Called via BullMQ cron.
   */
  async cleanupExpiredOtps(): Promise<number> {
    const result = await this.prisma.otpVerification.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { verifiedAt: { not: null } },
        ],
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired/verified OTP records`);
    return result.count;
  }

  // ─── Private Helpers ─────────────────────────────────────────

  private generateSecureOtp(): string {
    // Generate a cryptographically random 6-digit OTP
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const otp = (array[0]! % 900000) + 100000;
    return otp.toString();
  }

  private pickChannel(identifier: string): OtpChannel {
    const envChannel = (process.env.OTP_CHANNEL ?? '').toUpperCase() as OtpChannel;
    if (envChannel === 'SMS' || envChannel === 'EMAIL' || envChannel === 'WHATSAPP') {
      // If env says EMAIL but identifier is a phone, fall back to SMS
      if (envChannel === 'EMAIL' && !identifier.includes('@')) return 'SMS';
      if ((envChannel === 'SMS' || envChannel === 'WHATSAPP') && identifier.includes('@')) return 'EMAIL';
      return envChannel;
    }
    return identifier.includes('@') ? 'EMAIL' : 'SMS';
  }

  private async resolveTenantId(explicitTenantId?: string): Promise<string | null> {
    if (explicitTenantId) return explicitTenantId;
    // Fall back to the first active tenant — OTP dispatch requires a tenant
    // for provider config. In single-tenant/dev setups this is fine; in
    // multi-tenant installs the caller should pass tenantId.
    const tenant = await this.prisma.tenant.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    return tenant?.id ?? null;
  }

  /**
   * Which delivery features are actually usable on this deployment. Used by the
   * storefront to hide phone-OTP login when no SMS/WhatsApp provider exists.
   */
  async getCapabilities(tenantId?: string): Promise<AuthCapabilities> {
    const resolved = await this.resolveTenantId(tenantId).catch(() => null);
    if (!resolved) return { phoneOtp: false, emailVerification: false };
    const phoneChannel = this.pickChannel('+910000000000');
    const phoneProvider = phoneChannel === 'WHATSAPP' ? this.whatsappService : this.smsService;
    const [phoneOtp, emailVerification] = await Promise.all([
      phoneProvider ? phoneProvider.isConfigured(resolved).catch(() => false) : false,
      this.emailService ? this.emailService.isConfigured(resolved).catch(() => false) : false,
    ]);
    return { phoneOtp, emailVerification };
  }

  private async sendOtp(
    identifier: string,
    otpCode: string,
    tenantId?: string,
  ): Promise<{ delivered: boolean; channel: OtpChannel }> {
    const channel = this.pickChannel(identifier);
    const resolvedTenant = await this.resolveTenantId(tenantId).catch(() => null);

    if (!resolvedTenant) {
      this.logger.warn(
        `[OTP] No tenant context available - not delivered for ${this.redact(identifier)}`,
      );
      return { delivered: false, channel };
    }

    const message = `Your ${BRAND_NAME} verification code is ${otpCode}. It expires in ${this.OTP_EXPIRY_MINUTES} minutes.`;

    try {
      if (channel === 'EMAIL') {
        if (!this.emailService) {
          this.logger.warn('[OTP] EmailService not injected - skipping dispatch');
          return { delivered: false, channel };
        }
        await this.emailService.sendEmail(resolvedTenant, {
          to: identifier,
          subject: `Your ${BRAND_NAME} verification code`,
          text: message,
          html: `<p>${message}</p>`,
        });
        this.logger.log(`OTP email dispatched to ${this.redact(identifier)}`);
        return { delivered: true, channel };
      }

      if (channel === 'WHATSAPP') {
        if (!this.whatsappService) {
          this.logger.warn('[OTP] WhatsAppService not injected - skipping dispatch');
          return { delivered: false, channel };
        }
        await this.whatsappService.sendTextMessage(resolvedTenant, identifier, message);
        this.logger.log(`OTP WhatsApp dispatched to ${this.redact(identifier)}`);
        return { delivered: true, channel };
      }

      // Default: SMS
      if (!this.smsService) {
        this.logger.warn('[OTP] SmsService not injected - skipping dispatch');
        return { delivered: false, channel };
      }
      await this.smsService.sendSms(resolvedTenant, { to: identifier, body: message });
      this.logger.log(`OTP SMS dispatched to ${this.redact(identifier)}`);
      return { delivered: true, channel };
    } catch (err) {
      // Never block the flow on provider failure; report delivered=false.
      // Provider details are logged server-side only, never returned.
      this.logger.error(
        `[OTP] Provider dispatch failed for ${this.redact(identifier)} via ${channel}: ${(err as Error).message}`,
      );
      return { delivered: false, channel };
    }
  }

  /** Redact identifier in logs to avoid leaking PII. */
  private redact(identifier: string): string {
    if (identifier.includes('@')) {
      const [local, domain] = identifier.split('@');
      if (!local || !domain) return '***';
      const keep = local.slice(0, 2);
      return `${keep}***@${domain}`;
    }
    if (identifier.length <= 4) return '***';
    return `${identifier.slice(0, 3)}***${identifier.slice(-2)}`;
  }
}
