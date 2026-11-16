// ─── AR REST Controller ───────────────────────────────────────
// Public-facing storefront API for AR try-on and 360 views.
// Consumed by the storefront website at /api/v1/store/ar/*

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { ApiResponse } from '@caratflow/shared-types';
import type {
  TryOnConfig,
  TryOnSessionResponse,
  Product360Config,
  ArProductListItem,
} from '@caratflow/shared-types';
import { ArTryOnService } from './ar.tryon.service';
import { Ar360Service } from './ar.360.service';
import { ArService } from './ar.service';
import { extractContext, type HeaderBearingRequest } from '../../common/customer-identity';

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

@Controller('api/v1/store/ar')
export class ArController {
  constructor(
    private readonly arService: ArService,
    private readonly tryOnService: ArTryOnService,
    private readonly ar360Service: Ar360Service,
  ) {}

  // ─── Try-On Endpoints ───────────────────────────────────────

  /**
   * GET /api/v1/store/ar/products/:productId/tryon
   * Get AR try-on configuration for a product.
   */
  @Get('products/:productId/tryon')
  async getTryOnConfig(
    @Param('productId') productId: string,
    @Req() req: HeaderBearingRequest,
  ): Promise<ApiResponse<TryOnConfig>> {
    const ctx = extractContext(req);
    const config = await this.tryOnService.getTryOnConfig(ctx.tenantId, productId);
    return success(config);
  }

  /**
   * GET /api/v1/store/ar/products/:productId/360
   * Get 360-degree view configuration for a product.
   */
  @Get('products/:productId/360')
  async get360Config(
    @Param('productId') productId: string,
    @Req() req: HeaderBearingRequest,
  ): Promise<ApiResponse<Product360Config | null>> {
    const ctx = extractContext(req);
    const config = await this.ar360Service.get360Config(ctx.tenantId, productId);
    return success(config);
  }

  /**
   * POST /api/v1/store/ar/sessions/start
   * Start a new try-on session.
   */
  @Post('sessions/start')
  @HttpCode(HttpStatus.CREATED)
  async startSession(
    @Body() body: { productId: string; deviceType: string },
    @Req() req: HeaderBearingRequest,
  ): Promise<ApiResponse<TryOnSessionResponse>> {
    const ctx = extractContext(req);
    const session = await this.tryOnService.startSession(ctx.tenantId, {
      productId: body.productId,
      customerId: ctx.customerId ?? undefined,
      deviceType: body.deviceType as TryOnSessionResponse['deviceType'],
    });
    return success(session);
  }

  /**
   * POST /api/v1/store/ar/sessions/:sessionId/end
   * End a try-on session with metrics.
   */
  @Post('sessions/:sessionId/end')
  @HttpCode(HttpStatus.OK)
  async endSession(
    @Param('sessionId') sessionId: string,
    @Body() body: {
      screenshotTaken?: boolean;
      sharedVia?: string;
      addedToCart?: boolean;
      duration: number;
    },
    @Req() req: HeaderBearingRequest,
  ): Promise<ApiResponse<TryOnSessionResponse>> {
    const ctx = extractContext(req);
    const session = await this.tryOnService.endSession(ctx.tenantId, {
      sessionId,
      screenshotTaken: body.screenshotTaken ?? false,
      sharedVia: body.sharedVia,
      addedToCart: body.addedToCart ?? false,
      duration: body.duration,
    });
    return success(session);
  }

  /**
   * GET /api/v1/store/ar/products
   * List products that have AR assets.
   */
  @Get('products')
  async getArProducts(
    @Query('category') category: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: HeaderBearingRequest,
  ): Promise<ApiResponse<ArProductListItem[]>> {
    const ctx = extractContext(req);
    const result = await this.arService.getProductsWithAr(
      ctx.tenantId,
      category,
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        sortOrder: 'desc',
      },
    );
    return {
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }
}
