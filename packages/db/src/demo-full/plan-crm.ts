/** CRM planner: customers, KYC, loyalty, leads, campaigns, feedback, referrals, consultations. */
import {
  CITIES, FIRST_NAMES, LAST_NAMES, PhoneBook, Rng, addDays, daysAgoAt, eid, emailFor, fakeAadhaar, fakeGstin,
  fakePan, pickCity, type CityInfo, type DemoContext, type ModulePlan, type Row, type TablePlan,
} from './common';

export interface DemoCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: CityInfo;
  type: 'RETAIL' | 'WHOLESALE' | 'CORPORATE';
  kyc: boolean;
  pan: string | null;
  aadhaar: string | null;
  gstin: string | null;
  createdDaysAgo: number;
}

export const CUSTOMER_COUNT = 45;
export const KYC_COUNT = 15;

export function planCustomers(ctx: DemoContext): DemoCustomer[] {
  const rng = new Rng(`${ctx.tenantId}:customers`);
  const phones = new PhoneBook(new Rng(`${ctx.tenantId}:phones`));
  const names = new Set<string>();
  const out: DemoCustomer[] = [];
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    let first: string;
    let last: string;
    do {
      first = FIRST_NAMES[(i * 7 + rng.int(0, 49)) % FIRST_NAMES.length]!;
      last = rng.pick(LAST_NAMES);
    } while (names.has(`${first} ${last}`) || (first === 'Priya' && last === 'Sharma'));
    names.add(`${first} ${last}`);
    const type = i >= 41 ? 'CORPORATE' : i >= 37 ? 'WHOLESALE' : 'RETAIL';
    const kyc = i % 3 === 0 && i / 3 < KYC_COUNT;
    const city = i < 30 ? pickCity(rng) : CITIES[i % CITIES.length]!;
    out.push({
      id: eid(ctx, 'customer', i),
      firstName: first,
      lastName: last,
      email: emailFor(first, last, i + 1),
      phone: phones.next(),
      city,
      type,
      kyc,
      pan: kyc || type !== 'RETAIL' ? fakePan(rng, type === 'RETAIL' ? 'P' : 'C', last[0]!) : null,
      aadhaar: kyc ? fakeAadhaar(rng) : null,
      gstin: null,
      createdDaysAgo: rng.int(10, 400),
    });
    const c = out[i]!;
    if (type !== 'RETAIL') c.gstin = fakeGstin(city.stateCode, c.pan!, 1);
  }
  return out;
}

export interface SaleRef {
  saleId: string;
  totalPaise: bigint;
  date: Date;
}

const TIERS = [
  { name: 'Silver', minPoints: 0, multiplier: 1, benefits: ['Birthday offer'] },
  { name: 'Gold', minPoints: 1500, multiplier: 1.25, benefits: ['Birthday offer', '5% off making charges'] },
  { name: 'Platinum', minPoints: 4000, multiplier: 1.5, benefits: ['Birthday offer', '10% off making charges', 'Priority service'] },
];

export function tierFor(points: number): string {
  return [...TIERS].reverse().find((t) => points >= t.minPoints)!.name;
}

