import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseScaled,
  computeGirviValuation,
  validateGirviForm,
  buildGirviCreateInput,
  girviLoanView,
  addMonths,
  girviCustomerLabel,
  type GirviFormValues,
} from '@/lib/girvi-form';
import { GirviLoanInputSchema } from '../../../../../packages/shared-types/src/india';

const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutate: vi.fn(),
}));

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'useQuery') {
            return () => ({
              data: mockState.queries[path.join('.')],
              isLoading: false,
              error: null,
              refetch: vi.fn(),
            });
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: mockState.mutate, isPending: false });
          }
          return createProxy([...path, prop]);
        },
      },
    );
  }
  return { trpc: createProxy([]) };
});

const CUST = '11111111-1111-4111-8111-111111111111';
const LOC = '22222222-2222-4222-8222-222222222222';

const base: GirviFormValues = {
  customerId: CUST,
  locationId: LOC,
  metalType: 'GOLD',
  grossWeightG: '50',
  stoneWeightG: '0',
  purityFineness: '916',
  appraisedRatePer10g: '70000',
  loanPercentage: '75',
  interestRate: '18',
  interestType: 'SIMPLE',
  compoundingPeriod: 'MONTHLY',
  durationMonths: '12',
  collateralDescription: 'Gold chain',
  notes: '',
};

