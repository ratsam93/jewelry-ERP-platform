import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-procedure query results for the tRPC mock. Keys are dotted procedure
// paths (e.g. 'financial.invoices.getById'). Unset keys resolve to
// `data: undefined`, which the detail pages render as their not-found state.
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
}));

// Re-mock @/lib/trpc (the global setup returns data: undefined for every query).
vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'useQuery') {
            return () => ({
              data: mockState.queries[path.join('.')],
              isLoading: false,
              isError: false,
              error: null,
              refetch: vi.fn(),
            });
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, isError: false });
          }
          if (prop === 'useUtils') {
            return () => createProxy([]);
          }
          return createProxy([...path, prop]);
        },
      },
    );
  }
  return { trpc: createProxy([]) };
});

const invoiceFixture = {
  id: 'inv-1',
  invoiceNumber: 'INV-202604-0012',
  invoiceType: 'SALES',
  status: 'DRAFT',
  dueDate: null,
  createdAt: '2026-04-10T00:00:00.000Z',
  customer: { firstName: 'Asha', lastName: 'Rao', gstinNumber: null },
  supplier: null,
  subtotalPaise: 100000,
  taxPaise: 3000,
  totalPaise: 103000,
  paidPaise: 0,
  notes: null,
  lineItems: [
    {
      id: 'line-1',
      description: '22K Gold Necklace - 25g',
      hsnCode: '7113',
      quantity: 1,
      unitPricePaise: 100000,
      taxableAmountPaise: 100000,
      gstRate: 3,
      cgstPaise: 1500,
      sgstPaise: 1500,
      igstPaise: 0,
      totalPaise: 103000,
    },
    {
      id: 'line-2',
      description: 'Making Charges',
      hsnCode: '7113',
      quantity: 1,
      unitPricePaise: 0,
      taxableAmountPaise: 0,
      gstRate: 3,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      totalPaise: 0,
    },
  ],
  payments: [],
};

const girviFixture = {
  id: 'girvi-1',
  loanNumber: 'GRV-202604-0012',
  status: 'ACTIVE',
  principalPaise: 5000000,
  interestRatePercent: 2,
  outstandingPaise: 5100000,
  issuedDate: '2026-04-01T00:00:00.000Z',
  dueDate: '2026-10-01T00:00:00.000Z',
  customer: { firstName: 'Asha', lastName: 'Rao' },
};

const kittyFixture = { id: 'kitty-1', name: 'Diwali Gold Kitty 2026' };
const goldSavingsFixture = { id: 'gs-1', name: 'Gold Plus Monthly Plan' };

const employeeFixture = {
  id: 'emp-1',
  employeeCode: 'EMP-001',
  firstName: 'Ravi',
  lastName: 'Kumar',
  designation: 'Master Jeweller',
  department: 'Karigar',
  status: 'ACTIVE',
  panNumber: 'ABCDE1234F',
  aadhaarNumber: null,
  basicSalaryPaise: 2500000,
  hraPaise: 1000000,
  daPaise: 0,
  conveyancePaise: 100000,
  medicalPaise: 50000,
  otherAllowancePaise: 0,
  bankAccountNumber: null,
  bankIfsc: 'HDFC0000123',
  bankName: 'HDFC Bank',
};

const payrollPeriodFixture = { id: 'per-1', periodLabel: 'April 2026', status: 'OPEN' };

const payslipsFixture = [
  {
    id: 'slip-1',
    employee: { firstName: 'Ravi', lastName: 'Kumar' },
    grossSalary: 3650000,
    totalDeductions: 200000,
    netSalary: 3450000,
    status: 'DRAFT',
  },
];

beforeEach(() => {
  mockState.queries = { 'financial.invoices.getById': invoiceFixture };
});

// Mock feature components used by finance detail pages
vi.mock('@/features/finance/tax-breakdown-display', () => ({
  TaxBreakdownDisplay: (props: Record<string, unknown>) => (
    <div data-testid="tax-breakdown">Tax Breakdown (taxable: {String(props.taxableAmountPaise)})</div>
  ),
}));

vi.mock('@/features/finance/invoice-form', () => ({
  InvoiceForm: (props: Record<string, unknown>) => (
    <div data-testid="invoice-form">Invoice Form (type: {String(props.invoiceType)})</div>
  ),
}));