export function planCrm(
  ctx: DemoContext,
  customers: DemoCustomer[],
  salesByCustomer: Map<string, SaleRef[]>,
  /** Earliest dated activity of each customer in ANY other module (planAll derives it). */
  firstActivity: Map<string, Date> = new Map(),
): ModulePlan {
  const rng = new Rng(`${ctx.tenantId}:crm`);
  const { now } = ctx;
  const t: Record<string, Row[]> = {};
  const add = (m: string, r: Row) => (t[m] ??= []).push(r);
  const admin = ctx.adminUserId;
  const programId = eid(ctx, 'loyalty-program', 1);
  add('loyaltyProgram', {
    id: programId, tenantId: ctx.tenantId, name: 'Gold Club Rewards', pointsPerCurrencyUnit: 1, redemptionRate: 1,
    tiers: TIERS, isActive: true, createdBy: admin,
  });

  const createdById = new Map<string, Date>();
  customers.forEach((c, i) => {
    const sales = (salesByCustomer.get(c.id) ?? []).slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    // A customer exists before their first transaction anywhere (sale, order, invoice, loan ...).
    let created = daysAgoAt(now, c.createdDaysAgo, 11);
    const firstTx = [firstActivity.get(c.id), sales[0]?.date].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
    if (firstTx && created.getTime() >= firstTx.getTime() - 86_400_000) created = new Date(firstTx.getTime() - (2 + (i % 19)) * 86_400_000);
    let balance = 100;
    const txs: Row[] = [{
      id: eid(ctx, 'loyalty-tx', `${i}-welcome`), tenantId: ctx.tenantId, customerId: c.id, transactionType: 'BONUS',
      points: 100, balanceAfter: 100, description: 'Welcome bonus', createdAt: created, createdBy: admin,
    }];
    sales.forEach((s, j) => {
      const pts = Number(s.totalPaise / 10000n);
      if (pts <= 0) return;
      balance += pts;
      txs.push({
        id: eid(ctx, 'loyalty-tx', `${i}-${j}`), tenantId: ctx.tenantId, customerId: c.id, transactionType: 'EARNED',
        points: pts, balanceAfter: balance, referenceType: 'SALE', referenceId: s.saleId,
        description: 'Points earned on purchase', createdAt: s.date, createdBy: admin,
      });
    });
    for (const tx of txs) add('loyaltyTransaction', tx);
    createdById.set(c.id, created);
    const bd = new Date(1970 + rng.int(18, 40), rng.int(0, 11), rng.int(1, 28));
    add('customer', {
      id: c.id, tenantId: ctx.tenantId, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
      address: `${rng.int(1, 240)}, ${rng.pick(['MG Road', 'Station Road', 'Park Street', 'Lake View Colony', 'Gandhi Nagar'])}`,
      city: c.city.city, state: c.city.state, country: 'IN', postalCode: c.city.pin, customerType: c.type,
      loyaltyPoints: balance, loyaltyTier: tierFor(balance), panNumber: c.pan, aadhaarNumber: c.aadhaar, gstinNumber: c.gstin,
      dateOfBirth: bd, anniversary: i % 3 === 1 ? new Date(2000 + rng.int(0, 22), rng.int(0, 11), rng.int(1, 28)) : null,
      preferences: { notifications: { whatsapp: true, sms: i % 2 === 0 }, demo: true }, notes: 'Demo customer',
      createdAt: created, createdBy: admin,
    });
    if (c.kyc) {
      for (const [type, doc] of [['PAN', c.pan], ['AADHAAR', c.aadhaar]] as const) {
        add('kycVerification', {
          id: eid(ctx, 'kyc', `${i}-${type}`), tenantId: ctx.tenantId, customerId: c.id, verificationType: type,
          documentNumber: doc, verificationStatus: 'VERIFIED', verifiedAt: addDays(created, 1), verifiedBy: admin,
          notes: 'Demo seed: fake identifier, not a real document', createdAt: created,
        });
      }
    } else if (i % 5 === 2) {
      add('kycVerification', {
        id: eid(ctx, 'kyc', `${i}-PAN`), tenantId: ctx.tenantId, customerId: c.id, verificationType: 'PAN',
        documentNumber: fakePan(rng, 'P', c.lastName[0]!), verificationStatus: i % 10 === 2 ? 'PENDING' : 'FAILED',
        notes: 'Demo seed: fake identifier, not a real document', createdAt: created,
      });
    }
    if (i < 20) {
      const occ = i % 2 === 0 ? 'BIRTHDAY' : 'ANNIVERSARY';
      add('customerOccasion', {
        id: eid(ctx, 'occasion', i), tenantId: ctx.tenantId, customerId: c.id, occasionType: occ,
        date: addDays(now, rng.int(3, 120)), description: `${occ.toLowerCase()} reminder`, reminderDaysBefore: 7,
      });
    }
    if (i < 24) {
      add('customerInteraction', {
        id: eid(ctx, 'interaction', i), tenantId: ctx.tenantId, customerId: c.id,
        interactionType: rng.pick(['CALL', 'WHATSAPP', 'VISIT', 'EMAIL', 'NOTE']), direction: rng.pick(['INBOUND', 'OUTBOUND']),
        subject: rng.pick(['Wedding set enquiry', 'Rate enquiry', 'Repair follow-up', 'Scheme query', 'Diwali offers']),
        content: 'Discussed requirements and shared catalogue options.', userId: admin,
        createdAt: new Date(Math.min(now.getTime(), Math.max(daysAgoAt(now, rng.int(1, 60), 15).getTime(), created.getTime() + 86_400_000))),
      });
    }
  });

  // notification templates
  const tpls = [
    ['Order confirmation', 'EMAIL', 'Your order {{orderNumber}} is confirmed', 'Dear {{name}}, thank you for shopping with us. Order {{orderNumber}} is confirmed.', 'TRANSACTIONAL'],
    ['Payment received (SMS)', 'SMS', null, 'Thank you {{name}}, we received Rs {{amount}}. Ref {{reference}}.', 'TRANSACTIONAL'],
    ['Birthday wishes', 'WHATSAPP', null, 'Happy birthday {{name}}! Enjoy a special offer on making charges this month.', 'PROMOTIONAL'],
    ['Festive offer', 'EMAIL', 'Festive jewellery offers', 'Dear {{name}}, explore our new festive collection with offers on making charges.', 'PROMOTIONAL'],
    ['Scheme instalment reminder', 'SMS', null, 'Dear {{name}}, your gold scheme instalment of Rs {{amount}} is due on {{dueDate}}.', 'REMINDER'],
    ['Repair ready', 'WHATSAPP', null, 'Hello {{name}}, your repair {{repairNumber}} is ready for pickup.', 'REMINDER'],
  ] as const;
  const tplIds = tpls.map((_, i) => eid(ctx, 'notif-template', i));
  tpls.forEach(([name, channel, subject, body, category], i) => {
    add('notificationTemplate', {
      id: tplIds[i], tenantId: ctx.tenantId, name, channel, subject, body, variables: ['name', 'amount', 'orderNumber'], category,
      isActive: true, createdBy: admin,
    });
  });

  // campaigns
  const camp = [
    ['Diwali Gold Offer', 'WHATSAPP', 'COMPLETED', 3, 52, 400],
    ['Wedding Season Preview', 'EMAIL', 'ACTIVE', 3, 41, 1],
    ['Akshaya Tritiya Early Access', 'SMS', 'SCHEDULED', 1, 0, 0],
    ['Birthday Month Greetings', 'WHATSAPP', 'COMPLETED', 2, 22, 300],
    ['New Diamond Collection', 'EMAIL', 'DRAFT', 3, 0, 0],
  ] as const;
  camp.forEach(([name, channel, status, tplIdx, daysBack, total], i) => {
    const sent = status === 'COMPLETED' ? total : status === 'ACTIVE' ? 0 : 0;
    const activeTotal = status === 'ACTIVE' ? 180 : total;
    const sentCount = status === 'ACTIVE' ? 120 : sent;
    const delivered = Math.floor(sentCount * 0.94);
    const start = daysAgoAt(now, daysBack, 10);
    add('campaign', {
      id: eid(ctx, 'campaign', i), tenantId: ctx.tenantId, name, description: `Demo campaign: ${name}`, status, channel,
      templateId: tplIds[tplIdx], audienceFilter: { loyaltyTier: i % 2 === 0 ? ['Gold', 'Platinum'] : ['Silver', 'Gold'], city: 'Mumbai' },
      scheduledAt: status === 'DRAFT' ? null : status === 'SCHEDULED' ? addDays(now, 9) : start,
      startedAt: status === 'COMPLETED' || status === 'ACTIVE' ? start : null,
      completedAt: status === 'COMPLETED' ? addDays(start, 1) : null,
      totalRecipients: activeTotal, sentCount, deliveredCount: delivered, failedCount: sentCount - delivered, createdBy: admin,
      createdAt: addDays(start, -2),
    });
    if (status === 'COMPLETED') {
      for (let k = 0; k < 8; k++) {
        const c = customers[(i * 8 + k) % customers.length]!;
        const failed = k === 7;
        const sentOn = new Date(Math.min(now.getTime(), Math.max(start.getTime(), (createdById.get(c.id) ?? start).getTime() + 86_400_000)));
        add('notificationLog', {
          id: eid(ctx, 'notif-log', `${i}-${k}`), tenantId: ctx.tenantId, customerId: c.id, templateId: tplIds[tplIdx], channel,
          subject: (channel as string) === 'EMAIL' ? name : null, body: `Hello ${c.firstName}, ${name}.`, status: failed ? 'FAILED' : 'DELIVERED',
          sentAt: sentOn, deliveredAt: failed ? null : sentOn, failureReason: failed ? 'Number not reachable' : null, createdAt: sentOn,
        });
      }
    }
  });

  // segments
  const segs = [['High value customers', { minLifetimeSpendPaise: 50000000 }], ['Birthdays this month', { occasion: 'BIRTHDAY' }], ['Dormant 90 days', { lastPurchaseDaysAgo: 90 }]] as const;
  segs.forEach(([name, criteria], i) => add('customerSegment', {
    id: eid(ctx, 'segment', i), tenantId: ctx.tenantId, name, description: name, criteria, customerCount: 8 + i * 5,
    lastCalculatedAt: daysAgoAt(now, 1, 6), createdBy: admin,
  }));

  // leads in every pipeline stage
  const stages = ['NEW', 'NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'CONTACTED', 'QUALIFIED', 'QUALIFIED', 'QUALIFIED', 'PROPOSAL', 'PROPOSAL', 'PROPOSAL', 'NEGOTIATION', 'NEGOTIATION', 'WON', 'WON', 'WON', 'LOST', 'LOST', 'LOST'] as const;
  stages.forEach((status, i) => {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const created = daysAgoAt(now, rng.int(2, 75), 12);
    const open = status !== 'WON' && status !== 'LOST';
    const id = eid(ctx, 'lead', i);
    add('lead', {
      id, tenantId: ctx.tenantId, customerId: status === 'WON' ? customers[i % customers.length]!.id : null, firstName: first, lastName: last,
      phone: `+9170${rng.int(10000000, 99999999)}`, email: emailFor(first, last, 100 + i),
      source: rng.pick(['WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'CAMPAIGN', 'OTHER']), status, assignedTo: admin,
      estimatedValuePaise: BigInt(rng.int(30, 600) * 100000), notes: rng.pick(['Bridal set for February wedding', 'Looking for diamond solitaire', 'Gold coins for gifting', 'Mangalsutra and bangles']),
      nextFollowUpDate: open ? addDays(now, rng.int(1, 14)) : null, lostReason: status === 'LOST' ? rng.pick(['Went with another jeweller', 'Budget too low', 'Postponed purchase']) : null,
      createdAt: created, createdBy: admin,
    });
    for (let a = 0; a < (i % 3) + 1; a++) {
      add('leadActivity', {
        id: eid(ctx, 'lead-activity', `${i}-${a}`), tenantId: ctx.tenantId, leadId: id, activityType: rng.pick(['CALL', 'MEETING', 'EMAIL', 'NOTE', 'FOLLOW_UP']),
        description: 'Discussed budget and design preferences.', completedAt: addDays(created, a + 1), userId: admin, createdAt: addDays(created, a + 1),
      });
    }
  });

  // feedback for customers with purchases
  let fb = 0;
  for (const c of customers) {
    const s = salesByCustomer.get(c.id)?.[0];
    if (!s || fb >= 12) continue;
    add('feedback', {
      id: eid(ctx, 'feedback', fb), tenantId: ctx.tenantId, customerId: c.id, feedbackType: rng.pick(['PURCHASE', 'SERVICE', 'GENERAL', 'REPAIR']),
      rating: rng.int(3, 5), comment: rng.pick(['Lovely designs and helpful staff.', 'Billing was quick, finishing is excellent.', 'Good value on making charges.', 'Would like more lightweight options.']),
      saleId: s.saleId, status: fb % 3 === 0 ? 'NEW' : fb % 3 === 1 ? 'REVIEWED' : 'ACTIONED',
      reviewedBy: fb % 3 === 0 ? null : admin, reviewedAt: fb % 3 === 0 ? null : addDays(s.date, 3), createdAt: addDays(s.date, 2),
    });
    fb++;
  }

  // referrals
  const refProgramId = eid(ctx, 'referral-program', 1);
  add('referralProgram', {
    id: refProgramId, tenantId: ctx.tenantId, name: 'Refer a friend', referrerRewardType: 'POINTS', referrerRewardValue: 500,
    refereeRewardType: 'POINTS', refereeRewardValue: 250, minOrderForRewardPaise: 2500000n, maxReferralsPerCustomer: 10, isActive: true,
    validFrom: daysAgoAt(now, 120, 9), createdBy: admin,
  });
  for (let k = 0; k < 6; k++) {
    const owner = customers[k * 2]!;
    const codeId = eid(ctx, 'referral-code', k);
    add('referralCode', {
      id: codeId, tenantId: ctx.tenantId, customerId: owner.id, programId: refProgramId, code: `REF${owner.firstName.slice(0, 3).toUpperCase()}${eid(ctx, 'rc', k).slice(0, 4).toUpperCase()}`,
      usageCount: k < 5 ? 1 : 0, totalRewardsEarnedPaise: 0n, isActive: true,
    });
    if (k < 5) {
      const referee = customers[k * 2 + 1]!;
      const rewarded = k < 3;
      const refId = eid(ctx, 'referral', k);
      add('referral', {
        id: refId, tenantId: ctx.tenantId, referralCodeId: codeId, referrerId: owner.id, refereeId: referee.id,
        status: rewarded ? 'REWARDED' : k === 3 ? 'REGISTERED' : 'INVITED', referrerRewardPaise: 0n, refereeRewardPaise: 0n,
        rewardedAt: rewarded ? daysAgoAt(now, 10 + k, 12) : null, invitedVia: rng.pick(['WHATSAPP', 'LINK', 'SMS']), createdAt: daysAgoAt(now, 30 + k, 12),
      });
      if (rewarded) {
        add('referralPayout', {
          id: eid(ctx, 'referral-payout', k), tenantId: ctx.tenantId, referralId: refId, customerId: owner.id, payoutType: 'LOYALTY_POINTS', amount: 500,
          status: 'CREDITED', creditedAt: daysAgoAt(now, 10 + k, 12),
        });
      }
    }
  }

  // video consultations
  const vc = ['REQUESTED', 'SCHEDULED', 'SCHEDULED', 'COMPLETED', 'COMPLETED'];
  vc.forEach((status, i) => {
    const c = customers[i + 10]!;
    const req = daysAgoAt(now, 12 - i * 2, 11);
    const sched = status === 'REQUESTED' ? null : status === 'SCHEDULED' ? addDays(now, i + 1) : addDays(req, 1);
    add('videoConsultation', {
      id: eid(ctx, 'consultation', i), tenantId: ctx.tenantId, customerId: c.id, consultantId: admin, requestedAt: req, scheduledAt: sched,
      startedAt: status === 'COMPLETED' ? sched : null, endedAt: status === 'COMPLETED' && sched ? new Date(sched.getTime() + 25 * 60000) : null,
      status, meetingUrl: `https://meet.example.com/demo-${i}`, customerPhone: c.phone, preferredLang: rng.pick(['en', 'hi', 'mr']),
      notes: status === 'COMPLETED' ? 'Shown bridal necklace sets on video.' : null,
    });
  });

  const order = ['loyaltyProgram', 'customer', 'kycVerification', 'customerOccasion', 'customerInteraction', 'loyaltyTransaction',
    'notificationTemplate', 'campaign', 'notificationLog', 'customerSegment', 'lead', 'leadActivity', 'feedback', 'referralProgram',
    'referralCode', 'referral', 'referralPayout', 'videoConsultation'];
  const tables: TablePlan[] = order.filter((m) => t[m]).map((m) => ({ model: m, rows: t[m]! }));
  return { name: 'crm', sentinel: { model: 'loyaltyProgram', id: programId }, tables, stockDeltas: [] };
}
