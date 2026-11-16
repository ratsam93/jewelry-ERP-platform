// ─── Shopify Webhook Controller ───────────────────────────────
// Receives orders/* webhooks from Shopify. Shopify is not
// tenant-scoped on the wire, so the tenant is resolved from the
// X-Shopify-Shop-Domain header against SalesChannel rows of type
// SHOPIFY. The header is only used to pick the channel: the body is
// trusted only after X-Shopify-Hmac-Sha256 (base64 HMAC-SHA256 of the
// raw body) verifies against that channel's webhook secret, falling
// back to the SHOPIFY_WEBHOOK_SECRET env var.
//
// Fails closed: an unknown shop, a missing secret or a bad signature
// all return 401. Once verified, handler errors are logged and 200 is
// returned so Shopify does not retry-storm.
//
// Mounted at POST /api/v1/webhooks/shopify.

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
import type { ShopifyWebhookPayload } from '@caratflow/shared-types';
import { PrismaService } from '../../common/prisma.service';
import { EcommerceShopifyService } from './ecommerce.shopify.service';
import {
  verifyShopifyHmac,
  normalizeShopifyShopDomain,
} from './ecommerce.webhook-signature';

@Controller('api/v1/webhooks/shopify')
export class EcommerceShopifyWebhookController {
  private readonly logger = new Logger(EcommerceShopifyWebhookController.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly shopifyService?: EcommerceShopifyService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-shopify-hmac-sha256') hmac: string | undefined,
    @Headers('x-shopify-shop-domain') shopDomain: string | undefined,
    @Headers('x-shopify-topic') topic: string | undefined,
    @Body() body: ShopifyWebhookPayload,
  ): Promise<{ success: true }> {
    if (!req.rawBody || req.rawBody.length === 0) {
      throw new BadRequestException('Raw body unavailable for signature verification');
    }

    const shop = normalizeShopifyShopDomain(shopDomain);
    if (!shop) {
      throw new UnauthorizedException('Missing or invalid shop domain');
    }

    const channel = await this.findShopifyChannel(shop);
    if (!channel) {
      this.logger.warn(`Shopify webhook for unknown shop: ${shop}`);
      throw new UnauthorizedException('Unknown shop');
    }

    const secret = channel.webhookSecret ?? process.env.SHOPIFY_WEBHOOK_SECRET ?? null;
    if (!secret) {
      this.logger.error(`Shopify webhook secret not configured for channel ${channel.id}; rejecting`);
      throw new UnauthorizedException('Webhook not configured');
    }

    if (!verifyShopifyHmac(req.rawBody, hmac, secret)) {
      this.logger.warn(`Shopify webhook signature verification failed (shop=${shop})`);
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.log(`Shopify webhook received: topic=${topic ?? 'n/a'}, shop=${shop}`);

    try {
      if (topic?.startsWith('orders/') && this.shopifyService) {
        await this.shopifyService.processOrderWebhook(channel.tenantId, channel.id, body);
      }
    } catch (err) {
      this.logger.error(
        `Shopify webhook handler error (topic=${topic}): ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return { success: true };
  }

  /**
   * Find the active SHOPIFY channel whose store host matches the shop
   * subdomain. storeUrl may be "https://x.myshopify.com" or a custom
   * domain whose first label is the shop name; only exact matches on
   * the normalized shop name are accepted.
   */
  private async findShopifyChannel(
    shop: string,
  ): Promise<{ id: string; tenantId: string; webhookSecret: string | null } | null> {
    if (!this.prisma) return null;
    const candidates = await this.prisma.salesChannel.findMany({
      where: {
        channelType: 'SHOPIFY',
        isActive: true,
        storeUrl: { contains: shop },
      },
      select: { id: true, tenantId: true, webhookSecret: true, storeUrl: true },
    });
    const match = candidates.find(
      (c) => c.storeUrl && normalizeShopifyShopDomain(c.storeUrl) === shop,
    );
    return match ? { id: match.id, tenantId: match.tenantId, webhookSecret: match.webhookSecret } : null;
  }
}
