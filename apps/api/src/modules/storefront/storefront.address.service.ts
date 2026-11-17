// ─── Storefront Address Service ────────────────────────────────
// CRUD for customer delivery addresses.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AddressInput, AddressResponse } from '@caratflow/shared-types';
import { PrismaService } from '../../common/prisma.service';
import { TenantAwareService } from '../../common/base.service';
import { v4 as uuidv4 } from 'uuid';

// Column limits mirror packages/db/prisma/schema/storefront.prisma (CustomerAddress).
const ADDRESS_FIELD_LIMITS: Record<string, number> = {
  label: 50,
  firstName: 100,
  lastName: 100,
  phone: 20,
  addressLine1: 500,
  addressLine2: 500,
  city: 100,
  state: 100,
  postalCode: 20,
};

const ADDRESS_FIELD_LABELS: Record<string, string> = {
  label: 'Label',
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'City',
  state: 'State',
  postalCode: 'Postal code',
};

/** Common countries: lowercase name -> ISO 3166-1 alpha-2. */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  india: 'IN',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  'united arab emirates': 'AE',
  uae: 'AE',
  singapore: 'SG',
  australia: 'AU',
  canada: 'CA',
  germany: 'DE',
  france: 'FR',
  'saudi arabia': 'SA',
  qatar: 'QA',
  kuwait: 'KW',
  oman: 'OM',
  bahrain: 'BH',
  nepal: 'NP',
  'sri lanka': 'LK',
  bangladesh: 'BD',
  malaysia: 'MY',
  'hong kong': 'HK',
  'new zealand': 'NZ',
};

/**
 * Normalise a country name or 2-letter code to an uppercase ISO alpha-2 code.
 * Throws BadRequestException (never a DB error) for unknown values.
 */
export function normalizeCountry(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new BadRequestException('Country is required');
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const iso = COUNTRY_NAME_TO_ISO[raw.toLowerCase().replace(/\s+/g, ' ')];
  if (!iso) {
    throw new BadRequestException(
      `Unsupported country "${raw.slice(0, 50)}". Use a 2-letter ISO country code (e.g. IN) or a known country name.`,
    );
  }
  return iso;
}

function validateFieldLengths(input: Record<string, unknown>): void {
  for (const [key, max] of Object.entries(ADDRESS_FIELD_LIMITS)) {
    const v = input[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') {
      throw new BadRequestException(`${ADDRESS_FIELD_LABELS[key]} must be text`);
    }
    if (v.length > max) {
      throw new BadRequestException(`${ADDRESS_FIELD_LABELS[key]} must be at most ${max} characters`);
    }
  }
}

@Injectable()
export class StorefrontAddressService extends TenantAwareService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * List all addresses for a customer.
   */
  async listAddresses(tenantId: string, customerId: string): Promise<AddressResponse[]> {
    const addresses = await this.prisma.customerAddress.findMany({
      where: { tenantId, customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses.map((a) => this.mapToResponse(a));
  }

  /**
   * Get a single address.
   */
  async getAddress(tenantId: string, customerId: string, addressId: string): Promise<AddressResponse> {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, tenantId, customerId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return this.mapToResponse(address);
  }

  /**
   * Create a new address. If isDefault, unset previous default.
   */
  async createAddress(
    tenantId: string,
    customerId: string,
    input: AddressInput,
  ): Promise<AddressResponse> {
    validateFieldLengths(input as unknown as Record<string, unknown>);
    const country = normalizeCountry(input.country);
    // If this is the first address or marked as default, ensure uniqueness
    if (input.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { tenantId, customerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If this is the first address, auto-set as default
    const existingCount = await this.prisma.customerAddress.count({
      where: { tenantId, customerId },
    });
    const isDefault = existingCount === 0 ? true : (input.isDefault ?? false);

    const address = await this.prisma.customerAddress.create({
      data: {
        id: uuidv4(),
        tenantId,
        customerId,
        label: input.label ?? 'Home',
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        country,
        postalCode: input.postalCode,
        isDefault,
      },
    });

    return this.mapToResponse(address);
  }

  /**
   * Update an existing address.
   */
  async updateAddress(
    tenantId: string,
    customerId: string,
    addressId: string,
    input: Partial<AddressInput>,
  ): Promise<AddressResponse> {
    validateFieldLengths(input as Record<string, unknown>);
    const country = input.country !== undefined ? normalizeCountry(input.country) : undefined;
    const existing = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, tenantId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    if (input.isDefault) {
      await this.prisma.customerAddress.updateMany({
        where: { tenantId, customerId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.addressLine1 !== undefined) data.addressLine1 = input.addressLine1;
    if (input.addressLine2 !== undefined) data.addressLine2 = input.addressLine2;
    if (input.city !== undefined) data.city = input.city;
    if (input.state !== undefined) data.state = input.state;
    if (country !== undefined) data.country = country;
    if (input.postalCode !== undefined) data.postalCode = input.postalCode;
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;

    const updated = await this.prisma.customerAddress.update({
      where: { id: addressId },
      data,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Delete an address. Cannot delete if it is the only default address.
   */
  async deleteAddress(tenantId: string, customerId: string, addressId: string): Promise<void> {
    const address = await this.prisma.customerAddress.findFirst({
      where: { id: addressId, tenantId, customerId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.customerAddress.delete({ where: { id: addressId } });

    // If we deleted the default, set another as default
    if (address.isDefault) {
      const nextDefault = await this.prisma.customerAddress.findFirst({
        where: { tenantId, customerId },
        orderBy: { createdAt: 'asc' },
      });
      if (nextDefault) {
        await this.prisma.customerAddress.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }
  }

  // ─── Private ──────────────────────────────────────────────────

  private mapToResponse(address: Record<string, unknown>): AddressResponse {
    const a = address as Record<string, unknown>;
    return {
      id: a.id as string,
      customerId: a.customerId as string,
      label: a.label as string,
      firstName: a.firstName as string,
      lastName: a.lastName as string,
      phone: a.phone as string,
      addressLine1: a.addressLine1 as string,
      addressLine2: (a.addressLine2 as string) ?? null,
      city: a.city as string,
      state: a.state as string,
      country: a.country as string,
      postalCode: a.postalCode as string,
      isDefault: a.isDefault as boolean,
      createdAt: new Date(a.createdAt as string),
      updatedAt: new Date(a.updatedAt as string),
    };
  }
}