describe('girvi-form helpers', () => {
  it('parseScaled avoids float drift', () => {
    expect(parseScaled('12.345', 3)).toBe(12345);
    expect(parseScaled('0.07', 2)).toBe(7);
    expect(parseScaled('', 2)).toBe(0);
    expect(parseScaled('abc', 2)).toBe(0);
  });

  it('computes appraised value and loan amount in paise', () => {
    const v = computeGirviValuation(base);
    expect(v.netWeightMg).toBe(50000);
    // 50g = 5 x 10g * Rs 70000 * 916/999
    expect(v.appraisedValuePaise).toBe(Math.round((50000 * 7000000 * 916) / (10000 * 999)));
    expect(v.loanAmountPaise).toBe(Math.round((v.appraisedValuePaise * 75) / 100));
  });

  it('rounds the loan half-up on paise (QA HK-FIN-03: 16174414 x 75% = 12130810.5 -> 12130811)', () => {
    // 24g net, Rs 73,500/10g (24K), 916 -> appraised 16174414 paise (matches the live loan)
    const v = computeGirviValuation({ ...base, grossWeightG: '25', stoneWeightG: '1', appraisedRatePer10g: '73500' });
    expect(v.appraisedValuePaise).toBe(16174414);
    expect(v.loanAmountPaise).toBe(12130811);
  });

  it('never lets the loan exceed the appraised value, even at 100%', () => {
    const v = computeGirviValuation({ ...base, loanPercentage: '100' });
    expect(v.loanAmountPaise).toBe(v.appraisedValuePaise);
    for (const pct of ['1', '33', '99', '100']) {
      const r = computeGirviValuation({ ...base, loanPercentage: pct, appraisedRatePer10g: '71234.57' });
      expect(r.loanAmountPaise).toBeLessThanOrEqual(r.appraisedValuePaise);
    }
  });

  it('accepts loan % 1..100 and rejects the rest with a clear message', () => {
    expect(validateGirviForm({ ...base, loanPercentage: '100' }).loanPercentage).toBeUndefined();
    expect(validateGirviForm({ ...base, loanPercentage: '1' }).loanPercentage).toBeUndefined();
    for (const bad of ['0', '101', '', '-5', '75.5', 'abc']) {
      expect(validateGirviForm({ ...base, loanPercentage: bad }).loanPercentage).toBe(
        'Loan percentage must be a whole number between 1 and 100',
      );
    }
  });

  it('labels customers with phone/email and KYC so duplicate names differ', () => {
    const a = girviCustomerLabel({ id: 'a1', firstName: 'Priya', lastName: 'Sharma', phone: '+919820000001', email: 'demo.customer@example.com' });
    const b = girviCustomerLabel({ id: 'b2', firstName: 'Priya', lastName: 'Sharma', phone: '+919820000002', email: null });
    expect(a).toBe('Priya Sharma - +919820000001 / demo.customer@example.com');
    expect(b).toBe('Priya Sharma - +919820000002');
    expect(a).not.toBe(b);
    expect(girviCustomerLabel({ id: 'c3d4e5f6-0000', firstName: 'No', lastName: 'Contact' })).toContain('ID c3d4e5f6');
    expect(girviCustomerLabel({ id: 'a1', firstName: 'P', lastName: 'S', phone: '+91' }, { aadhaar: true, pan: false })).toContain('KYC verified');
    expect(girviCustomerLabel({ id: 'a1', firstName: 'P', lastName: 'S' }, { aadhaar: false, pan: false })).toContain('KYC pending');
  });

  it('girviLoanView exposes the saved collateral from the real getById shape', () => {
    const v = girviLoanView({
      loanAmountPaise: '12130810', appraisedValuePaise: '16174414', grossWeightMg: '25000', netWeightMg: '24000',
      purityFineness: 916, metalType: 'GOLD', interestRate: 1800, interestType: 'SIMPLE', compoundingPeriod: null,
      disbursedDate: '2026-11-17T00:00:00.000Z', dueDate: '2027-11-17T00:00:00.000Z',
      collateralDescription: 'Gold bangles 22K, two pieces', notes: 'test loan', aadhaarVerified: true, panVerified: true,
    });
    expect(v).toMatchObject({
      metalType: 'GOLD', grossWeightMg: 25000, netWeightMg: 24000, purityFineness: 916,
      appraisedValuePaise: 16174414, ratePer10gPaise: 7350000, durationMonths: 12, interestType: 'SIMPLE',
      compoundingPeriod: null, collateralDescription: 'Gold bangles 22K, two pieces', notes: 'test loan',
    });
    expect(v.loanPercent).toBe(75);
  });

  it('is zero until a rate is entered', () => {
    expect(computeGirviValuation({ ...base, appraisedRatePer10g: '' }).appraisedValuePaise).toBe(0);
  });

  it('validates required fields', () => {
    const e = validateGirviForm({ ...base, customerId: '', collateralDescription: ' ', appraisedRatePer10g: '' });
    expect(Object.keys(e).sort()).toEqual(['appraisedRatePer10g', 'collateralDescription', 'customerId']);
    expect(validateGirviForm({ ...base, stoneWeightG: '60' }).stoneWeightG).toBeTruthy();
    expect(validateGirviForm(base)).toEqual({});
  });

  it('builds a payload accepted by GirviLoanInputSchema (paise/mg/bps)', () => {
    const now = new Date('2026-01-31T00:00:00Z');
    const input = buildGirviCreateInput({ ...base, interestType: 'COMPOUND' }, now);
    expect(input.interestRate).toBe(1800);
    expect(input.compoundingPeriod).toBe('MONTHLY');
    expect(GirviLoanInputSchema.safeParse(input).success).toBe(true);
    expect(input.dueDate.getTime()).toBeGreaterThan(input.disbursedDate.getTime());
  });

  it('addMonths clamps month overflow', () => {
    const d = addMonths(new Date(2026, 0, 31), 1);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });

  it('girviLoanView maps the API shape', () => {
    const v = girviLoanView({
      loanAmountPaise: '5000000',
      outstandingPrincipalPaise: '5000000',
      outstandingInterestPaise: '100000',
      interestRate: 1800,
      disbursedDate: '2026-04-01T00:00:00.000Z',
    });
    expect(v.principalPaise).toBe(5000000);
    expect(v.outstandingPaise).toBe(5100000);
    expect(v.interestRatePercent).toBe(18);
    expect(v.issuedDate).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('New Girvi Loan page', () => {
  beforeEach(() => {
    mockState.mutate.mockClear();
    mockState.queries = {
      'crm.customerList': { items: [{ id: CUST, firstName: 'Asha', lastName: 'Rao' }] },
      'platform.branches.list': [{ id: LOC, name: 'Main Showroom' }],
      'india.kyc.getStatus': { isAadhaarVerified: true, isPanVerified: false },
      'india.rates.getCurrent': { ratePer10gPaise: '7000000' },
    };
  });

  it('prefills the rate and updates the Valuation Summary as the form is filled', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/finance/girvi/new/page');
    const { container } = render(<Page />);
    const num = (i: number) => container.querySelectorAll('input[type="number"]')[i] as HTMLInputElement;
    fireEvent.change(num(0), { target: { value: '50' } }); // gross
    expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0);
    expect(screen.queryByText('₹0.00')).toBeNull();
    expect(num(2).value).toBe('70000.00'); // rate prefilled from live rate
  });

  it('submits the real payload to india.girvi.create', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/finance/girvi/new/page');
    const { container } = render(<Page />);
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0]!, { target: { value: CUST } });
    fireEvent.change(selects[1]!, { target: { value: LOC } });
    const num = (i: number) => container.querySelectorAll('input[type="number"]')[i] as HTMLInputElement;
    fireEvent.change(num(0), { target: { value: '50' } });
    fireEvent.change(container.querySelector('textarea')!, { target: { value: 'Gold chain' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Loan/ }));
    expect(mockState.mutate).toHaveBeenCalledTimes(1);
    const payload = mockState.mutate.mock.calls[0]![0];
    expect(payload.customerId).toBe(CUST);
    expect(payload.grossWeightMg).toBe(50000);
    expect(payload.interestRate).toBe(1800);
    expect(GirviLoanInputSchema.safeParse(payload).success).toBe(true);
  });

  it('shows validation errors and does not submit an incomplete form', async () => {
    const { default: Page } = await import('../../../app/(dashboard)/finance/girvi/new/page');
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: /Create Loan/ }));
    expect(mockState.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Select a customer')).toBeInTheDocument();
  });
});

