import { describe, it, expect } from 'vitest';
import {
  buildCustomerInput,
  buildLeadInput,
  buildCampaignInput,
  normalizePhone,
  rupeesToPaise,
  customer360View,
  leadView,
  campaignView,
  fullName,
  orDash,
  isUuid,
  EMPTY_CUSTOMER_FORM,
  EMPTY_LEAD_FORM,
  EMPTY_CAMPAIGN_FORM,
} from '@/lib/crm-form';
import { LeadInputSchema, CampaignInputSchema } from '../../../../../packages/shared-types/src/crm';

describe('normalizePhone', () => {
  it('normalises Indian mobiles and keeps valid E.164', () => {
    expect(normalizePhone('98200 00001')).toBe('+919820000001');
    expect(normalizePhone('09820000001')).toBe('+919820000001');
    expect(normalizePhone('919820000001')).toBe('+919820000001');
    expect(normalizePhone('+919820000001')).toBe('+919820000001');
    expect(normalizePhone('+14155550123')).toBe('+14155550123');
  });
  it('rejects junk', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('buildCustomerInput', () => {
  it('requires first and last name', () => {
    const r = buildCustomerInput(EMPTY_CUSTOMER_FORM);
    expect(r.input).toBeNull();
    expect(r.errors.firstName).toBe('First name is required');
    expect(r.errors.lastName).toBe('Last name is required');
  });
  it('builds a trimmed payload with E.164 phone and drops blanks', () => {
    const r = buildCustomerInput({
      ...EMPTY_CUSTOMER_FORM, firstName: ' Asha ', lastName: 'Rao', phone: '9820000001', city: 'Pune', email: 'a@b.co',
    });
    expect(r.input).toEqual({
      firstName: 'Asha', lastName: 'Rao', phone: '+919820000001', email: 'a@b.co', city: 'Pune',
      customerType: 'RETAIL', country: 'IN',
    });
  });
  it('flags a bad phone and email', () => {
    const r = buildCustomerInput({ ...EMPTY_CUSTOMER_FORM, firstName: 'A', lastName: 'B', phone: '123', email: 'x' });
    expect(r.errors.phone).toBeTruthy();
    expect(r.errors.email).toBe('Enter a valid email address');
  });
});

describe('buildLeadInput', () => {
  it('requires names and builds a payload accepted by LeadInputSchema (paise, date)', () => {
    expect(buildLeadInput(EMPTY_LEAD_FORM).errors.firstName).toBeTruthy();
    const r = buildLeadInput({
      ...EMPTY_LEAD_FORM, firstName: 'Vikram', lastName: 'Shah', phone: '9820000002', estimatedValue: '26,148.50',
      source: 'REFERRAL', nextFollowUpDate: '2026-12-01', notes: ' call back ',
    });
    expect(r.input).toMatchObject({
      firstName: 'Vikram', lastName: 'Shah', phone: '+919820000002', source: 'REFERRAL',
      estimatedValuePaise: 2614850, notes: 'call back',
    });
    expect(LeadInputSchema.safeParse(r.input).success).toBe(true);
  });
  it('rejects a malformed value', () => {
    const r = buildLeadInput({ ...EMPTY_LEAD_FORM, firstName: 'A', lastName: 'B', estimatedValue: '12.345' });
    expect(r.errors.estimatedValue).toBeTruthy();
    expect(rupeesToPaise('0.5')).toBe(50);
    expect(rupeesToPaise('-1')).toBeNull();
  });
});

describe('buildCampaignInput', () => {
  const now = new Date('2026-11-17T10:00:00');
  it('requires a name and a future schedule', () => {
    expect(buildCampaignInput(EMPTY_CAMPAIGN_FORM, now).errors.name).toBeTruthy();
    const past = buildCampaignInput({ ...EMPTY_CAMPAIGN_FORM, name: 'X', scheduledAt: '2026-11-01T10:00' }, now);
    expect(past.errors.scheduledAt).toBe('Schedule time must be in the future');
  });
  it('builds a payload accepted by CampaignInputSchema', () => {
    const r = buildCampaignInput(
      { ...EMPTY_CAMPAIGN_FORM, name: 'Diwali', channel: 'EMAIL', scheduledAt: '2026-12-01T10:00', customerType: 'RETAIL', city: 'Mumbai' },
      now,
    );
    expect(r.input).toMatchObject({ name: 'Diwali', channel: 'EMAIL', audienceFilter: { customerType: ['RETAIL'], city: ['Mumbai'] } });
    expect(CampaignInputSchema.safeParse(r.input).success).toBe(true);
  });
  it('allows an unscheduled draft', () => {
    const r = buildCampaignInput({ ...EMPTY_CAMPAIGN_FORM, name: 'Draft' }, now);
    expect(r.input).not.toBeNull();
    expect((r.input as Record<string, unknown>).scheduledAt).toBeUndefined();
  });
});

describe('readers for real API shapes', () => {
  it('customer360View reads profile/loyalty/purchaseHistory', () => {
    const v = customer360View({
      profile: { firstName: 'Priya', lastName: 'Sharma', phone: '+919820000001', city: 'Mumbai' },
      loyalty: { currentPoints: 40, tier: 'GOLD' },
      purchaseHistory: [{ totalPaise: 300 }, { totalPaise: 101 }],
    });
    expect(v.name).toBe('Priya Sharma');
    expect(v.totalSpentPaise).toBe(401);
    expect(v.totalOrders).toBe(2);
    expect(v.averageTicketPaise).toBe(201);
    expect(v.loyaltyPoints).toBe(40);
    expect(v.loyaltyTier).toBe('GOLD');
  });
  it('customer360View tolerates an empty customer', () => {
    const v = customer360View({ profile: { firstName: 'A', lastName: 'B' } });
    expect(v.totalOrders).toBe(0);
    expect(v.averageTicketPaise).toBe(0);
  });
  it('leadView builds the name from firstName/lastName and parses string paise', () => {
    expect(leadView({ firstName: 'Sanjay', lastName: 'Malhotra', estimatedValuePaise: '2614800' })).toEqual({
      name: 'Sanjay Malhotra', estimatedValuePaise: 2614800,
    });
    expect(leadView({ firstName: 'A', lastName: 'B', estimatedValuePaise: null }).estimatedValuePaise).toBeNull();
    expect(leadView({ customer: { firstName: 'Linked', lastName: 'Cust' } }).name).toBe('Linked Cust');
  });
  it('campaignView reads totalRecipients and counts', () => {
    const v = campaignView({ totalRecipients: 876, sentCount: 1, deliveredCount: 2, failedCount: 0, template: null });
    expect(v).toMatchObject({ audience: 876, sent: 1, delivered: 2, failed: 0, templateName: null });
  });
  it('small helpers', () => {
    expect(fullName({ firstName: 'A' })).toBe('A');
    expect(orDash(null)).toBe('-');
    expect(orDash('  ')).toBe('-');
    expect(orDash(0)).toBe('0');
    expect(isUuid('6ecfac52-f967-41a6-a76c-1abd8712078e')).toBe(true);
    expect(isUuid('new')).toBe(false);
  });
});
