// ─── Financial REST Controller ────────────────────────────────
// Thin REST surface for things that don't fit tRPC: primarily
// binary PDF downloads. The rest of financial lives on tRPC.

import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StaffAuthGuard } from '../../common/staff-auth.guard';
import { FinancialService } from './financial.service';

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
}

// Tenant identity comes only from the verified JWT (set by TenantMiddleware).
// Never read it from request headers.
function getTenantId(req: AuthenticatedRequest): string {
  if (!req.tenantId) throw new UnauthorizedException('Staff authentication required');
  return req.tenantId;
}

@Controller('api/v1/financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  /**
   * GET /api/v1/financial/invoices/:id/pdf
   * Stream a generated invoice PDF as application/pdf.
   */
  @UseGuards(StaffAuthGuard)
  @Get('invoices/:id/pdf')
  async downloadInvoicePdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = getTenantId(req);
    const buf = await this.financialService.generateInvoicePdf(tenantId, id);
    const inv = (await Promise.resolve(this.financialService.getInvoice(tenantId, id)).catch(() => null)) as { invoiceNumber?: string } | null;
    const base = (inv?.invoiceNumber ?? `invoice-${id}`).replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${base}.pdf"`,
    );
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }
}
