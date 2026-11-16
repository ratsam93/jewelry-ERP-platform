// ─── BNPL REST Controller ─────────────────────────────────────
// REST API endpoints for storefront-facing BNPL, EMI, and
// saved payment method operations.
//
// Customer routes are guarded by B2CAuthGuard and scoped to the
// customer/tenant from the verified token. The provider callback is
// public but must carry a valid HMAC signature (x-bnpl-signature).

import { UUID_RE } from '../../common/customer-identity';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { BnplService } from './bnpl.service';
import { BnplEmiService } from './bnpl.emi.service';
import { BnplSavedPaymentService } from './bnpl.saved-payment.service';
import type {
  InitiateBnplInput,
  SavedPaymentMethodInput,
  EmiCalculatorInput,
} from '@caratflow/shared-types';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('api/v1/store/payments')
export class BnplController {
  constructor(
    private readonly bnplService: BnplService,
    private readonly emiService: BnplEmiService,
    private readonly savedPaymentService: BnplSavedPaymentService,
  ) {}

  // ─── EMI Plans (public) ───────────────────────────────────────

  /**
   * GET /api/v1/store/payments/emi-plans?amount=50000
   * List available EMI plans for a given amount (in paise).
   */
  @Get('emi-plans')
  async getEmiPlans(
    @Req() req: Request,
    @Query('amount') amountStr: string,
  ) {
    const tenantId = this.publicTenantOf(req);
    const amountPaise = parseInt(amountStr, 10);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('amount query parameter must be a positive integer (in paise)');
    }

    const plans = await this.emiService.getAvailablePlans(tenantId, amountPaise);

    // Enrich each plan with EMI calculation
    const enrichedPlans = plans.map((plan) => {
      const calc = this.emiService.calculateEmi(amountPaise, plan.tenure, plan.interestRatePct);
      return {
        ...plan,
        monthlyEmiPaise: calc.monthlyEmiPaise,
        totalInterestPaise: calc.totalInterestPaise,
        totalPayablePaise: calc.totalPayablePaise,
      };
    });

