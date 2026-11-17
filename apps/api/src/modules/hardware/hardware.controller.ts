// ─── Hardware REST Controller ─────────────────────────────────
// REST endpoints exposed under /api/v1/hardware/* for things
// that don't fit the tRPC pattern (raw biometric webhook payloads
// from third-party terminals, on-demand scale reads, label print
// command download, customer-facing display SSE stream).

import {
  Controller,
  Post,
  Body,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Sse,
  MessageEvent,
  Logger,
} from '@nestjs/common';
import { Observable, map, takeUntil, Subject, merge, of } from 'rxjs';
import type { Request } from 'express';
import { HardwareScaleService } from './hardware.scale.service';
import { HardwareBarcodeService } from './hardware.barcode.service';
import { HardwarePrinterService } from './hardware.printer.service';
import { HardwareBiometricService } from './hardware.biometric.service';
import { HardwareRfidService } from './hardware.rfid.service';
import type { RfidReadResultItem } from './hardware.rfid.service';
import { HardwareGateway } from './hardware.gateway';
import {
  ScaleReadRequestSchema,
  CfdSaleStateSchema,
  BiometricWebhookPayloadSchema,
} from '@caratflow/shared-types';
import type {
  ApiResponse,
  ScaleReadRequest,
  WeightReading,
  BarcodeProductLookup,
  LabelPrintCommandResponse,
  CfdSaleState,
  BiometricEventResponse,
  BiometricWebhookPayload,
} from '@caratflow/shared-types';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import { StaffAuthGuard } from '../../common/staff-auth.guard';

interface AuthenticatedRequest extends Request {
  tenantId?: string;
  userId?: string;
}

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// Tenant identity comes only from the verified JWT (set by TenantMiddleware).
function getTenantId(req: AuthenticatedRequest): string {
  if (!req.tenantId) throw new UnauthorizedException('Staff authentication required');
  return req.tenantId;
}

const PrintLabelBodySchema = z.object({
  productId: z.guid(),
  templateId: z.guid(),
  copies: z.number().int().min(1).max(100).default(1),
  language: z.enum(['ZPL', 'TSPL']).default('ZPL'),
});

const BarcodeLookupBodySchema = z.object({
  barcode: z.string().min(1),
});

const RfidReadBodySchema = z.object({
  readerId: z.string().min(1).optional(),
});

const biometricLogger = new Logger('HardwareBiometricWebhook');

/**
 * Verifies `x-device-signature` (hex HMAC-SHA256 over the raw body)
 * against HARDWARE_WEBHOOK_SECRET. Throws 401 on any failure.
 * Outside production, a missing secret or a missing rawBody falls back
 * to disabled verification / JSON.stringify(body) respectively, so local
 * development and tests keep working.
 */
function verifyBiometricSignature(req: Request, body: unknown): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.HARDWARE_WEBHOOK_SECRET;

  if (!secret) {
    if (isProduction) {
      throw new UnauthorizedException('Biometric webhook secret not configured');
    }
    biometricLogger.warn('HARDWARE_WEBHOOK_SECRET not set; biometric signature not verified (non-production)');
    return;
  }

  const headerValue = req.headers['x-device-signature'];
  const provided = (Array.isArray(headerValue) ? headerValue[0] : headerValue)?.trim();
  if (!provided) throw new UnauthorizedException('Missing device signature');

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  let payloadBytes: Buffer;
  if (rawBody && rawBody.length > 0) {
    payloadBytes = rawBody;
  } else if (!isProduction) {
    payloadBytes = Buffer.from(JSON.stringify(body ?? {}), 'utf8');
  } else {
    throw new UnauthorizedException('Raw request body unavailable for signature verification');
  }

  const expectedHex = createHmac('sha256', secret).update(payloadBytes).digest('hex');
  const expected = Buffer.from(expectedHex, 'utf8');
  const actual = Buffer.from(provided.replace(/^sha256=/i, '').toLowerCase(), 'utf8');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException('Invalid device signature');
  }
}

@Controller('api/v1/hardware')
export class HardwareController {
  constructor(
    private readonly scaleService: HardwareScaleService,
    private readonly barcodeService: HardwareBarcodeService,
    private readonly printerService: HardwarePrinterService,
    private readonly biometricService: HardwareBiometricService,
    private readonly rfidService: HardwareRfidService,
    private readonly gateway: HardwareGateway,
  ) {}

  // ─── Scale ────────────────────────────────────────────────

