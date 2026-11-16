// ─── CRM REST Controller ──────────────────────────────────────
// Thin REST shim around the CRM tRPC procedures, exposed for the
// B2C storefront which fetches over plain `fetch()`. Customer endpoints
// require a B2C customer JWT via B2CAuthGuard so the customerId comes from
// the validated token (never from the request body). The newsletter route
// is public and validated with class-validator decorators.

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsArray, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { B2CAuthGuard } from '../../auth/b2c-auth.guard';
import { VideoConsultationService } from './video-consultation.service';
import { CrmLeadService } from './crm.lead.service';
import type { ApiResponse } from '@caratflow/shared-types';

// ─── DTOs ─────────────────────────────────────────────────────

class VideoConsultationRequestDto {
  @IsOptional()
  @IsArray()
  productsOfInterest?: Array<{ productId: string; notes?: string }>;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredLang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class NewsletterSubscribeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

// Anchored RFC-5322-lite check kept as a second layer behind @IsEmail.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helper ───────────────────────────────────────────────────

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// ─── Controller ───────────────────────────────────────────────

@ApiTags('CRM (B2C REST shim)')
@Controller('api/v1/crm')
export class CrmController {
  constructor(
    private readonly videoConsultationService: VideoConsultationService,
    private readonly leadService: CrmLeadService,
  ) {}

  // ─── Video Consultation (customer) ─────────────────────────

  @Post('video-consultation/request')
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a video consultation (B2C storefront)' })
  async requestConsultation(
    @Req() req: Request,
    @Body() body: VideoConsultationRequestDto,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.videoConsultationService.request(tenantId, customerId, {
      customerId,
      productsOfInterest: body.productsOfInterest,
      preferredLang: body.preferredLang ?? 'en',
      customerPhone: body.customerPhone,
      notes: body.notes,
    });
    return success(data);
  }

  @Get('video-consultation/list')
  @UseGuards(B2CAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the signed-in customer\'s video consultations' })
  async listConsultations(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const { tenantId, customerId } = this.customerContext(req);
    const data = await this.videoConsultationService.list(
      tenantId,
      {
        customerId,
        status: status as undefined,
      },
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      },
    );
    return success(data);
  }

  // ─── Newsletter (public) ───────────────────────────────────

  @Post('newsletter/subscribe')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Subscribe an email to the newsletter (creates a lead)' })
  async subscribeNewsletter(
    @Req() req: Request,
    @Body() body: NewsletterSubscribeDto,
  ) {
    // Second layer behind class-validator: type-safe checks, no throw on non-strings.
    if (typeof body.email !== 'string' || body.email.length > 254 || !EMAIL_RE.test(body.email.trim())) {
      return { success: false, error: { code: 'INVALID_EMAIL', message: 'Valid email is required' } } as ApiResponse<null>;
    }
    const email = body.email.trim();

    // Resolve tenantId from the authenticated B2C session or the x-tenant-id header.
    // The header must be a UUID; anything else is rejected.
    const headerTenant = req.headers['x-tenant-id'];
    const tenantId = req.b2cTenantId
      ?? (typeof headerTenant === 'string' && UUID_RE.test(headerTenant) ? headerTenant : undefined);
    if (!tenantId) {
      return { success: false, error: { code: 'MISSING_TENANT', message: 'Tenant context missing' } } as ApiResponse<null>;
    }

    const userId = req.customerId ?? 'system';
    const displayName = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : (email.split('@')[0] ?? 'Subscriber');
    const [firstName, ...rest] = displayName.split(/\s+/);
    const lastName = rest.join(' ') || 'Subscriber';
    try {
      const lead = await this.leadService.createLead(tenantId, userId, {
        firstName: firstName || 'Newsletter',
        lastName,
        email,
        source: 'WEBSITE',
        notes: typeof body.source === 'string' && body.source
          ? `Newsletter signup via ${body.source}`
          : 'Newsletter signup',
      } as Parameters<typeof this.leadService.createLead>[2]);
      return success({ id: lead.id, subscribed: true });
    } catch (err) {
      // Tolerate duplicates / validation errors so the storefront never sees a 500.
      return success({ subscribed: true, note: err instanceof Error ? err.message : 'noted' });
    }
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
}
