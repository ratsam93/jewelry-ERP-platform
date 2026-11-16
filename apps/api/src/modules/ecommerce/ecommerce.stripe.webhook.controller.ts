// ─── Stripe Webhook Controller ────────────────────────────────
// Receives payment_intent.succeeded and charge.refunded callbacks.
// Verifies the Stripe-Signature header (t=<unix>,v1=<hex>) against the
// raw body with STRIPE_WEBHOOK_SECRET, rejecting timestamps outside a
// 5 minute tolerance, then dispatches to EcommercePaymentService.
//
// Stripe events carry no tenant, so the tenant is resolved from the
// OnlinePayment row whose externalPaymentId matches the payment intent.
//
// Fails closed: a missing secret or bad signature returns 401.
//
// Mounted at POST /api/v1/webhooks/stripe.

import {
  Controller,
  Post,
  Req,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import type { StripeWebhookPayload } from '@caratflow/shared-types';
import { PrismaService } from '../../common/prisma.service';
import { EcommercePaymentService } from './ecommerce.payment.service';
import { verifyStripeSignatureHeader } from './ecommerce.webhook-signature';

const HANDLED_EVENTS = new Set(['payment_intent.succeeded', 'charge.refunded']);

@Controller('api/v1/webhooks/stripe')
export class EcommerceStripeWebhookController {
  private readonly logger = new Logger(EcommerceStripeWebhookController.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly paymentService?: EcommercePaymentService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
    @Body() body: StripeWebhookPayload,
  ): Promise<{ received: true }> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured; rejecting webhook');
      throw new UnauthorizedException('Webhook not configured');
    }

    if (!req.rawBody || req.rawBody.length === 0) {
      throw new BadRequestException('Raw body unavailable for signature verification');
    }

    if (!verifyStripeSignatureHeader(req.rawBody, signature, secret)) {
      this.logger.warn('Stripe webhook signature verification failed');
      throw new UnauthorizedException('Invalid signature');
    }

    const eventType = body?.type;
    if (!eventType || !HANDLED_EVENTS.has(eventType)) {
      return { received: true };
    }

    try {
      const obj = (body.data?.object ?? {}) as Record<string, unknown>;
      const paymentRef =
        eventType === 'charge.refunded'
          ? (obj.payment_intent as string | undefined)
          : (obj.id as string | undefined);

      const payment =
        paymentRef && this.prisma
          ? await this.prisma.onlinePayment.findFirst({
              where: { externalPaymentId: paymentRef },
              select: { tenantId: true },
            })
          : null;

      if (!payment || !this.paymentService) {
        this.logger.warn(`Stripe ${eventType}: no matching payment for ref=${paymentRef ?? 'n/a'}`);
        return { received: true };
      }

      await this.paymentService.processStripeWebhook(payment.tenantId, body);
      this.logger.log(`Stripe ${eventType} processed (ref=${paymentRef})`);
    } catch (err) {
      // Verified payload: log and acknowledge so Stripe does not retry-storm.
      this.logger.error(
        `Stripe webhook handler error (event=${eventType}): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return { received: true };
  }
}
