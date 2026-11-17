// ─── Digital Gold REST Controller ──────────────────────────────
// B2C facing API endpoints under /api/v1/store/digital-gold/*
// All endpoints require authenticated customer context.

import {
  Controller,
  Get,
  Post,
  Put,
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
import type { Request } from 'express';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  IsDateString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ZodType } from 'zod';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { StaffAuthGuard } from '../../common/staff-auth.guard';
import { DigitalGoldService } from './digital-gold.service';
import { DigitalGoldSipService } from './digital-gold.sip.service';
import { DigitalGoldRedemptionService } from './digital-gold.redemption.service';
import { DigitalGoldAlertService } from './digital-gold.alert.service';
import { IndiaRatesService } from '../india/india.rates.service';
import type { ApiResponse } from '@caratflow/shared-types';
import {
  BuyGoldInputSchema,
  SellGoldInputSchema,
  CreateSipInputSchema,
  RedeemGoldInputSchema,
  GoldPriceAlertInputSchema,
  GoldTransactionListInputSchema,
  GoldRedemptionType,
  GoldSipType,
  GoldSipFrequency,
  GoldPriceAlertType,
} from '@caratflow/shared-types';
import type {
  BuyGoldResponse,
  SellGoldResponse,
  GoldVaultResponse,
  GoldPortfolioResponse,
  GoldTransactionResponse,
  SipResponse,
  SipExecutionResponse,
  RedeemGoldResponse,
  GoldPriceAlertResponse,
  DigitalGoldDashboardResponse,
} from '@caratflow/shared-types';

const PAYMENT_METHODS = [
  'UPI',
  'NET_BANKING',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'WALLET',
  'AUTO_DEBIT',
];

// ─── Request DTOs (class-validator; the global ValidationPipe is
// whitelist + forbidNonWhitelisted, so every property is decorated) ──

export class BuyGoldDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  amountPaise?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weightMg?: number;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: string;
}

export class SellGoldDto {
  @IsInt()
  @IsPositive()
  weightMg!: number;
}

export class CreateSipDto {
  @IsEnum(GoldSipType)
  sipType!: GoldSipType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  amountPaise?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weightMg?: number;

  @IsEnum(GoldSipFrequency)
  frequency!: GoldSipFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  autoDebitReference?: string;
}

export class RedeemGoldDto {
  @IsEnum(GoldRedemptionType)
  redemptionType!: GoldRedemptionType;

  @IsOptional()
  @IsInt()
  @IsPositive()
  weightMg?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressId!: string;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class GoldPriceAlertDto {
  @IsEnum(GoldPriceAlertType)
  alertType!: GoldPriceAlertType;

  @IsInt()
  @IsPositive()
  targetPricePer10gPaise!: number;
}

/**
 * Apply the shared zod schema (cross-field rules such as "provide exactly
 * one of amountPaise / weightMg") on top of the DTO check; failures are 400s.
 */
function parseOrBadRequest<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((i) => i.message).join('; ') || 'Invalid request',
    );
  }
  return result.data;
}

/**
 * Customer + tenant identity, taken ONLY from the values B2CAuthGuard set
 * from the verified customer JWT. Never from headers or body.
 */
function customerScope(req: Request): { tenantId: string; customerId: string } {
  const tenantId = req.b2cTenantId;
  const customerId = req.customerId;
  if (!tenantId || !customerId) {
    throw new UnauthorizedException('Customer authentication required');
  }
  return { tenantId, customerId };
}

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// Customer-scoped routes are guarded by B2CAuthGuard (customer JWT only; staff
// and anonymous callers get 401). Rates are global market data and stay public;
// the dashboard is staff-only.
@Controller('api/v1/store/digital-gold')
export class DigitalGoldController {
  constructor(
    private readonly digitalGoldService: DigitalGoldService,
    private readonly sipService: DigitalGoldSipService,
    private readonly redemptionService: DigitalGoldRedemptionService,
    private readonly alertService: DigitalGoldAlertService,
    private readonly ratesService: IndiaRatesService,
  ) {}

  // ─── Buy / Sell ─────────────────────────────────────────────