describe('Girvi detail page', () => {
  it('shows the saved collateral from the real getById shape', async () => {
    mockState.queries = {
      'india.girvi.getById': {
        id: '770ec3f1-845b-456b-abe3-5dd134200285',
        loanNumber: 'GRV-202611-0001',
        status: 'ACTIVE',
        collateralDescription: 'QA-HK Gold bangles 22K, two pieces',
        metalType: 'GOLD',
        grossWeightMg: '25000',
        netWeightMg: '24000',
        purityFineness: 916,
        appraisedValuePaise: '16174414',
        loanAmountPaise: '12130811',
        interestRate: 1800,
        interestType: 'SIMPLE',
        compoundingPeriod: null,
        disbursedDate: '2026-11-17T00:00:00.000Z',
        dueDate: '2027-11-17T00:00:00.000Z',
        outstandingPrincipalPaise: '12130811',
        outstandingInterestPaise: '0',
        aadhaarVerified: true,
        panVerified: true,
        notes: 'QA-HK notes: test loan',
        customer: { firstName: 'Priya', lastName: 'Sharma' },
        location: { name: 'Andheri Branch' },
      },
    };
    const { default: Page } = await import('../../../app/(dashboard)/finance/girvi/[id]/page');
    render(<Page />);
    expect(screen.getByText('QA-HK Gold bangles 22K, two pieces')).toBeInTheDocument();
    expect(screen.getByText('25 g')).toBeInTheDocument();
    expect(screen.getByText('24 g')).toBeInTheDocument();
    expect(screen.getByText('916')).toBeInTheDocument();
    expect(screen.getByText('₹1,61,744.14')).toBeInTheDocument();
    expect(screen.getByText('₹73,500.00')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('SIMPLE')).toBeInTheDocument();
    expect(screen.getByText('12 months')).toBeInTheDocument();
    expect(screen.getByText('QA-HK notes: test loan')).toBeInTheDocument();
  });
});
