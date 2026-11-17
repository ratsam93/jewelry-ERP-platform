import type { ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Render tests for the admin detail pages that resolve a record by id.
 *
 * Each page is rendered three ways:
 *  - with a realistic record (the page shows its normal content),
 *  - with `data: null` once loading has finished (the shared not-found state),
 *  - while loading (the shared loading state, never a hang).
 */

type QueryState = { data?: unknown; isLoading?: boolean; error?: unknown };

const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, QueryState>,
  params: { id: '3f1c9a52-7b1e-4c55-9d0a-2f6a8e1b4c77' } as { id: string },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => mockState.params,
}));

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'useQuery') {
            return () => {
              const state = mockState.queries[path.join('.')] ?? {};
              return {
                data: state.data,
                isLoading: state.isLoading ?? false,
                error: state.error ?? null,
                refetch: vi.fn(),
              };
            };
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
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

/** Default payload for every tRPC query a detail page reads. */
const FIXTURES: Record<string, unknown> = {
  'manufacturing.bom.getById': {
    id: 'rec-1',
    name: '22K Gold Necklace BOM',
    version: 2,
    status: 'ACTIVE',
    components: [],
  },
  'manufacturing.job.getById': {
    id: 'rec-1',
    jobNumber: 'JO-000001',
    status: 'IN_PROGRESS',
  },
  'manufacturing.job.getCost': {},
  'manufacturing.karigar.getById': {
    id: 'rec-1',
    firstName: 'Ramesh',
    lastName: 'Kumar',
    employeeCode: 'KAR-001',
    skillLevel: 'EXPERT',
  },
  'manufacturing.karigar.getMetalBalance': {},
  'manufacturing.karigar.getPerformance': {},
  'reporting.getSavedReport': {
    id: 'rec-1',
    name: 'Monthly Sales Summary',
    columns: ['invoiceNumber', 'totalPaise'],
    filters: { entityType: 'sale', filters: [] },
  },
  'reporting.executeCustomReport': {
    headers: [
      { key: 'invoiceNumber', label: 'Invoice Number', type: 'string' },
      { key: 'totalPaise', label: 'Total (Paise)', type: 'number' },
    ],
    rows: [{ invoiceNumber: 'INV-000001', totalPaise: 125000 }],
    rowCount: 1,
  },
  'retail.getRepairOrder': {
    id: 'rec-1',
    repairNumber: 'REP-000001',
    status: 'RECEIVED',
    customer: { firstName: 'Asha', lastName: 'Rao', phone: '9999999999' },
    items: [],
  },
  'retail.getReturn': {
    id: 'rec-1',
    returnNumber: 'RET-000001',
    status: 'PENDING',
    items: [],
  },
  'retail.getSale': {
    id: 'rec-1',
    invoiceNumber: 'INV-000001',
    status: 'COMPLETED',
    customer: null,
    items: [],
  },
  'wholesale.getAgent': {
    id: 'rec-1',
    name: 'Sharma Brokers',
    commissionType: 'PERCENTAGE',
    isActive: true,
    phone: '9876543210',
    email: 'agent@example.com',
  },
  'wholesale.listCommissions': { items: [] },
  'wholesale.getConsignmentIn': {
    id: 'rec-1',
    consignmentNumber: 'CIN-000001',
    status: 'RECEIVED',
    supplier: { name: 'ABC Gold Refinery' },
    receivedDate: '2026-04-10T00:00:00.000Z',
    dueDate: null,
    items: [],
  },
  'wholesale.getConsignmentOut': {
    id: 'rec-1',
    consignmentNumber: 'COUT-000001',
    status: 'DRAFT',
    items: [],
  },
  'wholesale.getPurchaseOrder': {
    id: 'rec-1',
    poNumber: 'PO/2604/0015',
    status: 'DRAFT',
    items: [],
  },
  'wholesale.getSupplier': {
    id: 'rec-1',
    name: 'ABC Gold Refinery',
    isActive: true,
    city: 'Mumbai',
    country: 'IN',
  },
  'wholesale.getSupplierPerformance': null,
  'wholesale.listPurchaseOrders': { items: [] },
};

interface DetailCase {
  group: string;
  name: string;
  /** Page path relative to app/(dashboard), without the [id] segment. */
  route: string;
  /** Main tRPC query whose result gates the page. */
  mainQuery: string;
  /** Title the page header shows for the FIXTURES record. */
  title: string;
  /** Entity label used by the not-found heading. */
  entity: string;
  /** App-relative list route used by the not-found back link. */
  listHref: string;
}

const CASES: DetailCase[] = [
  {
    group: 'manufacturing',
    name: 'BOM',
    route: 'manufacturing/bom',
    mainQuery: 'manufacturing.bom.getById',
    title: '22K Gold Necklace BOM',
    entity: 'BOM',
    listHref: '/manufacturing/bom',
  },
  {
    group: 'manufacturing',
    name: 'Job',
    route: 'manufacturing/jobs',
    mainQuery: 'manufacturing.job.getById',
    title: 'JO-000001',
    entity: 'Job',
    listHref: '/manufacturing/jobs',
  },
  {
    group: 'manufacturing',
    name: 'Karigar',
    route: 'manufacturing/karigars',
    mainQuery: 'manufacturing.karigar.getById',
    title: 'Ramesh Kumar',
    entity: 'Karigar',
    listHref: '/manufacturing/karigars',
  },
  {
    group: 'reports',
    name: 'Custom report',
    route: 'reports/custom',
    mainQuery: 'reporting.getSavedReport',
    title: 'Monthly Sales Summary',
    entity: 'Custom report',
    listHref: '/reports/custom',
  },
  {
    group: 'retail',
    name: 'Repair order',
    route: 'retail/repairs',
    mainQuery: 'retail.getRepairOrder',
    title: 'REP-000001',
    entity: 'Repair order',
    listHref: '/retail/repairs',
  },
  {
    group: 'retail',
    name: 'Return',
    route: 'retail/returns',
    mainQuery: 'retail.getReturn',
    title: 'RET-000001',
    entity: 'Return',
    listHref: '/retail/returns',
  },
  {
    group: 'retail',
    name: 'Sale',
    route: 'retail/sales',
    mainQuery: 'retail.getSale',
    title: 'INV-000001',
    entity: 'Sale',
    listHref: '/retail/sales',
  },
  {
    group: 'wholesale',
    name: 'Agent',
    route: 'wholesale/agents',
    mainQuery: 'wholesale.getAgent',
    title: 'Sharma Brokers',
    entity: 'Agent',
    listHref: '/wholesale/agents',
  },
  {
    group: 'wholesale',
    name: 'Consignment in',
    route: 'wholesale/consignments-in',
    mainQuery: 'wholesale.getConsignmentIn',
    title: 'CIN-000001',
    entity: 'Consignment',
    listHref: '/wholesale/consignments-in',
  },
  {
    group: 'wholesale',
    name: 'Consignment out',
    route: 'wholesale/consignments-out',
    mainQuery: 'wholesale.getConsignmentOut',
    title: 'COUT-000001',
    entity: 'Consignment',
    listHref: '/wholesale/consignments-out',
  },
  {
    group: 'wholesale',
    name: 'Purchase order',
    route: 'wholesale/purchase-orders',
    mainQuery: 'wholesale.getPurchaseOrder',
    title: 'PO/2604/0015',
    entity: 'Purchase order',
    listHref: '/wholesale/purchase-orders',
  },
  {
    group: 'wholesale',
    name: 'Supplier',
    route: 'wholesale/suppliers',
    mainQuery: 'wholesale.getSupplier',
    title: 'ABC Gold Refinery',
    entity: 'Supplier',
    listHref: '/wholesale/suppliers',
  },
];

function resetQueries() {
  mockState.params = { id: '3f1c9a52-7b1e-4c55-9d0a-2f6a8e1b4c77' };
  mockState.queries = {};
  for (const [key, data] of Object.entries(FIXTURES)) {
    mockState.queries[key] = { data, isLoading: false, error: null };
  }
}

type PageModule = { default: () => unknown };

// Static import paths so the bundler can resolve each page.
const LOADERS: Record<string, () => Promise<PageModule>> = {
  'manufacturing/bom': () => import('../../../../app/(dashboard)/manufacturing/bom/[id]/page'),
  'manufacturing/jobs': () => import('../../../../app/(dashboard)/manufacturing/jobs/[id]/page'),
  'manufacturing/karigars': () => import('../../../../app/(dashboard)/manufacturing/karigars/[id]/page'),
  'reports/custom': () => import('../../../../app/(dashboard)/reports/custom/[id]/page'),
  'retail/repairs': () => import('../../../../app/(dashboard)/retail/repairs/[id]/page'),
  'retail/returns': () => import('../../../../app/(dashboard)/retail/returns/[id]/page'),
  'retail/sales': () => import('../../../../app/(dashboard)/retail/sales/[id]/page'),
  'wholesale/agents': () => import('../../../../app/(dashboard)/wholesale/agents/[id]/page'),
  'wholesale/consignments-in': () => import('../../../../app/(dashboard)/wholesale/consignments-in/[id]/page'),
  'wholesale/consignments-out': () => import('../../../../app/(dashboard)/wholesale/consignments-out/[id]/page'),
  'wholesale/purchase-orders': () => import('../../../../app/(dashboard)/wholesale/purchase-orders/[id]/page'),
  'wholesale/suppliers': () => import('../../../../app/(dashboard)/wholesale/suppliers/[id]/page'),
};

async function loadPage(route: string): Promise<ComponentType> {
  const loader = LOADERS[route];
  if (!loader) throw new Error(`No loader for ${route}`);
  return (await loader()).default as ComponentType;
}

describe.each(CASES)('$group detail: $name [id]', (detail) => {
  beforeAll(async () => {
    // Warm the module graph outside the per-test timeout (cold imports are slow under load).
    await Promise.all(Object.values(LOADERS).map((load) => load()));
  }, 120_000);

  beforeEach(() => {
    resetQueries();
  });

  it('renders the record content when data is present', async () => {
    const Page = await loadPage(detail.route);
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: detail.title })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('heading', { name: `${detail.entity} not found` })).toBeNull();
  });

  it('shows the not-found state when the record is null', async () => {
    mockState.queries[detail.mainQuery] = { data: null, isLoading: false, error: null };
    const Page = await loadPage(detail.route);
    render(<Page />);
    expect(screen.getByRole('heading', { name: `${detail.entity} not found` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', detail.listHref);
  });

  it('shows the loading state while the record is loading', async () => {
    mockState.queries[detail.mainQuery] = { data: undefined, isLoading: true, error: null };
    const Page = await loadPage(detail.route);
    render(<Page />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  });
});

describe('reports detail: Custom report [id] route guard', () => {
  it('shows not-found for a non-UUID id without hitting the server', async () => {
    resetQueries();
    mockState.params = { id: 'foo' };
    const Page = await loadPage('reports/custom');
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'Custom report not found' })).toBeInTheDocument();
  });

  it('runs the saved report and renders its result rows', async () => {
    resetQueries();
    const Page = await loadPage('reports/custom');
    render(<Page />);
    expect(screen.getByText('INV-000001')).toBeInTheDocument();
  });
});
