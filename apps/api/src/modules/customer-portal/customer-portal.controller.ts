// ─── Customer Portal Controller ───────────────────────────────
// REST API for B2C "My Account" section. All endpoints require
// B2C customer JWT authentication via B2CAuthGuard.

import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
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
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { CustomerPortalProfileService } from './customer-portal.profile.service';
import { CustomerPortalOrdersService } from './customer-portal.orders.service';
import { CustomerPortalLoyaltyService } from './customer-portal.loyalty.service';
import { CustomerPortalSchemesService } from './customer-portal.schemes.service';
import { CustomerPortalKycService } from './customer-portal.kyc.service';
import { CustomerPortalDashboardService } from './customer-portal.dashboard.service';
import type { ApiResponse } from '@caratflow/shared-types';

// ─── DTO Classes ──────────────────────────────────────────────────

// Allowed values mirror the zod enums in @caratflow/shared-types (customer-portal.ts).
const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED',
  'CANCELLED', 'RETURNED', 'REFUNDED',
] as const;
const REFUND_METHODS = ['ORIGINAL_PAYMENT', 'STORE_CREDIT', 'BANK_TRANSFER'] as const;
const INSTALLMENT_PAYMENT_METHODS = ['UPI', 'BANK_TRANSFER', 'CARD'] as const;
const SCHEME_TYPES = ['KITTY', 'GOLD_SAVINGS'] as const;
const KYC_DOCUMENT_TYPES = ['AADHAAR', 'PAN', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENSE'] as const;

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  anniversary?: Date;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

class NotificationChannelsDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsapp?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

class NotificationPreferencesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  orders?: NotificationChannelsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  promotions?: NotificationChannelsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  schemes?: NotificationChannelsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  loyalty?: NotificationChannelsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  reminders?: NotificationChannelsDto;
}

/** Shared page/limit query params (query strings arrive as text). */
class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class OrderListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

class ReturnItemDto {
  @IsUUID()
  orderItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

class ReturnRequestDto {
  /** Also taken from the URL path; the controller overrides it with the path value. */
  @IsUUID()
  orderId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsIn(REFUND_METHODS)
  preferredRefundMethod!: 'ORIGINAL_PAYMENT' | 'STORE_CREDIT' | 'BANK_TRANSFER';
}

class RedeemPointsDto {
  @IsInt()
  @IsPositive()
  points!: number;

  @IsUUID()
  orderId!: string;
}

class PayInstallmentDto {
  @IsIn(INSTALLMENT_PAYMENT_METHODS)
  paymentMethod!: 'UPI' | 'BANK_TRANSFER' | 'CARD';
}

class EnrollSchemeDto {
  @IsUUID()
  schemeId!: string;

  @IsIn(SCHEME_TYPES)
  schemeType!: 'KITTY' | 'GOLD_SAVINGS';
}

class KycUploadDto {
  @IsIn(KYC_DOCUMENT_TYPES)
  documentType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentNumber!: string;

  @IsUrl()
  @MaxLength(500)
  fileUrl!: string;
}

// ─── Helper ───────────────────────────────────────────────────────

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// ─── Controller ───────────────────────────────────────────────────

@ApiTags('Customer Portal')
@ApiBearerAuth()
@UseGuards(B2CAuthGuard)
@Controller('api/v1/store/account')
export class CustomerPortalController {
  /** Tenant from the B2C guard. Throws if the guard context is missing. */
  private tenantOf(req: Request): string {
    if (!req.b2cTenantId) {
      throw new UnauthorizedException('Customer authentication required');
    }
    return req.b2cTenantId;
  }

  /** Customer from the B2C guard. Throws if the guard context is missing. */
  private customerOf(req: Request): string {
    if (!req.customerId) {
      throw new UnauthorizedException('Customer authentication required');
    }
    return req.customerId;
  }

