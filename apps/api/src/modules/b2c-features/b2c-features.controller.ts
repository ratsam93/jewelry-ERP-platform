// ─── B2C Features REST Controller ───────────────────────────────
// Storefront-facing REST endpoints for wishlist, compare, coupon validation,
// and back-in-stock subscriptions.
//
// Customer-only routes use B2CAuthGuard (method level) and take tenant and
// customer from the verified token. Compare and anonymous back-in-stock
// subscriptions stay public and rely on tenantId from TenantMiddleware plus
// an optional sessionId.

import { UUID_RE, resolveCustomer } from '../../common/customer-identity';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { WishlistService } from './wishlist.service';
import { CompareService } from './compare.service';
import { CouponService } from './coupon.service';
import { BackInStockService } from './back-in-stock.service';

class SubscribeBackInStockDto {
  @IsUUID()
  productId!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;
}

@Controller('api/v1/store')
export class B2cFeaturesController {
  constructor(
    private readonly wishlistService: WishlistService,
    private readonly compareService: CompareService,
    private readonly couponService: CouponService,
    private readonly backInStockService: BackInStockService,
  ) {}

  // ─── Wishlist (customer) ──────────────────────────────────────
  // GET/POST wishlist, DELETE wishlist/:productId and POST wishlist/:productId/price-alert
  // are served by StorefrontController (the contract the storefront app calls).

  @Get('wishlist/count')
  @UseGuards(B2CAuthGuard)
  async getWishlistCount(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);
    const count = await this.wishlistService.getWishlistCount(tenantId, customerId);
    return { success: true, data: { count } };
  }

  @Delete('wishlist/:productId/price-alert')
  @UseGuards(B2CAuthGuard)
  async disablePriceAlert(
    @Req() req: Request,
    @Param('productId') productId: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    await this.wishlistService.disablePriceAlert(tenantId, customerId, productId);
    return { success: true };
  }

  // ─── Compare (guest or customer; sessionId identifies guests) ──

  @Get('compare')
  async getCompareList(
    @Req() req: Request,
    @Query('sessionId') sessionId?: string,
  ) {
    const ctx = this.publicContext(req);
    const list = await this.compareService.getCompareList(
      ctx.tenantId,
      ctx.customerId,
      this.sessionOf(req, sessionId),
    );
    return { success: true, data: list };
  }

  @Post('compare')
  @HttpCode(HttpStatus.CREATED)
  async addToCompare(
    @Req() req: Request,
    @Body() body: { productId: string; sessionId?: string },
  ) {
    const ctx = this.publicContext(req);
    const result = await this.compareService.addToCompare(
      ctx.tenantId,
      body.productId,
      ctx.customerId,
      this.sessionOf(req, body.sessionId),
    );
    return { success: true, data: result };
  }

  @Delete('compare/:productId')
  async removeFromCompare(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const ctx = this.publicContext(req);
    const result = await this.compareService.removeFromCompare(
      ctx.tenantId,
      productId,
      ctx.customerId,
      this.sessionOf(req, sessionId),
    );
    return { success: true, data: result };
  }

  @Delete('compare')
  async clearCompare(
    @Req() req: Request,
    @Query('sessionId') sessionId?: string,
  ) {
    const ctx = this.publicContext(req);
    await this.compareService.clearCompare(ctx.tenantId, ctx.customerId, this.sessionOf(req, sessionId));
    return { success: true };
  }

  // ─── Coupons (customer) ───────────────────────────────────────
  // POST coupons/validate is served by StorefrontController.

  @Post('coupons/auto-apply')
  @UseGuards(B2CAuthGuard)
  async getAutoApplyCoupon(
    @Req() req: Request,
    @Body() body: {
      cartTotalPaise: number;
      cartItems: Array<{
        productId: string;
        categoryId?: string;
        pricePaise: number;
        quantity: number;
      }>;
    },
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const result = await this.couponService.getAutoApplyCoupons(
      tenantId,
      customerId,
      body.cartTotalPaise,
      body.cartItems,
    );
    return { success: true, data: result };
  }

  // ─── Back In Stock ────────────────────────────────────────────

  /** Anonymous (email) or signed-in subscription; customerId is attached when present. */
  @Post('back-in-stock/subscribe')
  @HttpCode(HttpStatus.CREATED)
  async subscribeBackInStock(
    @Req() req: Request,
    @Body() body: SubscribeBackInStockDto,
  ) {
    const ctx = this.publicContext(req);
    const result = await this.backInStockService.subscribe(
      ctx.tenantId,
      body.productId,
      body.email,
      ctx.customerId,
    );
    return { success: true, data: result };
  }

  @Delete('back-in-stock/:alertId')
  async unsubscribeBackInStock(
    @Req() req: Request,
    @Param('alertId') alertId: string,
  ) {
    const ctx = this.publicContext(req);
    await this.backInStockService.unsubscribe(ctx.tenantId, alertId, ctx.customerId);
    return { success: true };
  }

  @Get('back-in-stock')
  @UseGuards(B2CAuthGuard)
  async getBackInStockSubscriptions(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);
    const items = await this.backInStockService.getSubscriptions(tenantId, customerId);
    return { success: true, data: items };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Tenant and customer from the B2C guard. Throws if either is missing. */
  private customerContext(req: Request): { tenantId: string; customerId: string } {
    const tenantId = req.b2cTenantId;
    const customerId = req.customerId;
    if (!tenantId || !customerId) {
      throw new UnauthorizedException('Customer authentication required');
    }
    return { tenantId, customerId };
  }

  /** Tenant for public routes, resolved by TenantMiddleware. */
  private publicTenantOf(req: Request): string {
    // Guest storefront requests carry a UUID-validated x-tenant-id header;
    // staff requests have the tenant set by TenantMiddleware.
    const header = req.headers['x-tenant-id'];
    const headerTenant = Array.isArray(header) ? header[0] : header;
    if (headerTenant) {
      if (!UUID_RE.test(headerTenant)) {
        throw new BadRequestException('Invalid tenant id');
      }
      return headerTenant;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }

  /**
   * Tenant and optional verified customer for public (guest or signed-in)
   * routes. The customer comes ONLY from a verified B2C Bearer token; the
   * x-customer-id header and request body are never trusted.
   */
  private publicContext(req: Request): { tenantId: string; customerId?: string } {
    if (req.headers.authorization) {
      try {
        const resolved = resolveCustomer(req);
        return { tenantId: resolved.tenantId, customerId: resolved.customerId };
      } catch {
        // Invalid/missing tenant header: fall through to the tenant resolution below.
      }
    }
    return { tenantId: this.publicTenantOf(req) };
  }

  /** Guest session id: explicit query/body value, else the x-session-id header. */
  private sessionOf(req: Request, explicit?: string): string | undefined {
    if (explicit) return explicit;
    const header = req.headers['x-session-id'];
    const value = Array.isArray(header) ? header[0] : header;
    return value || undefined;
  }
}
