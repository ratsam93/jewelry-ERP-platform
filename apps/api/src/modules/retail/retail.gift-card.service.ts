// ─── Retail Gift Card Service ──────────────────────────────────
// Issue gift cards, check balances, and redeem value (standalone or inside
// the caller's transaction, e.g. a split-payment POS sale).

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { GiftCardInput, GiftCardResponse } from '@caratflow/shared-types';
import { GiftCardStatus } from '@caratflow/shared-types';
import { PrismaService } from '../../common/prisma.service';
import { TenantAwareService } from '../../common/base.service';
import { v4 as uuidv4 } from 'uuid';

/** Minimal transaction-client surface needed to redeem inside a caller's $transaction. */
export interface GiftCardTxClient {
  giftCard: {
    findFirst: PrismaService['giftCard']['findFirst'];
    updateMany: PrismaService['giftCard']['updateMany'];
  };
}

@Injectable()
export class RetailGiftCardService extends TenantAwareService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  private generateCardNumber(): string {
    // 16 digits, grouped by the UI; crypto RNG so numbers are not guessable.
    let n = '';
    for (let i = 0; i < 16; i++) n += String(randomInt(0, 10));
    return n;
  }

  async issueGiftCard(tenantId: string, userId: string, input: GiftCardInput): Promise<GiftCardResponse> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cardNumber = this.generateCardNumber();
      const exists = await this.prisma.giftCard.findFirst({ where: { tenantId, cardNumber } });
      if (exists) continue;

      const card = await this.prisma.giftCard.create({
        data: {
          id: uuidv4(),
          tenantId,
          cardNumber,
          balancePaise: BigInt(input.initialValuePaise),
          initialValuePaise: BigInt(input.initialValuePaise),
          customerId: input.customerId ?? null,
          status: 'ACTIVE',
          expiresAt: input.expiresAt ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      return this.mapToResponse(card);
    }
    throw new BadRequestException('Could not allocate a unique gift card number');
  }

  async getBalance(tenantId: string, cardNumber: string): Promise<GiftCardResponse> {
    const card = await this.prisma.giftCard.findFirst({ where: { tenantId, cardNumber } });
    if (!card) throw new NotFoundException('Gift card not found');
    return this.mapToResponse(card);
  }

  /**
   * Redeem `amountPaise` from a card. Pass the caller's `tx` to make the debit
   * part of an enclosing transaction. The debit is a guarded conditional update
   * (balance >= amount, ACTIVE, unexpired), so concurrent redemptions cannot overdraw.
   */
  async redeem(
    tenantId: string,
    userId: string,
    cardNumber: string,
    amountPaise: number,
    tx?: GiftCardTxClient,
  ): Promise<GiftCardResponse> {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('Redeem amount must be a positive integer (paise)');
    }
    const db = tx ?? this.prisma;
    const now = new Date();

    const card = await db.giftCard.findFirst({ where: { tenantId, cardNumber } });
    if (!card) throw new NotFoundException('Gift card not found');
    if (card.status !== 'ACTIVE') throw new BadRequestException(`Gift card is ${card.status}`);
    if (card.expiresAt && card.expiresAt < now) throw new BadRequestException('Gift card has expired');
    if (card.balancePaise < BigInt(amountPaise)) {
      throw new BadRequestException(
        `Insufficient gift card balance (available ${card.balancePaise}, requested ${amountPaise})`,
      );
    }

    const debited = await db.giftCard.updateMany({
      where: {
        id: card.id,
        tenantId,
        status: 'ACTIVE',
        balancePaise: { gte: BigInt(amountPaise) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { balancePaise: { decrement: BigInt(amountPaise) }, updatedBy: userId },
    });
    if (debited.count !== 1) {
      throw new BadRequestException('Gift card could not be debited (balance changed); retry');
    }

    const remaining = card.balancePaise - BigInt(amountPaise);
    if (remaining === 0n) {
      await db.giftCard.updateMany({
        where: { id: card.id, tenantId, balancePaise: 0n },
        data: { status: 'USED', updatedBy: userId },
      });
    }

    return this.mapToResponse({
      ...card,
      balancePaise: remaining,
      status: remaining === 0n ? 'USED' : card.status,
    });
  }

  private mapToResponse(card: {
    id: string;
    tenantId: string;
    cardNumber: string;
    balancePaise: bigint;
    initialValuePaise: bigint;
    customerId: string | null;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): GiftCardResponse {
    return {
      id: card.id,
      tenantId: card.tenantId,
      cardNumber: card.cardNumber,
      balancePaise: Number(card.balancePaise),
      initialValuePaise: Number(card.initialValuePaise),
      customerId: card.customerId,
      status: card.status as GiftCardStatus,
      expiresAt: card.expiresAt,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }
}
