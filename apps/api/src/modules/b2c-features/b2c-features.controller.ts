// ─── B2C Features REST Controller ───────────────────────────────
// Storefront-facing REST endpoints for wishlist, compare, coupon validation,
// and back-in-stock subscriptions.
//
// Customer-only routes use B2CAuthGuard (method level) and take tenant and
// customer from the verified token. Compare and anonymous back-in-stock
// subscriptions stay public and rely on tenantId from TenantMiddleware plus
// an optional sessionId.

import { UUID_RE } from '../../common/customer-identity';
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
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { WishlistService } from './wishlist.service';
import { CompareService } from './compare.service';
import { CouponService } from './coupon.service';
import { BackInStockService } from './back-in-stock.service';

@Controller('api/v1/store')
export class B2cFeaturesController {
  constructor(
    private readonly wishlistService: WishlistService,
    private readonly compareService: CompareService,
    private readonly couponService: CouponService,
    private readonly backInStockService: BackInStockService,
  ) {}

  // ─── Wishlist (customer) ──────────────────────────────────────

  @Get('wishlist')
  @UseGuards(B2CAuthGuard)
  async getWishlist(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);
    const items = await this.wishlistService.getWishlist(tenantId, customerId);
    return { success: true, data: items };
  }

  @Get('wishlist/count')
  @UseGuards(B2CAuthGuard)
  async getWishlistCount(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);
    const count = await this.wishlistService.getWishlistCount(tenantId, customerId);
    return { success: true, data: { count } };
  }

  @Post('wishlist')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(B2CAuthGuard)
  async addToWishlist(
    @Req() req: Request,
    @Body() body: { productId: string },
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const item = await this.wishlistService.addToWishlist(tenantId, customerId, body.productId);
    return { success: true, data: item };
  }

  @Delete('wishlist/:productId')
  @UseGuards(B2CAuthGuard)
  async removeFromWishlist(
    @Req() req: Request,
    @Param('productId') productId: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    await this.wishlistService.removeFromWishlist(tenantId, customerId, productId);
    return { success: true };
  }

  @Post('wishlist/:productId/price-alert')
  @UseGuards(B2CAuthGuard)
  async enablePriceAlert(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Body() body: { thresholdPaise: number },
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const result = await this.wishlistService.enablePriceAlert(
      tenantId,
      customerId,
      productId,
      body.thresholdPaise,
    );
    return { success: true, data: result };
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
    const list = await this.compareService.getCompareList(
      this.publicTenantOf(req),
      req.customerId,
      sessionId,
    );
    return { success: true, data: list };
  }

  @Post('compare')
  @HttpCode(HttpStatus.CREATED)
  async addToCompare(
    @Req() req: Request,
    @Body() body: { productId: string; sessionId?: string },
  ) {
    const result = await this.compareService.addToCompare(
      this.publicTenantOf(req),
      body.productId,
      req.customerId,
      body.sessionId,
    );
    return { success: true, data: result };
  }

  @Delete('compare/:productId')
  async removeFromCompare(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const result = await this.compareService.removeFromCompare(
      this.publicTenantOf(req),
      productId,
      req.customerId,
      sessionId,
    );
    return { success: true, data: result };
  }

  @Delete('compare')
  async clearCompare(
    @Req() req: Request,
    @Query('sessionId') sessionId?: string,
  ) {
    await this.compareService.clearCompare(this.publicTenantOf(req), req.customerId, sessionId);
    return { success: true };
  }

  // ─── Coupons (customer) ───────────────────────────────────────

  @Post('coupons/validate')
  @UseGuards(B2CAuthGuard)
  async validateCoupon(
    @Req() req: Request,
    @Body() body: {
      code: string;
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
    if (typeof body.code !== 'string' || body.code.trim() === '') {
      throw new BadRequestException('code is required');
    }
    const result = await this.couponService.validateCoupon(tenantId, customerId, {
      code: body.code.trim().toUpperCase(),
      cartTotalPaise: body.cartTotalPaise,
      cartItems: body.cartItems,
    });
    return { success: true, data: result };
  }

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
    @Body() body: { productId: string; email: string },
  ) {
    const result = await this.backInStockService.subscribe(
      this.publicTenantOf(req),
      body.productId,
      body.email,
      req.customerId,
    );
    return { success: true, data: result };
  }

  @Delete('back-in-stock/:alertId')
  async unsubscribeBackInStock(
    @Req() req: Request,
    @Param('alertId') alertId: string,
  ) {
    await this.backInStockService.unsubscribe(this.publicTenantOf(req), alertId, req.customerId);
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
    if (headerTenant && UUID_RE.test(headerTenant)) {
      return headerTenant;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }
}
