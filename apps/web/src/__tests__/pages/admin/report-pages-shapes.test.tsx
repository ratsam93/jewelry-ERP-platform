import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Each test sets the payload per tRPC query path ("reporting.salesByPeriod", ...).
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
}));

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
            return () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
          }
          if (prop === 'useUtils') return () => createProxy([]);
          return createProxy([...path, prop]);
        },
      },
    );
  }
  return { trpc: createProxy([]) };
});

// Recharts does not lay out in jsdom, so expose the chart's labels and values as plain text.
vi.mock('@/features/reporting/ReportChart', () => ({
  ReportChart: ({ data }: { data: { labels: string[]; datasets: Array<{ data: number[] }> } }) => (
    <ul data-testid="report-chart">
      {data.labels.map((label, i) => (
        <li key={label}>{`${label}: ${data.datasets[0]?.data[i]}`}</li>
      ))}
    </ul>
  ),
}));

import SalesReportPage from '../../../../app/(dashboard)/reports/sales/page';
import SalesComparisonPage from '../../../../app/(dashboard)/reports/sales/comparison/page';
import InventoryReportsPage from '../../../../app/(dashboard)/reports/inventory/page';
import InventoryValuationPage from '../../../../app/(dashboard)/reports/inventory/valuation/page';
import ManufacturingReportsPage from '../../../../app/(dashboard)/reports/manufacturing/page';
import CrmReportsPage from '../../../../app/(dashboard)/reports/crm/page';
import ReportsDashboardPage from '../../../../app/(dashboard)/reports/page';
import ForecastReportsPage from '../../../../app/(dashboard)/reports/forecast/page';
import CustomReportsPage from '../../../../app/(dashboard)/reports/custom/page';
import ScheduledReportsPage from '../../../../app/(dashboard)/reports/scheduled/page';
import AgingReportPage from '../../../../app/(dashboard)/finance/reports/aging/page';
import PnlReportPage from '../../../../app/(dashboard)/finance/reports/pnl/page';
import BalanceSheetPage from '../../../../app/(dashboard)/finance/reports/balance-sheet/page';

// Fixtures use the exact shapes returned by the API services / shared-types.
const salesReport = {
  summary: [
    { date: '2026-11-03', salesCount: 4, totalRevenuePaise: '1250000', avgTicketPaise: '312500', returnCount: 0, netRevenuePaise: '1250000' },
  ],
  totals: { totalSales: 4, totalRevenuePaise: '1250000', avgTicketPaise: '312500', totalReturns: 0, netRevenuePaise: '1250000' },
};
const emptySalesReport = {
  summary: [],
  totals: { totalSales: 0, totalRevenuePaise: 0, avgTicketPaise: 0, totalReturns: 0, netRevenuePaise: 0 },
};
const agingReport = {
  type: 'AR',
  asOfDate: '2026-11-17',
  buckets: [
    { label: '0-30 days', amountPaise: 500000, count: 2 },
    { label: '31-60 days', amountPaise: 0, count: 0 },
  ],
  totalOutstanding: 500000,
  entries: [
    {
      invoiceId: 'inv-1', invoiceNumber: 'INV-0001', partyName: 'Asha Jewellers', invoiceDate: '2026-10-20', dueDate: '2026-11-05',
      totalPaise: 600000, paidPaise: 100000, outstandingPaise: 500000, ageDays: 12,
    },
  ],
};
const emptyAgingReport = { type: 'AR', asOfDate: '2026-11-17', buckets: [], totalOutstanding: 0, entries: [] };
const pnlReport = {
  fromDate: '2026-11-01T00:00:00.000Z',
  toDate: '2026-11-17T00:00:00.000Z',
  revenue: [{ accountId: 'a1', accountName: 'Sales Revenue', amount: 900000 }],
  expenses: [{ accountId: 'a2', accountName: 'Rent Expense', amount: 200000 }],
  totalRevenue: 900000,
  totalExpenses: 200000,
  netProfit: 700000,
};
const balanceSheet = {
  asOfDate: '2026-11-17T00:00:00.000Z',
  assets: [{ accountId: 'a1', accountName: 'Cash in Hand', amount: 400000 }],
  liabilities: [{ accountId: 'l1', accountName: 'Accounts Payable', amount: 100000 }],
  equity: [{ accountId: 'e1', accountName: 'Owner Capital', amount: 300000 }],
  totalAssets: 400000,
  totalLiabilities: 100000,
  totalEquity: 300000,
};

beforeEach(() => {
  mockState.queries = {};
});