    return {
      success: true,
      data: enrichedPlans,
      meta: { amountPaise, planCount: enrichedPlans.length },
    };
  }

  // ─── EMI Calculator (public) ──────────────────────────────────

  /**
   * POST /api/v1/store/payments/emi/calculate
   * Calculate EMI for a given amount, tenure, and interest rate.
   */
  @Post('emi/calculate')
  @HttpCode(HttpStatus.OK)
  async calculateEmi(
    @Body() input: EmiCalculatorInput,
  ) {
    if (!input.amountPaise || input.amountPaise <= 0) {
      throw new BadRequestException('amountPaise must be a positive integer');
    }
    if (!input.tenure || input.tenure <= 0) {
      throw new BadRequestException('tenure must be a positive integer');
    }
    if (input.interestRatePct === undefined || input.interestRatePct < 0) {
      throw new BadRequestException('interestRatePct must be a non-negative integer');
    }

    const result = this.emiService.calculateEmiWithSchedule(
      input.amountPaise,
      input.tenure,
      input.interestRatePct,
    );

    return {
      success: true,
      data: result,
    };
  }

  // ─── Eligibility Check (customer) ─────────────────────────────

  /**
   * GET /api/v1/store/payments/bnpl/eligibility?amount=50000
   * Check BNPL eligibility for the authenticated customer and amount.
   * Declared before ':transactionId' so the literal path is not captured by it.
   */
  @Get('bnpl/eligibility')
  @UseGuards(B2CAuthGuard)
  async checkEligibility(
    @Req() req: Request,
    @Query('amount') amountStr: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const amountPaise = parseInt(amountStr, 10);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('amount query parameter must be a positive integer (in paise)');
    }

    const result = await this.bnplService.checkEligibility(tenantId, customerId, amountPaise);

    return {
      success: true,
      data: result,
    };
  }

  // ─── BNPL Initiate (customer) ─────────────────────────────────

  /**
   * POST /api/v1/store/payments/bnpl/initiate
   * Initiate a BNPL transaction for an order.
   */
  @Post('bnpl/initiate')
  @UseGuards(B2CAuthGuard)
  async initiateBnpl(
    @Req() req: Request,
    @Body() input: InitiateBnplInput,
  ) {
    const { tenantId, customerId } = this.customerContext(req);

    const transaction = await this.bnplService.initiateBnpl(
      tenantId,
      req.customerAuthId ?? customerId,
      customerId,
      input,
    );

    return {
      success: true,
      data: transaction,
    };
  }

  // ─── BNPL Callback (provider, signed) ─────────────────────────

  /**
   * POST /api/v1/store/payments/bnpl/callback/:provider
   * Handle BNPL provider webhook/callback. No tenant is taken from the
   * request; the tenant comes from the stored transaction.
   */
  @Post('bnpl/callback/:provider')
  @HttpCode(HttpStatus.OK)
  async handleBnplCallback(
    @Req() req: RawBodyRequest,
    @Param('provider') provider: string,
    @Headers('x-bnpl-signature') signature: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    this.bnplService.verifyCallbackSignature(req.rawBody, payload, signature);

    const transaction = await this.bnplService.handleBnplCallback(provider, payload);

    return {
      success: true,
      data: transaction,
    };
  }

  // ─── BNPL Transaction (customer) ──────────────────────────────

  /**
   * GET /api/v1/store/payments/bnpl/:transactionId
   * Get a BNPL transaction with its EMI schedule.
   */
  @Get('bnpl/:transactionId')
  @UseGuards(B2CAuthGuard)
  async getTransaction(
    @Req() req: Request,
    @Param('transactionId') transactionId: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const transaction = await this.bnplService.getTransaction(
      tenantId,
      transactionId,
      customerId,
    );

    return {
      success: true,
      data: transaction,
    };
  }

  // ─── Saved Payment Methods (customer) ─────────────────────────

  /**
   * GET /api/v1/store/payments/saved-methods
   * List saved payment methods for the current customer.
   */
  @Get('saved-methods')
  @UseGuards(B2CAuthGuard)
  async listSavedMethods(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);

    const methods = await this.savedPaymentService.listMethods(tenantId, customerId);

    return {
      success: true,
      data: methods,
    };
  }

  /**
   * POST /api/v1/store/payments/saved-methods
   * Save a new payment method (tokenized).
   */
  @Post('saved-methods')
  @UseGuards(B2CAuthGuard)
  async saveMethod(
    @Req() req: Request,
    @Body() input: SavedPaymentMethodInput,
  ) {
    const { tenantId, customerId } = this.customerContext(req);

    const method = await this.savedPaymentService.saveMethod(
      tenantId,
      customerId,
      input,
    );

    return {
      success: true,
      data: method,
    };
  }

  /**
   * POST /api/v1/store/payments/saved-methods/:methodId/default
   * Set a saved payment method as default.
   */
  @Post('saved-methods/:methodId/default')
  @HttpCode(HttpStatus.OK)
  @UseGuards(B2CAuthGuard)
  async setDefaultMethod(
    @Req() req: Request,
    @Param('methodId') methodId: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);

    const method = await this.savedPaymentService.setDefault(
      tenantId,
      customerId,
      methodId,
    );

    return {
      success: true,
      data: method,
    };
  }

  /**
   * DELETE /api/v1/store/payments/saved-methods/:methodId
   * Remove a saved payment method.
   */
  @Delete('saved-methods/:methodId')
  @UseGuards(B2CAuthGuard)
  async removeMethod(
    @Req() req: Request,
    @Param('methodId') methodId: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);

    await this.savedPaymentService.removeMethod(tenantId, customerId, methodId);

    return {
      success: true,
      data: null,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Tenant/customer from the B2C guard. Throws if either is missing. */
  private customerContext(req: Request): { tenantId: string; customerId: string } {
    const tenantId = req.b2cTenantId;
    const customerId = req.customerId;
    if (!tenantId || !customerId) {
      throw new UnauthorizedException('Customer authentication required');
    }
    return { tenantId, customerId };
  }

  /** Tenant for public (unauthenticated) storefront routes, from TenantMiddleware. */
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
