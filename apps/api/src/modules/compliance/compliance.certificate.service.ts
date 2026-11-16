// ─── Gemstone Certificate Service ─────────────────────────────
// CRUD and verification for gemstone certificates (GIA, IGI, etc.)

import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { TenantAwareService } from '../../common/base.service';
import { PrismaService } from '../../common/prisma.service';
import type {
  GemstoneCertificateInput,
  GemstoneCertificateListInput,
} from '@caratflow/shared-types';
import type { PaginatedResult } from '@caratflow/shared-types';
import { v4 as uuid } from 'uuid';

export type CertificateVerificationStatus = 'VERIFIED' | 'PENDING_VERIFICATION';
export type CertificateVerificationMode = 'API' | 'MANUAL';

interface LabApiConfig {
  lab: 'GIA' | 'IGI';
  baseUrl: string;
  apiKey: string;
}

@Injectable()
export class ComplianceCertificateService extends TenantAwareService {
  private readonly logger = new Logger(ComplianceCertificateService.name);

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(tenantId: string, userId: string, input: GemstoneCertificateInput) {
    // Check uniqueness of certificate number within tenant
    const existing = await this.prisma.gemstoneCertificate.findFirst({
      where: this.tenantWhere(tenantId, { certificateNumber: input.certificateNumber }),
    });
    if (existing) {
      throw new BadRequestException(
        `Certificate ${input.certificateNumber} already exists.`,
      );
    }

    const certificate = await this.prisma.gemstoneCertificate.create({
      data: {
        id: uuid(),
        tenantId,
        productId: input.productId,
        certificateNumber: input.certificateNumber,
        issuingLab: input.issuingLab,
        stoneType: input.stoneType,
        caratWeight: input.caratWeight,
        color: input.color ?? null,
        clarity: input.clarity ?? null,
        cut: input.cut ?? null,
        shape: input.shape ?? null,
        dimensions: input.dimensions ?? null,
        fluorescence: input.fluorescence ?? null,
        certificateDate: input.certificateDate ?? null,
        certificateUrl: input.certificateUrl ?? null,
        imageUrl: input.imageUrl ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    return certificate;
  }

  async update(tenantId: string, userId: string, id: string, input: Partial<GemstoneCertificateInput>) {
    const cert = await this.prisma.gemstoneCertificate.findFirst({
      where: this.tenantWhere(tenantId, { id }),
    });
    if (!cert) throw new NotFoundException('Certificate not found.');

    return this.prisma.gemstoneCertificate.update({
      where: { id },
      data: {
        ...input,
        updatedBy: userId,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });
  }

  async findById(tenantId: string, id: string) {
    const cert = await this.prisma.gemstoneCertificate.findFirst({
      where: this.tenantWhere(tenantId, { id }),
      include: { product: { select: { id: true, sku: true, name: true } } },
    });
    if (!cert) throw new NotFoundException('Certificate not found.');
    return cert;
  }

  async findByCertificateNumber(tenantId: string, certificateNumber: string) {
    const cert = await this.prisma.gemstoneCertificate.findFirst({
      where: this.tenantWhere(tenantId, { certificateNumber }),
      include: { product: { select: { id: true, sku: true, name: true } } },
    });
    return cert;
  }

  async list(tenantId: string, input: GemstoneCertificateListInput): Promise<PaginatedResult<unknown>> {
    const { page, limit, sortBy, sortOrder, issuingLab, isVerified, search } = input;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (issuingLab) where.issuingLab = issuingLab;
    if (isVerified !== undefined) where.isVerified = isVerified;
    if (search) {
      where.OR = [
        { certificateNumber: { contains: search } },
        { product: { name: { contains: search } } },
        { stoneType: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.gemstoneCertificate.findMany({
        where,
        include: { product: { select: { id: true, sku: true, name: true } } },
        orderBy: { [sortBy ?? 'createdAt']: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.gemstoneCertificate.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }

  /**
   * Verify a certificate against the issuing lab's public lookup service.
   *
   * API path (GIA, IGI only) activates when credentials are configured:
   *   GIA_API_URL + GIA_API_KEY for GIA
   *   IGI_API_URL + IGI_API_KEY for IGI
   * The cert is marked VERIFIED only if the lab confirms it; a lab that
   * rejects it raises BadRequestException and the record is left unverified.
   *
   * Without credentials (or for labs with no API integration such as HRD
   * and SGL) nothing is marked verified. The result is
   * PENDING_VERIFICATION with verificationMode 'MANUAL'; a person must
   * confirm the certificate and call manualVerify().
   */
  async verifyCertificate(tenantId: string, userId: string, id: string) {
    const cert = await this.prisma.gemstoneCertificate.findFirst({
      where: this.tenantWhere(tenantId, { id }),
    });
    if (!cert) throw new NotFoundException('Certificate not found.');

    const lab = cert.issuingLab?.toUpperCase() ?? '';
    const apiConfig = this.getLabApiConfig(lab);

    if (!apiConfig) {
      this.logger.warn(
        `[lab-manual] ${lab || 'UNKNOWN'} cert ${cert.certificateNumber} requires manual verification ` +
          `(no lab API configured for ${lab || 'this lab'}).`,
      );
      return {
        certificateNumber: cert.certificateNumber,
        status: 'PENDING_VERIFICATION' as CertificateVerificationStatus,
        verificationMode: 'MANUAL' as CertificateVerificationMode,
        isValid: false,
        lab: cert.issuingLab,
        verifiedAt: null,
        verifiedBy: null,
        source: 'MANUAL_REQUIRED',
      };
    }

    const labResult = await this.callLabApi(apiConfig, cert.certificateNumber);
    if (!labResult.valid) {
      throw new BadRequestException(
        `Lab ${lab} could not verify certificate ${cert.certificateNumber}: ${labResult.reason ?? 'not found'}`,
      );
    }

    const updated = await this.prisma.gemstoneCertificate.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        updatedBy: userId,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    return {
      certificateNumber: updated.certificateNumber,
      status: 'VERIFIED' as CertificateVerificationStatus,
      verificationMode: 'API' as CertificateVerificationMode,
      isValid: true,
      lab: updated.issuingLab,
      verifiedAt: updated.verifiedAt,
      verifiedBy: userId,
      source: `${lab}-API`,
    };
  }

  /**
   * Record a manual verification of a certificate (checked by a person
   * against the physical report or the lab's website). Stores the verifier
   * (updatedBy) and the verification date (verifiedAt).
   */
  async manualVerify(tenantId: string, userId: string, id: string) {
    const cert = await this.prisma.gemstoneCertificate.findFirst({
      where: this.tenantWhere(tenantId, { id }),
    });
    if (!cert) throw new NotFoundException('Certificate not found.');

    const updated = await this.prisma.gemstoneCertificate.update({
      where: { id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        updatedBy: userId,
      },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    this.logger.log(
      `[lab-manual] cert ${updated.certificateNumber} manually verified by user ${userId}`,
    );

    return {
      certificateNumber: updated.certificateNumber,
      status: 'VERIFIED' as CertificateVerificationStatus,
      verificationMode: 'MANUAL' as CertificateVerificationMode,
      isValid: true,
      lab: updated.issuingLab,
      verifiedAt: updated.verifiedAt,
      verifiedBy: userId,
      source: 'MANUAL',
    };
  }

  /**
   * Returns the API configuration for a lab, or null when the lab has no
   * integration or credentials are not set.
   */
  private getLabApiConfig(lab: string): LabApiConfig | null {
    if (lab === 'GIA') {
      const baseUrl = process.env.GIA_API_URL;
      const apiKey = process.env.GIA_API_KEY;
      return baseUrl && apiKey ? { lab: 'GIA', baseUrl, apiKey } : null;
    }
    if (lab === 'IGI') {
      const baseUrl = process.env.IGI_API_URL;
      const apiKey = process.env.IGI_API_KEY;
      return baseUrl && apiKey ? { lab: 'IGI', baseUrl, apiKey } : null;
    }
    return null;
  }

  /**
   * Call the lab's public cert-lookup endpoint.
   */
  private async callLabApi(
    config: LabApiConfig,
    certificateNumber: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const url = `${config.baseUrl.replace(/\/$/, '')}/verify/${encodeURIComponent(certificateNumber)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'x-api-key': config.apiKey, Accept: 'application/json' },
      });
      if (!res.ok) {
        this.logger.warn(`[${config.lab}] lookup HTTP ${res.status} for ${certificateNumber}`);
        return { valid: false, reason: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { valid?: boolean; status?: string; message?: string };
      const valid = body.valid === true || body.status === 'VALID';
      return { valid, reason: valid ? undefined : (body.message ?? 'not found') };
    } catch (err) {
      this.logger.error(`[${config.lab}] lookup failed: ${(err as Error).message}`);
      return { valid: false, reason: (err as Error).message };
    }
  }

  async getCertifiedStonesPercent(tenantId: string): Promise<number> {
    const [totalStones, certifiedStones] = await Promise.all([
      this.prisma.product.count({
        where: {
          tenantId,
          productType: { in: ['DIAMOND', 'GEMSTONE'] },
          isActive: true,
        },
      }),
      this.prisma.gemstoneCertificate.count({
        where: { tenantId, isVerified: true },
      }),
    ]);

    return totalStones > 0
      ? Math.round((certifiedStones / totalStones) * 10000) / 100
      : 100;
  }
}