  /**
   * POST /api/v1/hardware/scale/read
   * Trigger an on-demand read from a registered scale device.
   * Returns the most recent stable reading.
   */
  @Post('scale/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffAuthGuard)
  async scaleRead(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<WeightReading>> {
    const tenantId = getTenantId(req);
    const input: ScaleReadRequest = ScaleReadRequestSchema.parse(body);
    const reading = await this.scaleService.readNow(tenantId, input);
    return ok(reading);
  }

  // ─── RFID ─────────────────────────────────────────────────

  /**
   * POST /api/v1/hardware/rfid/read
   * Trigger an on-demand RFID read from the configured driver
   * (defaults to the simulated driver that pulls live
   * SerialNumber rows from Prisma). Returns the enriched tag
   * list so the POS UI can render them immediately.
   */
  @Post('rfid/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffAuthGuard)
  async rfidRead(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<RfidReadResultItem[]>> {
    const tenantId = getTenantId(req);
    const { readerId } = RfidReadBodySchema.parse(body ?? {});
    const tags = await this.rfidService.readTags(tenantId, readerId);
    return ok(tags);
  }

  // ─── Barcode ──────────────────────────────────────────────

  /**
   * POST /api/v1/hardware/barcode/lookup
   * Validate a scanned barcode and resolve it to a product.
   */
  @Post('barcode/lookup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffAuthGuard)
  async barcodeLookup(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<BarcodeProductLookup>> {
    const tenantId = getTenantId(req);
    const { barcode } = BarcodeLookupBodySchema.parse(body);
    const lookup = await this.barcodeService.lookup(tenantId, barcode);
    return ok(lookup);
  }

  // ─── Label Printer ────────────────────────────────────────

  /**
   * POST /api/v1/hardware/label/print
   * Render a jewelry label for a product and return the raw
   * printer command stream (ZPL or TSPL) for the local print
   * agent to send to the device.
   */
  @Post('label/print')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffAuthGuard)
  async labelPrint(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<LabelPrintCommandResponse>> {
    const tenantId = getTenantId(req);
    const input = PrintLabelBodySchema.parse(body);
    const cmd = await this.printerService.printJewelryLabel(
      tenantId,
      input.templateId,
      input.productId,
      input.copies,
      input.language,
    );
    return ok(cmd);
  }

  // ─── Customer-Facing Display ──────────────────────────────

  /**
   * POST /api/v1/hardware/cfd/push
   * POS terminal pushes the current sale state for the
   * customer-facing second screen.
   */
  @Post('cfd/push')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffAuthGuard)
  async cfdPush(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<{ pushed: true }>> {
    const tenantId = getTenantId(req);
    const state: CfdSaleState = CfdSaleStateSchema.parse(body);
    this.gateway.pushCfdState(tenantId, state);
    return ok({ pushed: true });
  }

  /**
   * GET /api/v1/hardware/cfd/stream?terminalId=...
   * Server-Sent Events stream for the customer-facing display.
   * The second-screen client subscribes here and receives every
   * new sale state pushed by the matching POS terminal.
   */
  @Sse('cfd/stream')
  @UseGuards(StaffAuthGuard)
  cfdStream(
    @Req() req: AuthenticatedRequest,
    @Query('terminalId') terminalId: string,
  ): Observable<MessageEvent> {
    const tenantId = getTenantId(req);
    if (!terminalId) {
      throw new BadRequestException('terminalId query parameter is required');
    }

    const stop$ = new Subject<void>();
    const stateSubject = new Subject<CfdSaleState>();
    const off = this.gateway.subscribeCfd(tenantId, terminalId, (state) => {
      stateSubject.next(state);
    });

    // Clean up when the client disconnects
    req.on('close', () => {
      off();
      stop$.next();
      stop$.complete();
      stateSubject.complete();
    });

    // Send an initial keep-alive frame so the client knows it's connected
    const initial: MessageEvent = { data: { type: 'connected', terminalId } };
    return merge(of(initial), stateSubject.pipe(map((state): MessageEvent => ({ data: state })))).pipe(
      takeUntil(stop$),
    );
  }

  // ─── Biometric Webhook ────────────────────────────────────

  /**
   * POST /api/v1/hardware/biometric/webhook
   * Endpoint hit by ZKTeco / ESSL terminals when an employee
   * checks in or out. Authenticated by an HMAC-SHA256 signature of
   * the raw body in the `x-device-signature` header (secret:
   * HARDWARE_WEBHOOK_SECRET). The terminal must include `x-tenant-id`.
   */
  @Post('biometric/webhook')
  @HttpCode(HttpStatus.OK)
  async biometricWebhook(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiResponse<BiometricEventResponse>> {
    verifyBiometricSignature(req, body);
    // Terminals have no JWT. The tenant comes from x-tenant-id; the HMAC
    // proves the caller holds HARDWARE_WEBHOOK_SECRET. The tenant header
    // itself is not covered by the signature (see report).
    const headerTenant = req.headers['x-tenant-id'];
    const tenantId = Array.isArray(headerTenant) ? headerTenant[0] : headerTenant;
    if (!tenantId) throw new BadRequestException('Missing x-tenant-id header');
    const payload: BiometricWebhookPayload = BiometricWebhookPayloadSchema.parse(body);
    const event = await this.biometricService.processWebhook(tenantId, payload);
    return ok(event);
  }
}