describe('ADM-010: report pages consume the real API shapes', () => {
  it('sales report renders summary rows', () => {
    mockState.queries['reporting.salesByPeriod'] = salesReport;
    render(<SalesReportPage />);
    expect(screen.getByText('2026-11-03')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getAllByText(/12,500\.00/).length).toBeGreaterThan(0);
  });
  it('sales report handles empty data', () => {
    mockState.queries['reporting.salesByPeriod'] = emptySalesReport;
    render(<SalesReportPage />);
    expect(screen.getByText('No data')).toBeTruthy();
  });
  it('sales report does not throw on an unexpected (array) payload', () => {
    mockState.queries['reporting.salesByPeriod'] = [{ foo: 1 }];
    render(<SalesReportPage />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('aging report renders buckets and entries', () => {
    mockState.queries['financial.reports.aging'] = agingReport;
    render(<AgingReportPage />);
    expect(screen.getByText('0-30 days')).toBeTruthy();
    expect(screen.getByText('INV-0001')).toBeTruthy();
    expect(screen.getByText('Asha Jewellers')).toBeTruthy();
    expect(screen.getByText('Total outstanding')).toBeTruthy();
  });
  it('aging report handles empty data', () => {
    mockState.queries['financial.reports.aging'] = emptyAgingReport;
    render(<AgingReportPage />);
    expect(screen.getByText('No outstanding invoices')).toBeTruthy();
  });

  it('profit and loss renders revenue and expense lines', () => {
    mockState.queries['financial.reports.profitAndLoss'] = pnlReport;
    render(<PnlReportPage />);
    expect(screen.getByText('Sales Revenue')).toBeTruthy();
    expect(screen.getByText('Rent Expense')).toBeTruthy();
    expect(screen.getByText('Net Profit')).toBeTruthy();
    expect(screen.getByText(/7,000\.00/)).toBeTruthy();
  });
  it('profit and loss handles empty data', () => {
    mockState.queries['financial.reports.profitAndLoss'] = { ...pnlReport, revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, netProfit: 0 };
    render(<PnlReportPage />);
    expect(screen.getByText('No revenue in this period.')).toBeTruthy();
    expect(screen.getByText('No expenses in this period.')).toBeTruthy();
  });

  it('balance sheet renders assets, liabilities and equity', () => {
    mockState.queries['financial.reports.balanceSheet'] = balanceSheet;
    render(<BalanceSheetPage />);
    expect(screen.getByText('Cash in Hand')).toBeTruthy();
    expect(screen.getByText('Accounts Payable')).toBeTruthy();
    expect(screen.getByText('Owner Capital')).toBeTruthy();
    expect(screen.getByText('Total Equity')).toBeTruthy();
  });
  it('balance sheet handles empty data', () => {
    mockState.queries['financial.reports.balanceSheet'] = { asOfDate: '2026-11-17T00:00:00.000Z', assets: [], liabilities: [], equity: [], totalAssets: 0, totalLiabilities: 0, totalEquity: 0 };
    render(<BalanceSheetPage />);
    expect(screen.getAllByText('No accounts')).toHaveLength(3);
  });

  it('sales comparison reads nested period totals', () => {
    mockState.queries['reporting.salesComparison'] = {
      period1: salesReport,
      period2: { ...salesReport, totals: { ...salesReport.totals, totalSales: 2, totalRevenuePaise: '500000' } },
      changePercent: { salesCount: 100, revenue: 150, avgTicket: 25 },
    };
    render(<SalesComparisonPage />);
    expect(screen.getByText(/12,500\.00/)).toBeTruthy();
    expect(screen.getByText(/5,000\.00/)).toBeTruthy();
    expect(screen.getByText('150%')).toBeTruthy();
  });
  it('sales comparison handles empty data', () => {
    render(<SalesComparisonPage />);
    expect(screen.getByText('Revenue change')).toBeTruthy();
  });

  it('inventory report reads stockSummary totals and low stock array', () => {
    mockState.queries['reporting.stockSummary'] = {
      stockSummary: [{ category: 'Rings', totalItems: 3, totalQuantity: 10, totalValuePaise: 800000 }],
      totalValuePaise: 800000,
      totalItems: 3,
      totalQuantity: 10,
    };
    mockState.queries['reporting.lowStockAlert'] = [
      { productId: 'p1', productName: 'Gold Ring', sku: 'GR-1', locationName: 'Main', quantityOnHand: 1, reorderLevel: 5, deficit: 4 },
    ];
    render(<InventoryReportsPage />);
    expect(screen.getByText('Gold Ring')).toBeTruthy();
    expect(screen.getByText('1 / 5')).toBeTruthy();
    expect(screen.getByText(/8,000\.00/)).toBeTruthy();
  });
  it('inventory report handles empty data', () => {
    render(<InventoryReportsPage />);
    expect(screen.getByText('No low-stock items')).toBeTruthy();
  });

  it('inventory valuation reads items and grandTotalPaise', () => {
    mockState.queries['reporting.stockValuationReport'] = {
      items: [{ productId: 'p1', productName: 'Gold Ring', sku: 'GR-1', quantityOnHand: 2, unitValuePaise: 500000, totalValuePaise: 1000000 }],
      grandTotalPaise: 1000000,
    };
    render(<InventoryValuationPage />);
    expect(screen.getByText('Gold Ring')).toBeTruthy();
    expect(screen.getAllByText(/10,000\.00/).length).toBeGreaterThan(0);
  });
  it('inventory valuation handles empty data', () => {
    mockState.queries['reporting.stockValuationReport'] = { items: [], grandTotalPaise: 0 };
    render(<InventoryValuationPage />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('manufacturing report renders job summary rows', () => {
    mockState.queries['reporting.jobSummary'] = {
      jobSummary: [{ status: 'IN_PROGRESS', count: 3, totalEstimatedCostPaise: 250000 }],
      totalJobs: 3,
      completedJobs: 0,
      overdueJobs: 1,
    };
    render(<ManufacturingReportsPage />);
    expect(screen.getByText('IN_PROGRESS')).toBeTruthy();
    expect(screen.getByText('Overdue Jobs')).toBeTruthy();
  });
  it('manufacturing report handles empty data', () => {
    mockState.queries['reporting.jobSummary'] = { jobSummary: [], totalJobs: 0, completedJobs: 0, overdueJobs: 0 };
    render(<ManufacturingReportsPage />);
    expect(screen.getByText('No data')).toBeTruthy();
  });

  it('crm report renders the overview fields', () => {
    mockState.queries['reporting.crmOverview'] = { totalCustomers: 120, newCustomersInPeriod: 7, repeatPurchaseRate: 42, avgLifetimeValuePaise: 900000 };
    render(<CrmReportsPage />);
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText(/9,000\.00/)).toBeTruthy();
  });
  it('crm report handles empty data', () => {
    render(<CrmReportsPage />);
    expect(screen.getByText('Total Customers')).toBeTruthy();
  });

  it('reports dashboard reads kpis by label', () => {
    mockState.queries['reporting.getAnalyticsDashboard'] = {
      kpis: [
        { label: 'Total Revenue', value: 1250000, formattedValue: 'INR 12,500.00' },
        { label: 'Sales Count', value: 4, formattedValue: '4' },
      ],
      charts: [], alerts: [], trends: [], lastUpdated: '2026-11-17T00:00:00.000Z',
    };
    render(<ReportsDashboardPage />);
    expect(screen.getByText('INR 12,500.00')).toBeTruthy();
  });
  it('reports dashboard handles empty data', () => {
    render(<ReportsDashboardPage />);
    expect(screen.getByText('Total Revenue')).toBeTruthy();
  });

  it('forecast seasonality tab reads the SeasonalPattern array', () => {
    mockState.queries['reporting.seasonalityAnalysis'] = [
      { month: 1, monthName: 'Jan', avgDemand: 10, seasonalIndex: 1.2 },
      { month: 2, monthName: 'Feb', avgDemand: 8, seasonalIndex: 0.9 },
    ];
    render(<ForecastReportsPage />);
    fireEvent.click(screen.getByText('Seasonality'));
    expect(screen.getByText('Jan: 1.2')).toBeTruthy();
    expect(screen.getByText('Feb: 0.9')).toBeTruthy();
  });
  it('forecast page does not throw when predictions is missing', () => {
    mockState.queries['reporting.demandForecast'] = { entityId: 'x', entityName: 'x', method: 'sma', accuracy: 0, mape: 0 };
    render(<ForecastReportsPage />);
    expect(screen.getByText(/Not enough historical data/)).toBeTruthy();
  });

  it('saved and scheduled report lists tolerate non-array payloads', () => {
    mockState.queries['reporting.listSavedReports'] = { unexpected: true };
    mockState.queries['reporting.listScheduledReports'] = null;
    render(<CustomReportsPage />);
    expect(screen.getByText('No saved reports')).toBeTruthy();
    render(<ScheduledReportsPage />);
    expect(screen.getByText('No scheduled reports')).toBeTruthy();
  });
});