  @Post('buy')
  @UseGuards(B2CAuthGuard)
  @HttpCode(HttpStatus.OK)
  async buyGold(
    @Req() req: Request,
    @Body() dto: BuyGoldDto,
  ): Promise<ApiResponse<BuyGoldResponse>> {
    const { tenantId, customerId } = customerScope(req);
    const input = parseOrBadRequest(BuyGoldInputSchema, dto);
    return success(await this.digitalGoldService.buyGold(tenantId, customerId, input));
  }

  @Post('sell')
  @UseGuards(B2CAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sellGold(
    @Req() req: Request,
    @Body() dto: SellGoldDto,
  ): Promise<ApiResponse<SellGoldResponse>> {
    const { tenantId, customerId } = customerScope(req);
    const input = parseOrBadRequest(SellGoldInputSchema, dto);
    return success(await this.digitalGoldService.sellGold(tenantId, customerId, input));
  }

  // ─── Vault / Portfolio ──────────────────────────────────────

  @Get('vault')
  @UseGuards(B2CAuthGuard)
  async getVault(@Req() req: Request): Promise<ApiResponse<GoldVaultResponse>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.digitalGoldService.getVault(tenantId, customerId));
  }

  @Get('portfolio')
  @UseGuards(B2CAuthGuard)
  async getPortfolio(@Req() req: Request): Promise<ApiResponse<GoldPortfolioResponse>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.digitalGoldService.getPortfolio(tenantId, customerId));
  }

  // ─── Transactions ───────────────────────────────────────────

  @Get('transactions')
  @UseGuards(B2CAuthGuard)
  async getTransactions(
    @Req() req: Request,
    @Query() query: Record<string, unknown>,
  ): Promise<ApiResponse<GoldTransactionResponse[]>> {
    const { tenantId, customerId } = customerScope(req);
    // Query-string values arrive as strings: coerce the numeric ones first.
    const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
    const input = parseOrBadRequest(GoldTransactionListInputSchema, {
      page: num(query.page),
      limit: num(query.limit),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      transactionType: query.transactionType,
      status: query.status,
      dateRange: query.dateRange,
    });
    const result = await this.digitalGoldService.getTransactionHistory(
      tenantId,
      customerId,
      input,
    );
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: result.page, totalPages: result.totalPages },
    };
  }

  // ─── SIP ────────────────────────────────────────────────────

  @Post('sip')
  @UseGuards(B2CAuthGuard)
  async createSip(
    @Req() req: Request,
    @Body() dto: CreateSipDto,
  ): Promise<ApiResponse<SipResponse>> {
    const { tenantId, customerId } = customerScope(req);
    const input = parseOrBadRequest(CreateSipInputSchema, dto);
    return success(await this.sipService.createSip(tenantId, customerId, input));
  }

  @Get('sip')
  @UseGuards(B2CAuthGuard)
  async getSips(@Req() req: Request): Promise<ApiResponse<SipResponse[]>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.sipService.getCustomerSips(tenantId, customerId));
  }

  @Get('sip/:sipId')
  @UseGuards(B2CAuthGuard)
  async getSipDetail(
    @Req() req: Request,
    @Param('sipId') sipId: string,
  ): Promise<ApiResponse<SipResponse>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.sipService.getSip(tenantId, customerId, sipId));
  }

  @Put('sip/:sipId/pause')
  @UseGuards(B2CAuthGuard)
  async pauseSip(
    @Req() req: Request,
    @Param('sipId') sipId: string,
  ): Promise<ApiResponse<SipResponse>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.sipService.pauseSip(tenantId, customerId, sipId));
  }

  @Put('sip/:sipId/resume')
  @UseGuards(B2CAuthGuard)
  async resumeSip(
    @Req() req: Request,
    @Param('sipId') sipId: string,
  ): Promise<ApiResponse<SipResponse>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.sipService.resumeSip(tenantId, customerId, sipId));
  }

  @Put('sip/:sipId/cancel')
  @UseGuards(B2CAuthGuard)
  async cancelSip(
    @Req() req: Request,
    @Param('sipId') sipId: string,
  ): Promise<ApiResponse<SipResponse>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.sipService.cancelSip(tenantId, customerId, sipId));
  }

  @Get('sip/:sipId/history')
  @UseGuards(B2CAuthGuard)
  async getSipHistory(
    @Req() req: Request,
    @Param('sipId') sipId: string,
  ): Promise<ApiResponse<SipExecutionResponse[]>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.sipService.getSipHistory(tenantId, customerId, sipId));
  }

  // ─── Redemption ─────────────────────────────────────────────

  @Post('redeem')
  @UseGuards(B2CAuthGuard)
  async redeemGold(
    @Req() req: Request,
    @Body() dto: RedeemGoldDto,
  ): Promise<ApiResponse<RedeemGoldResponse>> {
    const { tenantId, customerId } = customerScope(req);
    const input = parseOrBadRequest(RedeemGoldInputSchema, dto);
    let result: RedeemGoldResponse;

    switch (input.redemptionType) {
      case GoldRedemptionType.PHYSICAL_GOLD:
        result = await this.redemptionService.redeemForPhysical(
          tenantId,
          customerId,
          input.weightMg!,
          input.addressId,
        );
        break;
      case GoldRedemptionType.JEWELRY:
        result = await this.redemptionService.redeemForJewelry(
          tenantId,
          customerId,
          input.productId!,
          input.addressId,
        );
        break;
      case GoldRedemptionType.SELL_BACK:
        result = await this.redemptionService.sellBack(
          tenantId,
          customerId,
          input.weightMg!,
          input.addressId,
        );
        break;
      default:
        throw new BadRequestException('Invalid redemption type');
    }

    return success(result);
  }

  @Get('redemptions')
  @UseGuards(B2CAuthGuard)
  async getRedemptions(@Req() req: Request): Promise<ApiResponse<RedeemGoldResponse[]>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.redemptionService.getRedemptions(tenantId, customerId));
  }

  // ─── Price Alerts ───────────────────────────────────────────

  @Post('alerts')
  @UseGuards(B2CAuthGuard)
  async createAlert(
    @Req() req: Request,
    @Body() dto: GoldPriceAlertDto,
  ): Promise<ApiResponse<GoldPriceAlertResponse>> {
    const { tenantId, customerId } = customerScope(req);
    const input = parseOrBadRequest(GoldPriceAlertInputSchema, dto);
    return success(await this.alertService.createAlert(tenantId, customerId, input));
  }

  @Get('alerts')
  @UseGuards(B2CAuthGuard)
  async getAlerts(@Req() req: Request): Promise<ApiResponse<GoldPriceAlertResponse[]>> {
    const { tenantId, customerId } = customerScope(req);
    return success(await this.alertService.getCustomerAlerts(tenantId, customerId));
  }

  @Delete('alerts/:alertId')
  @UseGuards(B2CAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelAlert(
    @Req() req: Request,
    @Param('alertId') alertId: string,
  ): Promise<void> {
    const { tenantId, customerId } = customerScope(req);
    await this.alertService.cancelAlert(tenantId, customerId, alertId);
  }

  // ─── Rates (public market data; metal_rate_history is global) ──

  @Get('rates/current')
  async getCurrentRates(): Promise<ApiResponse<unknown>> {
    return success(await this.digitalGoldService.getCurrentRates());
  }

  @Get('rates/history')
  async getRateHistory(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ApiResponse<unknown>> {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
      throw new BadRequestException('from/to must be valid dates');
    }
    const query = {
      metalType: 'GOLD',
      purity: 999,
      dateRange: fromDate && toDate ? { from: fromDate, to: toDate } : undefined,
    };
    return success(await this.ratesService.getHistoricalRates(query));
  }

  // ─── Dashboard (staff only) ─────────────────────────────────

  @Get('dashboard')
  @UseGuards(StaffAuthGuard)
  async getDashboard(@Req() req: Request): Promise<ApiResponse<DigitalGoldDashboardResponse>> {
    const tenantId = req.tenantId;
    if (!tenantId) throw new UnauthorizedException('Staff authentication required');
    return success(await this.digitalGoldService.getDashboard(tenantId));
  }
}
