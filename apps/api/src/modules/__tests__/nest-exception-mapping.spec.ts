import { describe, it, expect } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AmlAlertService } from '../aml/aml.alert.service';
import { AmlService } from '../aml/aml.service';
import { CrmLoyaltyService } from '../crm/crm.loyalty.service';
import { CrmCampaignService } from '../crm/crm.campaign.service';
import { CrmFeedbackService } from '../crm/crm.feedback.service';
import { CrmLeadService } from '../crm/crm.lead.service';
import { CrmNotificationService } from '../crm/crm.notification.service';
import { CrmService } from '../crm/crm.service';
import { ReferralService } from '../referral/referral.service';
import { CouponService } from '../b2c-features/coupon.service';
import { ChatbotKnowledgeService } from '../chatbot/chatbot.knowledge.service';

/**
 * Client-caused service errors must be Nest HttpExceptions (so the tRPC error
 * middleware maps them to NOT_FOUND / BAD_REQUEST / CONFLICT instead of a 500).
 */
const nullFinder = () => ({ findFirst: async () => null, findUnique: async () => null });
const prismaOf = (...models: string[]) =>
  Object.fromEntries(models.map((m) => [m, nullFinder()])) as never;
const found = (row: unknown) => ({ findFirst: async () => row, findUnique: async () => row });

async function expectErr(p: Promise<unknown>, cls: new (...a: never[]) => Error, msg: string) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(cls);
  expect((err as Error).message).toContain(msg);
}

describe('NotFoundException conversions (replace findFirstOrThrow / plain Error)', () => {
  it('AmlAlertService.getAlert', async () => {
    const s = new AmlAlertService(prismaOf('amlAlert'), {} as never);
    await expectErr(s.getAlert('t1', 'x'), NotFoundException, 'Aml alert not found');
  });
  it('AmlService.getRule', async () => {
    const s = new AmlService(prismaOf('amlRule'), {} as never);
    await expectErr(s.getRule('t1', 'x'), NotFoundException, 'Aml rule not found');
  });
  it('CrmFeedbackService.getFeedback', async () => {
    const s = new CrmFeedbackService(prismaOf('feedback'));
    await expectErr(s.getFeedback('t1', 'x'), NotFoundException, 'Feedback not found');
  });
  it('CrmLeadService.getLead', async () => {
    const s = new CrmLeadService(prismaOf('lead'));
    await expectErr(s.getLead('t1', 'x'), NotFoundException, 'Lead not found');
  });
  it('CrmCampaignService.getCampaign', async () => {
    const s = new CrmCampaignService(prismaOf('campaign'), {} as never);
    await expectErr(s.getCampaign('t1', 'x'), NotFoundException, 'Campaign not found');
  });
  it('CrmNotificationService.getTemplate', async () => {
    const s = new CrmNotificationService(
      prismaOf('notificationTemplate'),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expectErr(s.getTemplate('t1', 'x'), NotFoundException, 'Notification template not found');
  });
  it('CrmService.getCustomer360', async () => {
    const s = new CrmService(prismaOf('customer'));
    await expectErr(s.getCustomer360('t1', 'x'), NotFoundException, 'Customer not found');
  });
  it('ReferralService.getProgram', async () => {
    const s = new ReferralService(prismaOf('referralProgram'), {} as never);
    await expectErr(s.getProgram('t1', 'x'), NotFoundException, 'Referral program not found');
  });
  it('CouponService.getCoupon', async () => {
    const s = new CouponService(prismaOf('couponCode'), {} as never);
    await expectErr(s.getCoupon('t1', 'x'), NotFoundException, 'Coupon code not found');
  });
  it('ChatbotKnowledgeService.updateFaq', async () => {
    const s = new ChatbotKnowledgeService(prismaOf('chatFaq'));
    await expectErr(s.updateFaq('t1', 'x', {}), NotFoundException, 'Chat faq not found');
  });
  it('ReferralService.applyReferral with unknown code', async () => {
    const s = new ReferralService(prismaOf('referralCode'), {} as never);
    await expectErr(
      s.applyReferral('t1', 'cust', 'NOPE'),
      NotFoundException,
      'Invalid or inactive referral code',
    );
  });
});

describe('BadRequestException / ConflictException conversions (replace plain Error)', () => {
  it('CrmLoyaltyService.earnPoints rejects non-positive points', async () => {
    const s = new CrmLoyaltyService(prismaOf('customer'), {} as never);
    await expectErr(
      s.earnPoints('t1', 'u1', 'c1', 0, 'INVOICE', 'i1'),
      BadRequestException,
      'Points to earn must be positive',
    );
  });
  it('CrmLoyaltyService.redeemPoints rejects non-positive points', async () => {
    const s = new CrmLoyaltyService(prismaOf('customer'), {} as never);
    await expectErr(
      s.redeemPoints('t1', 'u1', 'c1', -5, 'INVOICE', 'i1'),
      BadRequestException,
      'Points to redeem must be positive',
    );
  });
  it('AmlAlertService.reviewAlert rejects wrong status', async () => {
    const s = new AmlAlertService(
      { amlAlert: found({ id: 'a', status: 'CLOSED' }) } as never,
      {} as never,
    );
    await expectErr(
      s.reviewAlert('t1', 'u1', 'a'),
      BadRequestException,
      'Alert cannot be reviewed in status: CLOSED',
    );
  });
  it('CrmCampaignService.executeCampaign requires a template', async () => {
    const s = new CrmCampaignService(
      { campaign: found({ id: 'c', templateId: null }) } as never,
      {} as never,
    );
    await expectErr(
      s.executeCampaign('t1', 'u1', 'c'),
      BadRequestException,
      'Campaign must have a template assigned',
    );
  });
  it('ReferralService.creditPayout conflicts when already credited', async () => {
    const s = new ReferralService(
      { referralPayout: found({ id: 'p', status: 'CREDITED' }) } as never,
      {} as never,
    );
    await expectErr(s.creditPayout('t1', 'u1', 'p'), ConflictException, 'Payout is already CREDITED');
  });
  it('ReferralService.completeReferral conflicts when already rewarded', async () => {
    const s = new ReferralService(
      { referral: found({ id: 'r', status: 'REWARDED' }) } as never,
      {} as never,
    );
    await expectErr(
      s.completeReferral('t1', 'r', 'o1', 100n),
      ConflictException,
      'Referral has already been rewarded',
    );
  });
});