  constructor(
    private readonly profileService: CustomerPortalProfileService,
    private readonly ordersService: CustomerPortalOrdersService,
    private readonly loyaltyService: CustomerPortalLoyaltyService,
    private readonly schemesService: CustomerPortalSchemesService,
    private readonly kycService: CustomerPortalKycService,
    private readonly dashboardService: CustomerPortalDashboardService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  @Get('dashboard')
  @ApiOperation({ summary: 'Get customer dashboard' })
  async getDashboard(@Req() req: Request) {
    const data = await this.dashboardService.getDashboard(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  // ═══════════════════════════════════════════════════════════════
  //  PROFILE
  // ═══════════════════════════════════════════════════════════════

  @Get('profile')
  @ApiOperation({ summary: 'Get customer profile' })
  async getProfile(@Req() req: Request) {
    const data = await this.profileService.getProfile(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update customer profile' })
  async updateProfile(@Req() req: Request, @Body() body: UpdateProfileDto) {
    const data = await this.profileService.updateProfile(
      this.tenantOf(req),
      this.customerOf(req),
      body,
    );
    return success(data);
  }

  @Put('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password' })
  async changePassword(@Req() req: Request, @Body() body: ChangePasswordDto) {
    await this.profileService.changePassword(
      this.tenantOf(req),
      this.customerOf(req),
      body,
    );
    return success({ message: 'Password changed successfully' });
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getNotificationPreferences(@Req() req: Request) {
    const data = await this.profileService.getNotificationPreferences(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  @Put('notifications')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updateNotificationPreferences(
    @Req() req: Request,
    @Body() body: NotificationPreferencesDto,
  ) {
    const data = await this.profileService.updateNotificationPreferences(
      this.tenantOf(req),
      this.customerOf(req),
      body as unknown as Parameters<typeof this.profileService.updateNotificationPreferences>[2],
    );
    return success(data);
  }

  @Delete('')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete account (soft delete)' })
  async deleteAccount(@Req() req: Request) {
    const data = await this.profileService.deleteAccount(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ORDERS
  // ═══════════════════════════════════════════════════════════════

  @Get('orders')
  @ApiOperation({ summary: 'List my orders' })
  async getMyOrders(@Req() req: Request, @Query() query: OrderListQueryDto) {
    const data = await this.ordersService.getMyOrders(
      this.tenantOf(req),
      this.customerOf(req),
      {
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 20,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder ?? 'desc',
        status: query.status as unknown as undefined,
        dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
        dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      },
    );
    return success(data);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get order detail' })
  async getOrderDetail(@Req() req: Request, @Param('id') orderId: string) {
    const data = await this.ordersService.getOrderDetail(
      this.tenantOf(req),
      this.customerOf(req),
      orderId,
    );
    return success(data);
  }

  @Get('orders/:id/tracking')
  @ApiOperation({ summary: 'Get live order tracking' })
  async getOrderTracking(@Req() req: Request, @Param('id') orderId: string) {
    const data = await this.ordersService.getOrderTrackingLive(
      this.tenantOf(req),
      this.customerOf(req),
      orderId,
    );
    return success(data);
  }

  @Get('orders/:id/invoice')
  @ApiOperation({ summary: 'Download order invoice' })
  async downloadInvoice(@Req() req: Request, @Param('id') orderId: string) {
    const data = await this.ordersService.downloadInvoice(
      this.tenantOf(req),
      this.customerOf(req),
      orderId,
    );
    return success(data);
  }

  @Post('orders/:id/return')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a return' })
  async requestReturn(
    @Req() req: Request,
    @Param('id') orderId: string,
    @Body() body: ReturnRequestDto,
  ) {
    const data = await this.ordersService.requestReturn(
      this.tenantOf(req),
      this.customerOf(req),
      { ...body, orderId },
    );
    return success(data);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order' })
  async cancelOrder(@Req() req: Request, @Param('id') orderId: string) {
    const data = await this.ordersService.cancelOrder(
      this.tenantOf(req),
      this.customerOf(req),
      orderId,
    );
    return success(data);
  }

  // ═══════════════════════════════════════════════════════════════
  //  LOYALTY
  // ═══════════════════════════════════════════════════════════════

  @Get('loyalty')
  @ApiOperation({ summary: 'Get loyalty dashboard' })
  async getLoyaltyDashboard(@Req() req: Request) {
    const data = await this.loyaltyService.getLoyaltyDashboard(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  @Get('loyalty/history')
  @ApiOperation({ summary: 'Get loyalty points history' })
  async getPointsHistory(@Req() req: Request, @Query() query: PaginationQueryDto) {
    const data = await this.loyaltyService.getPointsHistory(
      this.tenantOf(req),
      this.customerOf(req),
      { page: query.page ? Number(query.page) : undefined, limit: query.limit ? Number(query.limit) : undefined },
    );
    return success(data);
  }

  @Post('loyalty/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem loyalty points' })
  async redeemPoints(@Req() req: Request, @Body() body: RedeemPointsDto) {
    const data = await this.loyaltyService.redeemPoints(
      this.tenantOf(req),
      this.customerOf(req),
      body.points,
      body.orderId,
    );
    return success(data);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCHEMES
  // ═══════════════════════════════════════════════════════════════

  @Get('schemes')
  @ApiOperation({ summary: 'Get my schemes' })
  async getMySchemes(@Req() req: Request) {
    const data = await this.schemesService.getMySchemes(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  @Get('schemes/:id')
  @ApiOperation({ summary: 'Get scheme detail' })
  async getSchemeDetail(@Req() req: Request, @Param('id') membershipId: string) {
    const data = await this.schemesService.getSchemeDetail(
      this.tenantOf(req),
      this.customerOf(req),
      membershipId,
    );
    return success(data);
  }

  @Post('schemes/:id/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pay scheme installment' })
  async payInstallment(
    @Req() req: Request,
    @Param('id') membershipId: string,
    @Body() body: PayInstallmentDto,
  ) {
    const data = await this.schemesService.payInstallment(
      this.tenantOf(req),
      this.customerOf(req),
      membershipId,
      body.paymentMethod,
    );
    return success(data);
  }

  @Post('schemes/enroll')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enroll in a scheme' })
  async enrollInScheme(@Req() req: Request, @Body() body: EnrollSchemeDto) {
    const data = await this.schemesService.enrollInScheme(
      this.tenantOf(req),
      this.customerOf(req),
      body,
    );
    return success(data);
  }

  // ═══════════════════════════════════════════════════════════════
  //  KYC
  // ═══════════════════════════════════════════════════════════════

  @Get('kyc')
  @ApiOperation({ summary: 'Get KYC status' })
  async getKycStatus(@Req() req: Request) {
    const data = await this.kycService.getKycStatus(
      this.tenantOf(req),
      this.customerOf(req),
    );
    return success(data);
  }

  @Post('kyc/upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload KYC document' })
  async uploadKycDocument(@Req() req: Request, @Body() body: KycUploadDto) {
    const data = await this.kycService.uploadDocument(
      this.tenantOf(req),
      this.customerOf(req),
      body as unknown as Parameters<typeof this.kycService.uploadDocument>[2],
    );
    return success(data);
  }
}
