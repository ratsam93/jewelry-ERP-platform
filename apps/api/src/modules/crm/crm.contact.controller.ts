// ─── CRM Public Contact Controller ────────────────────────────
// Public, throttled endpoint for the marketing site's contact form.
// Creates a CRM lead (never a newsletter subscription). Tenant comes from
// the x-tenant-id header (UUID validated), like the other public CRM routes.

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CrmLeadService } from './crm.lead.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ContactEnquiryDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+()\-\s.]{6,20}$/, { message: 'phone must be a valid phone number' })
  phone?: string;

  @IsString()
  @Length(1, 2000)
  message!: string;

  /** Honeypot: real users never fill this hidden field. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsIn(['marketing-site', 'storefront'])
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locations?: string;
}

@ApiTags('CRM (public contact)')
@Controller('api/v1/crm')
export class CrmContactController {
  private readonly logger = new Logger(CrmContactController.name);

  constructor(private readonly leadService: CrmLeadService) {}

  @Post('contact')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a marketing-site contact enquiry (creates a CRM lead)' })
  async submit(@Req() req: Request, @Body() body: ContactEnquiryDto) {
    const headerTenant = req.headers['x-tenant-id'];
    const tenantId =
      typeof headerTenant === 'string' && UUID_RE.test(headerTenant) ? headerTenant : undefined;
    if (!tenantId) {
      throw new BadRequestException('A valid x-tenant-id header is required');
    }

    // Honeypot filled: pretend success so bots get no signal, store nothing.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      this.logger.warn('Contact enquiry dropped: honeypot field filled');
      return { success: true };
    }

    const name = body.name.trim();
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(' ') || '-';
    const extras = [
      body.company?.trim() ? `Company: ${body.company.trim()}` : null,
      body.locations?.trim() ? `Locations: ${body.locations.trim()}` : null,
      `Source: ${body.source ?? 'marketing-site'}`,
    ].filter(Boolean);

    // Lead.source is a DB enum without WEBSITE_CONTACT (needs a migration), so use
    // WEBSITE and mark the origin in the notes.
    await this.leadService.createLead(tenantId, 'system', {
      firstName: firstName || 'Website',
      lastName,
      email: body.email.trim(),
      phone: body.phone?.trim() || undefined,
      source: 'WEBSITE',
      notes: `[Website contact form] ${body.message.trim()}\n${extras.join(' | ')}`,
    } as Parameters<CrmLeadService['createLead']>[2]);

    return { success: true };
  }
}
