// ─── Payroll REST Controller ──────────────────────────────────
// Thin REST surface for binary payslip PDF downloads. The rest
// of payroll lives on tRPC.

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
import { PayrollPayslipService } from './payroll.payslip.service';

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

@Controller('api/v1/payroll')
export class PayrollController {
  constructor(private readonly payslipService: PayrollPayslipService) {}

  /**
   * GET /api/v1/payroll/payslips/:id/pdf
   * Stream a generated payslip PDF as application/pdf.
   */
  @UseGuards(StaffAuthGuard)
  @Get('payslips/:id/pdf')
  async downloadPayslipPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = getTenantId(req);
    const buf = await this.payslipService.generatePdf(tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="payslip-${id}.pdf"`,
    );
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }
}
