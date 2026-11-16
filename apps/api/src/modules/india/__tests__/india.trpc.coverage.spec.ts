import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GirviInterestType,
  GirviLoanStatus,
  GirviPaymentMethod,
  GirviPaymentType,
  KittySchemeType,
  KycVerificationType,
  MetalRateSource,
} from '@caratflow/shared-types';
import { TrpcService } from '../../../trpc/trpc.service';
import { IndiaTrpcRouter } from '../india.trpc';

describe('IndiaTrpcRouter (procedure coverage)', () => {
  const trpc = new TrpcService();

  const girviService = {
    getDashboard: vi.fn(),
    createLoan: vi.fn(),
    getLoan: vi.fn(),
    listLoans: vi.fn(),
    accrueInterest: vi.fn(),
    recordPayment: vi.fn(),
    closeLoan: vi.fn(),
    markDefaulted: vi.fn(),
    scheduleAuction: vi.fn(),
    recordAuctionResult: vi.fn(),
    cancelAuction: vi.fn(),
    listAuctions: vi.fn(),
  };
  const schemeService = {
    createKittyScheme: vi.fn(),
    getKittyScheme: vi.fn(),
    listKittySchemes: vi.fn(),
    enrollKittyMember: vi.fn(),
    recordKittyInstallment: vi.fn(),
    matureKittyScheme: vi.fn(),
    createGoldSavingsScheme: vi.fn(),
    getGoldSavingsScheme: vi.fn(),
    listGoldSavingsSchemes: vi.fn(),
    enrollGoldSavingsMember: vi.fn(),
    recordGoldSavingsInstallment: vi.fn(),
    calculateMaturityValue: vi.fn(),
    redeemGoldSavings: vi.fn(),
  };
  const ratesService = {
    recordRate: vi.fn(),
    getCurrentRate: vi.fn(),
    getAllCurrentRates: vi.fn(),
    getHistoricalRates: vi.fn(),
  };
  const kycService = {
    recordDocument: vi.fn(),
    verifyDocument: vi.fn(),
    getCustomerKycStatus: vi.fn(),
    isKycComplete: vi.fn(),
    getExpiringVerifications: vi.fn(),
    getPendingCount: vi.fn(),
    verifyAadhaar: vi.fn(),
    verifyPan: vi.fn(),
    requestAadhaarOtp: vi.fn(),
    confirmAadhaarOtp: vi.fn(),
    listVerifications: vi.fn(),
  };
  const paymentService = {
    generateUpiQrData: vi.fn(),
    generateBankTransferTemplate: vi.fn(),
  };
  const ratePoller = {
    refreshNow: vi.fn(),
  };

  const routerInstance = new IndiaTrpcRouter(
    trpc,
    girviService as never,
    schemeService as never,
    ratesService as never,
    kycService as never,
    paymentService as never,
    ratePoller as never,
  );

  const staffCtx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };
  const caller = routerInstance.router.createCaller(staffCtx);

  // Valid RFC 9562 v4 UUIDs (Zod 4 strictly validates version and variant digits)
  const CUSTOMER_ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const LOCATION_ID = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
  const LOAN_ID = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
  const AUCTION_ID = '1c2d3e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
  const SCHEME_ID = '2d3e4f5a-6b7c-4d8e-8f9a-1b2c3d4e5f6a';
  const MEMBER_ID = '3e4f5a6b-7c8d-4e9f-9a0b-2c3d4e5f6a7b';
  const VERIFICATION_ID = '4f5a6b7c-8d9e-4f0a-8b1c-3d4e5f6a7b8c';

  const girviLoanInput = {
    customerId: CUSTOMER_ID,
    locationId: LOCATION_ID,
    collateralDescription: '22K gold necklace',
    metalType: 'GOLD',
    grossWeightMg: 10000,
    netWeightMg: 9000,
    purityFineness: 916,
    appraisedValuePaise: 5000000,
    loanAmountPaise: 3000000,
    interestRate: 1200,
    interestType: GirviInterestType.SIMPLE,
    disbursedDate: '2026-02-01',
    dueDate: '2026-08-01',
  };

  const kittySchemeInput = {
    schemeName: 'Diwali Kitty',
    schemeType: KittySchemeType.KITTY,
    monthlyAmountPaise: 100000,
    durationMonths: 11,
    startDate: '2026-01-01',
    maxMembers: 50,
  };

  const goldSavingsSchemeInput = {
    schemeName: 'Gold Saver Plus',
    monthlyAmountPaise: 100000,
    durationMonths: 11,
    bonusMonths: 1,
    maturityBonusPercent: 5,
    startDate: '2026-01-01',
  };

  const metalRateInput = {
    metalType: 'GOLD',
    purity: 916,
    ratePerGramPaise: 650000,
    ratePer10gPaise: 6500000,
    ratePerTolaPaise: 7580000,
    ratePerTroyOzPaise: 20200000,
    source: MetalRateSource.MANUAL,
    recordedAt: '2026-11-01T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Girvi ──────────────────────────────────────────────
  describe('girvi', () => {
    it('dashboard delegates getDashboard with tenant', async () => {
      girviService.getDashboard.mockResolvedValue({ activeLoans: 4 });
      const result = await caller.girvi.dashboard();
      expect(girviService.getDashboard).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ activeLoans: 4 });
    });

    it('create delegates createLoan with tenant, user and input', async () => {
      girviService.createLoan.mockResolvedValue({ id: LOAN_ID });
      const result = await caller.girvi.create(girviLoanInput);
      expect(girviService.createLoan).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ customerId: CUSTOMER_ID, loanAmountPaise: 3000000 }),
      );
      expect(result).toEqual({ id: LOAN_ID });
    });

    it('create rejects a loan with a non-positive loan amount', async () => {
      await expect(caller.girvi.create({ ...girviLoanInput, loanAmountPaise: 0 })).rejects.toThrow();
      expect(girviService.createLoan).not.toHaveBeenCalled();
    });

    it('getById delegates getLoan', async () => {
      girviService.getLoan.mockResolvedValue({ id: LOAN_ID });
      const result = await caller.girvi.getById({ id: LOAN_ID });
      expect(girviService.getLoan).toHaveBeenCalledWith('tenant-1', LOAN_ID);
      expect(result).toEqual({ id: LOAN_ID });
    });

    it('getById rejects a non-uuid id', async () => {
      await expect(caller.girvi.getById({ id: 'loan-1' })).rejects.toThrow();
    });

    it('list delegates listLoans with parsed filters', async () => {
      girviService.listLoans.mockResolvedValue({ items: [] });
      await caller.girvi.list({ status: GirviLoanStatus.ACTIVE, overdueOnly: true });
      expect(girviService.listLoans).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: GirviLoanStatus.ACTIVE, overdueOnly: true, page: 1 }),
      );
    });

    it('accrueInterest delegates with loanId', async () => {
      girviService.accrueInterest.mockResolvedValue({ interestPaise: 1000 });
      const result = await caller.girvi.accrueInterest({ loanId: LOAN_ID });
      expect(girviService.accrueInterest).toHaveBeenCalledWith('tenant-1', LOAN_ID);
      expect(result).toEqual({ interestPaise: 1000 });
    });

    it('recordPayment delegates with tenant, user and input and applies zero defaults', async () => {
      girviService.recordPayment.mockResolvedValue({ id: 'pay-1' });
      await caller.girvi.recordPayment({
        girviLoanId: LOAN_ID,
        paymentDate: '2026-03-01',
        paymentType: GirviPaymentType.INTEREST_ONLY,
        interestPaise: 20000,
        method: GirviPaymentMethod.CASH,
      });
      expect(girviService.recordPayment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ girviLoanId: LOAN_ID, interestPaise: 20000, principalPaise: 0 }),
      );
    });

    it('recordPayment rejects a negative principal', async () => {
      await expect(
        caller.girvi.recordPayment({
          girviLoanId: LOAN_ID,
          paymentDate: '2026-03-01',
          paymentType: GirviPaymentType.BOTH,
          principalPaise: -1,
          method: GirviPaymentMethod.UPI,
        }),
      ).rejects.toThrow();
    });

    it('closeLoan delegates closeLoan with tenant, user and loanId', async () => {
      girviService.closeLoan.mockResolvedValue({ status: 'CLOSED' });
      const result = await caller.girvi.closeLoan({ loanId: LOAN_ID });
      expect(girviService.closeLoan).toHaveBeenCalledWith('tenant-1', 'user-1', LOAN_ID);
      expect(result).toEqual({ status: 'CLOSED' });
    });

    it('markDefaulted delegates markDefaulted with tenant, user and loanId', async () => {
      girviService.markDefaulted.mockResolvedValue({ status: 'DEFAULTED' });
      const result = await caller.girvi.markDefaulted({ loanId: LOAN_ID });
      expect(girviService.markDefaulted).toHaveBeenCalledWith('tenant-1', 'user-1', LOAN_ID);
      expect(result).toEqual({ status: 'DEFAULTED' });
    });

    it('scheduleAuction delegates with tenant, user and input', async () => {
      girviService.scheduleAuction.mockResolvedValue({ id: AUCTION_ID });
      const result = await caller.girvi.scheduleAuction({
        girviLoanId: LOAN_ID,
        auctionDate: '2026-09-01',
        reservePricePaise: 4000000,
      });
      expect(girviService.scheduleAuction).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ girviLoanId: LOAN_ID, reservePricePaise: 4000000 }),
      );
      expect(result).toEqual({ id: AUCTION_ID });
    });

    it('recordAuctionResult delegates with tenant, user and input', async () => {
      girviService.recordAuctionResult.mockResolvedValue({ status: 'AUCTIONED' });
      const result = await caller.girvi.recordAuctionResult({
        auctionId: AUCTION_ID,
        soldPricePaise: 4200000,
        buyerName: 'Ravi Kumar',
      });
      expect(girviService.recordAuctionResult).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ auctionId: AUCTION_ID, buyerName: 'Ravi Kumar' }),
      );
      expect(result).toEqual({ status: 'AUCTIONED' });
    });

    it('recordAuctionResult rejects a missing buyer name', async () => {
      await expect(
        caller.girvi.recordAuctionResult({ auctionId: AUCTION_ID, soldPricePaise: 1, buyerName: '' }),
      ).rejects.toThrow();
    });

    it('cancelAuction delegates with tenant, user and auctionId', async () => {
      girviService.cancelAuction.mockResolvedValue({ status: 'CANCELLED' });
      const result = await caller.girvi.cancelAuction({ auctionId: AUCTION_ID });
      expect(girviService.cancelAuction).toHaveBeenCalledWith('tenant-1', 'user-1', AUCTION_ID);
      expect(result).toEqual({ status: 'CANCELLED' });
    });

    it('listAuctions forwards status when supplied', async () => {
      girviService.listAuctions.mockResolvedValue([]);
      await caller.girvi.listAuctions({ status: 'SCHEDULED' });
      expect(girviService.listAuctions).toHaveBeenCalledWith('tenant-1', 'SCHEDULED');
    });

    it('listAuctions passes undefined status when input is omitted', async () => {
      girviService.listAuctions.mockResolvedValue([]);
      await caller.girvi.listAuctions();
      expect(girviService.listAuctions).toHaveBeenCalledWith('tenant-1', undefined);
    });
  });

  // ─── Schemes ────────────────────────────────────────────
  describe('schemes.kitty', () => {
    it('create delegates createKittyScheme with tenant, user and input', async () => {
      schemeService.createKittyScheme.mockResolvedValue({ id: SCHEME_ID });
      const result = await caller.schemes.kitty.create(kittySchemeInput);
      expect(schemeService.createKittyScheme).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ schemeName: 'Diwali Kitty', durationMonths: 11 }),
      );
      expect(result).toEqual({ id: SCHEME_ID });
    });

    it('create rejects a duration above 120 months', async () => {
      await expect(
        caller.schemes.kitty.create({ ...kittySchemeInput, durationMonths: 121 }),
      ).rejects.toThrow();
    });

    it('getById delegates getKittyScheme', async () => {
      schemeService.getKittyScheme.mockResolvedValue({ id: SCHEME_ID });
      const result = await caller.schemes.kitty.getById({ id: SCHEME_ID });
      expect(schemeService.getKittyScheme).toHaveBeenCalledWith('tenant-1', SCHEME_ID);
      expect(result).toEqual({ id: SCHEME_ID });
    });

    it('list delegates listKittySchemes with parsed input', async () => {
      schemeService.listKittySchemes.mockResolvedValue({ items: [] });
      await caller.schemes.kitty.list({ search: 'diwali' });
      expect(schemeService.listKittySchemes).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ search: 'diwali', page: 1 }),
      );
    });

    it('enrollMember delegates enrollKittyMember', async () => {
      schemeService.enrollKittyMember.mockResolvedValue({ id: MEMBER_ID });
      const result = await caller.schemes.kitty.enrollMember({
        kittySchemeId: SCHEME_ID,
        customerId: CUSTOMER_ID,
        joinedDate: '2026-01-05',
      });
      expect(schemeService.enrollKittyMember).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ kittySchemeId: SCHEME_ID, customerId: CUSTOMER_ID }),
      );
      expect(result).toEqual({ id: MEMBER_ID });
    });

    it('recordInstallment delegates recordKittyInstallment with default late fee', async () => {
      schemeService.recordKittyInstallment.mockResolvedValue({ id: 'inst-1' });
      await caller.schemes.kitty.recordInstallment({
        kittyMemberId: MEMBER_ID,
        installmentNumber: 1,
        paidDate: '2026-02-01',
        amountPaise: 100000,
        method: GirviPaymentMethod.BANK_TRANSFER,
      });
      expect(schemeService.recordKittyInstallment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ kittyMemberId: MEMBER_ID, lateFeePaise: 0 }),
      );
    });

    it('mature delegates matureKittyScheme with tenant, user and schemeId', async () => {
      schemeService.matureKittyScheme.mockResolvedValue({ status: 'MATURED' });
      const result = await caller.schemes.kitty.mature({ schemeId: SCHEME_ID });
      expect(schemeService.matureKittyScheme).toHaveBeenCalledWith('tenant-1', 'user-1', SCHEME_ID);
      expect(result).toEqual({ status: 'MATURED' });
    });
  });

  describe('schemes.goldSavings', () => {
    it('create delegates createGoldSavingsScheme', async () => {
      schemeService.createGoldSavingsScheme.mockResolvedValue({ id: SCHEME_ID });
      const result = await caller.schemes.goldSavings.create(goldSavingsSchemeInput);
      expect(schemeService.createGoldSavingsScheme).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ schemeName: 'Gold Saver Plus', maturityBonusPercent: 5 }),
      );
      expect(result).toEqual({ id: SCHEME_ID });
    });

    it('create rejects a non-positive monthly amount', async () => {
      await expect(
        caller.schemes.goldSavings.create({ ...goldSavingsSchemeInput, monthlyAmountPaise: 0 }),
      ).rejects.toThrow();
    });

    it('getById delegates getGoldSavingsScheme', async () => {
      schemeService.getGoldSavingsScheme.mockResolvedValue({ id: SCHEME_ID });
      const result = await caller.schemes.goldSavings.getById({ id: SCHEME_ID });
      expect(schemeService.getGoldSavingsScheme).toHaveBeenCalledWith('tenant-1', SCHEME_ID);
      expect(result).toEqual({ id: SCHEME_ID });
    });

    it('list delegates listGoldSavingsSchemes', async () => {
      schemeService.listGoldSavingsSchemes.mockResolvedValue({ items: [] });
      await caller.schemes.goldSavings.list({ status: 'ACTIVE' as never });
      expect(schemeService.listGoldSavingsSchemes).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 1 }),
      );
    });

    it('enrollMember delegates enrollGoldSavingsMember', async () => {
      schemeService.enrollGoldSavingsMember.mockResolvedValue({ id: MEMBER_ID });
      const result = await caller.schemes.goldSavings.enrollMember({
        goldSavingsSchemeId: SCHEME_ID,
        customerId: CUSTOMER_ID,
        joinedDate: '2026-01-05',
      });
      expect(schemeService.enrollGoldSavingsMember).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ goldSavingsSchemeId: SCHEME_ID }),
      );
      expect(result).toEqual({ id: MEMBER_ID });
    });

    it('recordInstallment delegates recordGoldSavingsInstallment', async () => {
      schemeService.recordGoldSavingsInstallment.mockResolvedValue({ id: 'inst-2' });
      await caller.schemes.goldSavings.recordInstallment({
        goldSavingsMemberId: MEMBER_ID,
        installmentNumber: 2,
        paidDate: '2026-03-01',
        amountPaise: 100000,
        method: GirviPaymentMethod.UPI,
      });
      expect(schemeService.recordGoldSavingsInstallment).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ goldSavingsMemberId: MEMBER_ID, installmentNumber: 2 }),
      );
    });

    it('calculateMaturity passes the four numeric inputs positionally', async () => {
      schemeService.calculateMaturityValue.mockReturnValue({ maturityPaise: 1234567 });
      const result = await caller.schemes.goldSavings.calculateMaturity({
        monthlyAmountPaise: 100000,
        durationMonths: 11,
        bonusMonths: 1,
        maturityBonusPercent: 5,
      });
      expect(schemeService.calculateMaturityValue).toHaveBeenCalledWith(100000, 11, 1, 5);
      expect(result).toEqual({ maturityPaise: 1234567 });
    });

    it('calculateMaturity rejects negative bonus months', async () => {
      await expect(
        caller.schemes.goldSavings.calculateMaturity({
          monthlyAmountPaise: 100000,
          durationMonths: 11,
          bonusMonths: -1,
          maturityBonusPercent: 5,
        }),
      ).rejects.toThrow();
    });

    it('redeem delegates redeemGoldSavings with memberId', async () => {
      schemeService.redeemGoldSavings.mockResolvedValue({ status: 'REDEEMED' });
      const result = await caller.schemes.goldSavings.redeem({ memberId: MEMBER_ID });
      expect(schemeService.redeemGoldSavings).toHaveBeenCalledWith('tenant-1', 'user-1', MEMBER_ID);
      expect(result).toEqual({ status: 'REDEEMED' });
    });
  });

  // ─── Rates ──────────────────────────────────────────────
  describe('rates', () => {
    it('record delegates recordRate and applies the INR currency default', async () => {
      ratesService.recordRate.mockResolvedValue({ id: 'rate-1' });
      const result = await caller.rates.record(metalRateInput);
      expect(ratesService.recordRate).toHaveBeenCalledWith(
        expect.objectContaining({ metalType: 'GOLD', purity: 916, currencyCode: 'INR' }),
      );
      expect(result).toEqual({ id: 'rate-1' });
    });

    it('record rejects a non-positive rate', async () => {
      await expect(caller.rates.record({ ...metalRateInput, ratePerGramPaise: 0 })).rejects.toThrow();
      expect(ratesService.recordRate).not.toHaveBeenCalled();
    });

    it('getCurrent delegates getCurrentRate with metal type and purity', async () => {
      ratesService.getCurrentRate.mockResolvedValue({ ratePerGramPaise: 650000 });
      const result = await caller.rates.getCurrent({ metalType: 'GOLD', purity: 916 });
      expect(ratesService.getCurrentRate).toHaveBeenCalledWith('GOLD', 916);
      expect(result).toEqual({ ratePerGramPaise: 650000 });
    });

    it('getCurrent rejects a non-integer purity', async () => {
      await expect(caller.rates.getCurrent({ metalType: 'GOLD', purity: 91.6 })).rejects.toThrow();
    });

    it('getAll delegates getAllCurrentRates', async () => {
      ratesService.getAllCurrentRates.mockResolvedValue([{ metalType: 'GOLD' }]);
      const result = await caller.rates.getAll();
      expect(ratesService.getAllCurrentRates).toHaveBeenCalledWith();
      expect(result).toEqual([{ metalType: 'GOLD' }]);
    });

    it('getHistory delegates getHistoricalRates with the parsed query', async () => {
      ratesService.getHistoricalRates.mockResolvedValue([]);
      await caller.rates.getHistory({
        metalType: 'GOLD',
        purity: 916,
        dateRange: { from: '2026-01-01', to: '2026-06-30' },
      });
      expect(ratesService.getHistoricalRates).toHaveBeenCalledWith(
        expect.objectContaining({ metalType: 'GOLD', purity: 916, dateRange: expect.any(Object) }),
      );
    });

    it('refreshNow delegates to the rate poller with no metal filter', async () => {
      ratePoller.refreshNow.mockResolvedValue({ refreshed: true });
      const result = await caller.rates.refreshNow();
      expect(ratePoller.refreshNow).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ refreshed: true });
    });

    it('refreshNow forwards the requested metal type', async () => {
      ratePoller.refreshNow.mockResolvedValue({ refreshed: true });
      await caller.rates.refreshNow({ metalType: 'SILVER' });
      expect(ratePoller.refreshNow).toHaveBeenCalledWith('SILVER');
    });

    it('refreshNow rejects an unsupported metal type', async () => {
      await expect(caller.rates.refreshNow({ metalType: 'PLATINUM' as never })).rejects.toThrow();
    });
  });

  // ─── KYC ────────────────────────────────────────────────
  describe('kyc', () => {
    it('record delegates recordDocument with tenant, user and input', async () => {
      kycService.recordDocument.mockResolvedValue({ id: VERIFICATION_ID });
      const result = await caller.kyc.record({
        customerId: CUSTOMER_ID,
        verificationType: KycVerificationType.PAN,
        documentNumber: 'ABCDE1234F',
      });
      expect(kycService.recordDocument).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ customerId: CUSTOMER_ID, documentNumber: 'ABCDE1234F' }),
      );
      expect(result).toEqual({ id: VERIFICATION_ID });
    });

    it('record rejects an unknown verification type', async () => {
      await expect(
        caller.kyc.record({ customerId: CUSTOMER_ID, verificationType: 'SSN' as never, documentNumber: '1' }),
      ).rejects.toThrow();
    });

    it('verify delegates verifyDocument with tenant, user and input', async () => {
      kycService.verifyDocument.mockResolvedValue({ status: 'VERIFIED' });
      const result = await caller.kyc.verify({ verificationId: VERIFICATION_ID, status: 'VERIFIED' });
      expect(kycService.verifyDocument).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ verificationId: VERIFICATION_ID, status: 'VERIFIED' }),
      );
      expect(result).toEqual({ status: 'VERIFIED' });
    });

    it('verify rejects a status other than VERIFIED or FAILED', async () => {
      await expect(
        caller.kyc.verify({ verificationId: VERIFICATION_ID, status: 'PENDING' as never }),
      ).rejects.toThrow();
    });

    it('getStatus delegates getCustomerKycStatus', async () => {
      kycService.getCustomerKycStatus.mockResolvedValue({ isKycComplete: false });
      const result = await caller.kyc.getStatus({ customerId: CUSTOMER_ID });
      expect(kycService.getCustomerKycStatus).toHaveBeenCalledWith('tenant-1', CUSTOMER_ID);
      expect(result).toEqual({ isKycComplete: false });
    });

    it('isComplete delegates isKycComplete', async () => {
      kycService.isKycComplete.mockResolvedValue(true);
      const result = await caller.kyc.isComplete({ customerId: CUSTOMER_ID });
      expect(kycService.isKycComplete).toHaveBeenCalledWith('tenant-1', CUSTOMER_ID);
      expect(result).toBe(true);
    });

    it('getExpiring defaults daysAhead to 30 when an empty object is given', async () => {
      kycService.getExpiringVerifications.mockResolvedValue([]);
      await caller.kyc.getExpiring({});
      expect(kycService.getExpiringVerifications).toHaveBeenCalledWith('tenant-1', 30);
    });

    it('getExpiring forwards an explicit daysAhead', async () => {
      kycService.getExpiringVerifications.mockResolvedValue([]);
      await caller.kyc.getExpiring({ daysAhead: 7 });
      expect(kycService.getExpiringVerifications).toHaveBeenCalledWith('tenant-1', 7);
    });

    it('getExpiring forwards undefined when input is omitted', async () => {
      kycService.getExpiringVerifications.mockResolvedValue([]);
      await caller.kyc.getExpiring();
      expect(kycService.getExpiringVerifications).toHaveBeenCalledWith('tenant-1', undefined);
    });

    it('getExpiring rejects a zero daysAhead', async () => {
      await expect(caller.kyc.getExpiring({ daysAhead: 0 })).rejects.toThrow();
    });

    it('getPendingCount delegates getPendingCount with tenant', async () => {
      kycService.getPendingCount.mockResolvedValue(5);
      const result = await caller.kyc.getPendingCount();
      expect(kycService.getPendingCount).toHaveBeenCalledWith('tenant-1');
      expect(result).toBe(5);
    });

    it('verifyAadhaar delegates with tenant, user and input', async () => {
      kycService.verifyAadhaar.mockResolvedValue({ verified: true });
      const result = await caller.kyc.verifyAadhaar({ aadhaarNumber: '123456789012', name: 'Asha' });
      expect(kycService.verifyAadhaar).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ aadhaarNumber: '123456789012', name: 'Asha' }),
      );
      expect(result).toEqual({ verified: true });
    });

    it('verifyAadhaar rejects a 10-digit number', async () => {
      await expect(caller.kyc.verifyAadhaar({ aadhaarNumber: '1234567890' })).rejects.toThrow();
    });

    it('verifyPan delegates with tenant, user and input', async () => {
      kycService.verifyPan.mockResolvedValue({ verified: true });
      const result = await caller.kyc.verifyPan({ panNumber: 'ABCDE1234F', customerId: CUSTOMER_ID });
      expect(kycService.verifyPan).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ panNumber: 'ABCDE1234F', customerId: CUSTOMER_ID }),
      );
      expect(result).toEqual({ verified: true });
    });

    it('verifyPan rejects a badly formatted PAN', async () => {
      await expect(caller.kyc.verifyPan({ panNumber: 'abcde1234f' })).rejects.toThrow();
    });

    it('requestAadhaarOtp delegates with tenant, user and input', async () => {
      kycService.requestAadhaarOtp.mockResolvedValue({ refId: 'ref-1' });
      const result = await caller.kyc.requestAadhaarOtp({ aadhaarNumber: '123456789012' });
      expect(kycService.requestAadhaarOtp).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ aadhaarNumber: '123456789012' }),
      );
      expect(result).toEqual({ refId: 'ref-1' });
    });

    it('confirmAadhaarOtp delegates with refId and otp', async () => {
      kycService.confirmAadhaarOtp.mockResolvedValue({ verified: true });
      const result = await caller.kyc.confirmAadhaarOtp({ refId: 'ref-1', otp: '123456' });
      expect(kycService.confirmAadhaarOtp).toHaveBeenCalledWith('ref-1', '123456');
      expect(result).toEqual({ verified: true });
    });

    it('confirmAadhaarOtp rejects a non-numeric otp', async () => {
      await expect(caller.kyc.confirmAadhaarOtp({ refId: 'ref-1', otp: 'abcd' })).rejects.toThrow();
    });

    it('list delegates listVerifications with tenant and filters', async () => {
      kycService.listVerifications.mockResolvedValue([]);
      await caller.kyc.list({ status: 'PENDING', customerId: CUSTOMER_ID });
      expect(kycService.listVerifications).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'PENDING', customerId: CUSTOMER_ID }),
      );
    });
  });

  // ─── Payments ───────────────────────────────────────────
  describe('payments', () => {
    it('generateUpiQr delegates generateUpiQrData with parsed input', async () => {
      paymentService.generateUpiQrData.mockReturnValue({ upiUrl: 'upi://pay' });
      const result = await caller.payments.generateUpiQr({
        payeeVpa: 'jeweller@upi',
        payeeName: 'CaratFlow Jewels',
        amountPaise: 150000,
      });
      expect(paymentService.generateUpiQrData).toHaveBeenCalledWith(
        expect.objectContaining({ payeeVpa: 'jeweller@upi', amountPaise: 150000 }),
      );
      expect(result).toEqual({ upiUrl: 'upi://pay' });
    });

    it('generateUpiQr rejects a non-positive amount', async () => {
      await expect(
        caller.payments.generateUpiQr({ payeeVpa: 'a@upi', payeeName: 'A', amountPaise: 0 }),
      ).rejects.toThrow();
    });

    it('generateBankTemplate delegates generateBankTransferTemplate', async () => {
      paymentService.generateBankTransferTemplate.mockReturnValue({ transferType: 'NEFT' });
      const result = await caller.payments.generateBankTemplate({
        transferType: 'NEFT',
        beneficiaryName: 'CaratFlow Jewels',
        accountNumber: '123456789',
        ifscCode: 'HDFC0001234',
        amountPaise: 100000,
      });
      expect(paymentService.generateBankTransferTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ transferType: 'NEFT', ifscCode: 'HDFC0001234' }),
      );
      expect(result).toEqual({ transferType: 'NEFT' });
    });

    it('generateBankTemplate rejects a malformed IFSC code', async () => {
      await expect(
        caller.payments.generateBankTemplate({
          transferType: 'RTGS',
          beneficiaryName: 'X',
          accountNumber: '1',
          ifscCode: 'BAD',
          amountPaise: 1,
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Authentication ─────────────────────────────────────
  describe('authentication', () => {
    it('rejects calls without tenant or user context', async () => {
      const anon = routerInstance.router.createCaller({
        tenantId: '',
        userId: '',
        userRole: 'anonymous',
        userPermissions: [],
      });
      await expect(anon.girvi.dashboard()).rejects.toThrow();
      expect(girviService.getDashboard).not.toHaveBeenCalled();
    });
  });
});
