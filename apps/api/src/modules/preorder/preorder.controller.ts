// ─── Pre-Order REST Controller ────────────────────────────────
// Storefront REST API. Customer routes are guarded by B2CAuthGuard and
// take tenant and customer from the verified token. The product
// pre-order status endpoint is public.
// POST /api/v1/store/preorder
// GET  /api/v1/store/preorder/my
// GET  /api/v1/store/products/:id/preorder-status (public)
// POST /api/v1/store/orders/:id/modify
// GET  /api/v1/store/orders/:id/modifications
// POST /api/v1/store/reorder/:orderId
// GET  /api/v1/store/reorder/history

import { UUID_RE } from '../../common/customer-identity';
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { PreOrderService } from './preorder.service';
import { OrderModificationService } from './order-modification.service';
import { ReorderService } from './reorder.service';
import type { CreatePreOrderInput, RequestModificationInput } from '@caratflow/shared-types';

@ApiTags('store-preorder')
@Controller('api/v1/store')
export class PreOrderController {
  constructor(
    private readonly preOrderService: PreOrderService,
    private readonly modificationService: OrderModificationService,
    private readonly reorderService: ReorderService,
  ) {}

  // ─── Pre-Orders ───────────────────────────────────────────────

  @Post('preorder')
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a pre-order for a product' })
  async createPreOrder(
    @Req() req: Request,
    @Body() body: CreatePreOrderInput,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.preOrderService.createPreOrder(
      tenantId,
      req.customerAuthId ?? customerId,
      { ...body, customerId },
    );
    return { success: true, data };
  }

  @Get('preorder/my')
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my pre-orders' })
  async getMyPreOrders(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.preOrderService.getMyPreOrders(tenantId, customerId, {
      page: parseInt(page ?? '1', 10),
      limit: parseInt(limit ?? '20', 10),
      sortOrder: 'desc',
    });
    return { success: true, data };
  }

  @Get('products/:id/preorder-status')
  @ApiOperation({ summary: 'Check pre-order availability for a product' })
  async getProductPreOrderStatus(
    @Req() req: Request,
    @Param('id') productId: string,
  ) {
    const tenantId = this.publicTenantOf(req);
    const data = await this.preOrderService.checkProductPreOrderStatus(tenantId, productId);
    return { success: true, data };
  }

  // ─── Order Modifications ──────────────────────────────────────

  @Post('orders/:id/modify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request an order modification' })
  async requestModification(
    @Req() req: Request,
    @Param('id') orderId: string,
    @Body() body: Omit<RequestModificationInput, 'orderId' | 'customerId'>,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.modificationService.requestModification(
      tenantId,
      req.customerAuthId ?? customerId,
      {
        orderId,
        customerId,
        modificationType: body.modificationType,
        requestedData: body.requestedData,
        reason: body.reason,
      },
    );
    return { success: true, data };
  }

  @Get('orders/:id/modifications')
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get modification requests for an order' })
  async getOrderModifications(
    @Req() req: Request,
    @Param('id') orderId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.modificationService.getModificationRequests(
      tenantId,
      { orderId, customerId },
      {
        page: parseInt(page ?? '1', 10),
        limit: parseInt(limit ?? '20', 10),
        sortOrder: 'desc',
      },
    );
    return { success: true, data };
  }

  // ─── Reorder ──────────────────────────────────────────────────

  @Post('reorder/:orderId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One-click reorder from a previous order' })
  async reorder(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Query('templateId') templateId?: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.reorderService.reorder(tenantId, customerId, orderId, templateId);
    return { success: true, data };
  }

  @Get('reorder/history')
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get past orders that can be reordered' })
  async getReorderableOrders(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.reorderService.getReorderableOrders(tenantId, customerId, {
      page: parseInt(page ?? '1', 10),
      limit: parseInt(limit ?? '20', 10),
      sortOrder: 'desc',
    });
    return { success: true, data };
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

  /**
   * Tenant for public (guest-accessible) routes: a UUID-validated x-tenant-id header,
   * or the tenant from a staff token resolved by TenantMiddleware.
   */
  private publicTenantOf(req: Request): string {
    const header = req.headers['x-tenant-id'];
    const headerTenant = Array.isArray(header) ? header[0] : header;
    if (headerTenant && UUID_RE.test(headerTenant)) {
      return headerTenant;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId;
  }
}
