// ─── Referral REST Controller ──────────────────────────────────
// Store-facing REST endpoints for referral program. Every route is
// customer-only: B2CAuthGuard validates the token and the tenant and
// customer are taken from it.
// Prefix: /api/v1/store/referral

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { ReferralService } from './referral.service';

@Controller('api/v1/store/referral')
@UseGuards(B2CAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /** GET /api/v1/store/referral/my-code - Get or generate referral code for authenticated customer */
  @Get('my-code')
  async getMyCode(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);
    return {
      success: true,
      data: await this.referralService.getReferralCode(tenantId, customerId),
    };
  }

  /** POST /api/v1/store/referral/apply - Apply a referral code */
  @Post('apply')
  @HttpCode(HttpStatus.OK)
  async applyReferral(
    @Req() req: Request,
    @Body() body: { referralCode: string; invitedVia?: 'WHATSAPP' | 'EMAIL' | 'SMS' | 'LINK' | 'SOCIAL' },
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    if (typeof body.referralCode !== 'string' || body.referralCode.trim() === '') {
      throw new BadRequestException('referralCode is required');
    }
    const referral = await this.referralService.applyReferral(
      tenantId,
      customerId,
      body.referralCode.trim().toUpperCase(),
      body.invitedVia ?? 'LINK',
    );
    return {
      success: true,
      data: referral,
    };
  }

  /** GET /api/v1/store/referral/stats - Get referral stats for authenticated customer */
  @Get('stats')
  async getStats(@Req() req: Request) {
    const { tenantId, customerId } = this.customerContext(req);
    return {
      success: true,
      data: await this.referralService.getReferralStats(tenantId, customerId),
    };
  }

  /** Tenant and customer from the B2C guard. Throws if either is missing. */
  private customerContext(req: Request): { tenantId: string; customerId: string } {
    const tenantId = req.b2cTenantId;
    const customerId = req.customerId;
    if (!tenantId || !customerId) {
      throw new UnauthorizedException('Customer authentication required');
    }
    return { tenantId, customerId };
  }
}