describe('Finance Detail Pages', () => {
  describe('Invoice Detail [id]', () => {
    it('renders with invoice number in page header', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/[id]/page'
      );
      render(<Page />);
      expect(screen.getByText('Invoice INV-202604-0012')).toBeInTheDocument();
    });

    it('renders Line Items section with item descriptions', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/[id]/page'
      );
      render(<Page />);
      expect(screen.getByText('Line Items')).toBeInTheDocument();
      expect(screen.getByText('22K Gold Necklace - 25g')).toBeInTheDocument();
      expect(screen.getByText('Making Charges')).toBeInTheDocument();
    });

    it('renders Payment History section', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/[id]/page'
      );
      render(<Page />);
      expect(screen.getByText('Payment History')).toBeInTheDocument();
    });

    it('renders tax breakdown component', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('tax-breakdown')).toBeInTheDocument();
    });
  });

  describe('New Invoice', () => {
    it('renders with page header title "New Invoice"', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/new/page'
      );
      render(<Page />);
      expect(screen.getByText('New Invoice')).toBeInTheDocument();
    });

    it('renders Sales and Purchase invoice type toggles', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/new/page'
      );
      render(<Page />);
      expect(screen.getByText('Sales Invoice')).toBeInTheDocument();
      expect(screen.getByText('Purchase Invoice')).toBeInTheDocument();
    });

    it('renders the invoice form component', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/invoices/new/page'
      );
      render(<Page />);
      expect(screen.getByTestId('invoice-form')).toBeInTheDocument();
    });
  });

  describe('New Girvi Loan', () => {
    it('renders with page header title "New Girvi Loan"', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/girvi/new/page'
      );
      render(<Page />);
      expect(screen.getByText('New Girvi Loan')).toBeInTheDocument();
    });

    it('renders Customer & KYC and Collateral Details sections', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/girvi/new/page'
      );
      render(<Page />);
      expect(screen.getByText('Customer & KYC')).toBeInTheDocument();
      expect(screen.getByText('Collateral Details')).toBeInTheDocument();
    });

    it('renders Valuation Summary section', async () => {
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/girvi/new/page'
      );
      render(<Page />);
      expect(screen.getByText('Valuation Summary')).toBeInTheDocument();
    });
  });

  describe('Girvi Loan Detail [id]', () => {
    it('renders the loan number and outstanding details with data', async () => {
      mockState.queries = { 'india.girvi.getById': girviFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/girvi/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'GRV-202604-0012' })).toBeInTheDocument();
      expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    });

    it('renders a not-found state when the loan does not exist', async () => {
      mockState.queries = { 'india.girvi.getById': null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/girvi/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Girvi loan not found' })).toBeInTheDocument();
    });
  });

  describe('Kitty Scheme Detail [id]', () => {
    it('renders the scheme name with data', async () => {
      mockState.queries = { 'india.schemes.kitty.getById': kittyFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/schemes/kitty/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Diwali Gold Kitty 2026' })).toBeInTheDocument();
    });

    it('renders a not-found state when the scheme does not exist', async () => {
      mockState.queries = { 'india.schemes.kitty.getById': null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/schemes/kitty/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Kitty scheme not found' })).toBeInTheDocument();
    });
  });

  describe('Gold Savings Scheme Detail [id]', () => {
    it('renders the scheme name with data', async () => {
      mockState.queries = { 'india.schemes.goldSavings.getById': goldSavingsFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/schemes/gold-savings/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Gold Plus Monthly Plan' })).toBeInTheDocument();
    });

    it('renders a not-found state when the scheme does not exist', async () => {
      mockState.queries = { 'india.schemes.goldSavings.getById': null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/schemes/gold-savings/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Gold savings scheme not found' })).toBeInTheDocument();
    });
  });

  describe('Payroll Employee Detail [id]', () => {
    it('renders the employee name and salary components with data', async () => {
      mockState.queries = { 'payroll.employees.get': employeeFixture };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/payroll/employees/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('Ravi Kumar');
      expect(screen.getByText('Salary Components')).toBeInTheDocument();
    });

    it('renders a not-found state when the employee does not exist', async () => {
      mockState.queries = { 'payroll.employees.get': null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/payroll/employees/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    });
  });

  describe('Payroll Period Detail [id]', () => {
    it('renders the period label and payslips with data', async () => {
      mockState.queries = {
        'payroll.payrollPeriods.get': payrollPeriodFixture,
        'payroll.payslips.list': payslipsFixture,
      };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/payroll/periods/[id]/page'
      );
      render(<Page />);
      expect(screen.getByTestId('page-header')).toHaveTextContent('Period April 2026');
      expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    });

    it('renders a not-found state when the period does not exist', async () => {
      mockState.queries = { 'payroll.payrollPeriods.get': null };
      const { default: Page } = await import(
        '../../../../app/(dashboard)/finance/payroll/periods/[id]/page'
      );
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Payroll period not found' })).toBeInTheDocument();
    });
  });
});
