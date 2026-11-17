import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  lastQueryInput: {} as Record<string, unknown>,
  params: { id: 'o1' } as Record<string, string>,
}));

// The shared UI mock's PageHeader drops `actions`; these tests need the header buttons.
vi.mock('@caratflow/ui', async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
      <div data-testid="page-header"><h1>{title}</h1>{actions}</div>
    ),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => h.params,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/trpc', () => {
  const make = (path: string[]): unknown =>
    new Proxy({}, {
      get(_t, prop: string) {
        const key = path.join('.');
        if (prop === 'useQuery') {
          return (input: unknown) => {
            h.lastQueryInput[key] = input;
            return { data: h.queries[key], isLoading: false, error: null, refetch: vi.fn() };
          };
        }
        if (prop === 'useMutation') {
          return () => ({
            mutateAsync: (...a: unknown[]) => h.mutations[key]?.(...a),
            mutate: (...a: unknown[]) => h.mutations[key]?.(...a),
            isPending: false,
            error: null,
          });
        }
        return make([...path, prop]);
      },
    });
  return { trpc: make([]) };
});

function mut(name: string, result: unknown = {}) {
  const fn = vi.fn().mockResolvedValue(result);
  h.mutations[name] = fn as never;
  return fn;
}

beforeEach(() => {
  h.queries = {};
  h.mutations = {};
  h.lastQueryInput = {};
  vi.restoreAllMocks();
});

describe('Channels page: New Channel', () => {
  it('opens a form, validates, and creates via ecommerce.createChannel', async () => {
    const create = mut('ecommerce.createChannel');
    h.queries['ecommerce.listChannels'] = [];
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/channels/page');
    render(<Page />);
    fireEvent.click(screen.getByText('New Channel'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Create channel'));
    expect(await within(dialog).findByText('Channel name is required')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Channel name *'), { target: { value: 'Shopify store' } });
    fireEvent.change(within(dialog).getByLabelText('Channel type *'), { target: { value: 'SHOPIFY' } });
    fireEvent.change(within(dialog).getByLabelText('API key'), { target: { value: 'abc' } });
    expect((within(dialog).getByLabelText('API key') as HTMLInputElement).type).toBe('password');
    fireEvent.click(within(dialog).getByText('Create channel'));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({ name: 'Shopify store', channelType: 'SHOPIFY', isActive: true, apiKey: 'abc' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the server error and keeps the dialog open', async () => {
    const create = mut('ecommerce.createChannel');
    create.mockRejectedValue(new Error('Channel name already exists'));
    h.queries['ecommerce.listChannels'] = [];
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/channels/page');
    render(<Page />);
    fireEvent.click(screen.getByText('New Channel'));
    fireEvent.change(screen.getByLabelText('Channel name *'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByText('Create channel'));
    expect(await screen.findByText('Channel name already exists')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('FAQ page', () => {
  const faq = { id: 'f1', question: 'How long is shipping?', answer: '3 days', category: 'Shipping', displayOrder: 2, isPublished: true };

  it('New FAQ creates via cms.faq.create with displayOrder/isPublished', async () => {
    const create = mut('cms.faq.create');
    h.queries['cms.faq.list'] = { items: [] };
    const { default: Page } = await import('../../../app/(dashboard)/cms/faq/page');
    render(<Page />);
    fireEvent.click(screen.getByText('New FAQ'));
    fireEvent.change(screen.getByLabelText('Question *'), { target: { value: 'Do you ship abroad?' } });
    fireEvent.change(screen.getByLabelText('Answer *'), { target: { value: 'Yes.' } });
    fireEvent.change(screen.getByLabelText('Display order'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Create FAQ'));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({ question: 'Do you ship abroad?', answer: 'Yes.', displayOrder: 5, isPublished: true });
  });

  it('lists real fields (displayOrder, isPublished) and edits via cms.faq.update', async () => {
    const update = mut('cms.faq.update');
    h.queries['cms.faq.list'] = { items: [faq] };
    const { default: Page } = await import('../../../app/(dashboard)/cms/faq/page');
    render(<Page />);
    expect(screen.getByText('Published')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit'));
    expect((screen.getByLabelText('Question *') as HTMLInputElement).value).toBe('How long is shipping?');
    fireEvent.change(screen.getByLabelText('Answer *'), { target: { value: '2 days' } });
    fireEvent.click(screen.getByText('Save changes'));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      id: 'f1',
      data: { question: 'How long is shipping?', answer: '2 days', category: 'Shipping', displayOrder: 2, isPublished: true },
    });
  });

  it('asks for confirmation before deleting', async () => {
    const del = mut('cms.faq.delete');
    h.queries['cms.faq.list'] = { items: [faq] };
    const { default: Page } = await import('../../../app/(dashboard)/cms/faq/page');
    render(<Page />);
    const confirm = vi.spyOn(window, 'confirm');
    fireEvent.click(screen.getByText('Delete'));
    // In-app dialog: cancelling deletes nothing.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Delete'));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ id: 'f1' }));
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('other CMS New buttons are wired', () => {
  it.each([
    ['banners', 'New Banner', 'cms.banners.list'],
    ['pages', 'New Page', 'cms.pages.list'],
    ['blog', 'New Post', 'cms.blog.list'],
    ['collections', 'New Collection', 'cms.collections.list'],
  ])('%s opens its form', async (dir, button, query) => {
    h.queries[query] = { items: [] };
    const pages: Record<string, () => Promise<{ default: React.ComponentType }>> = {
      banners: () => import('../../../app/(dashboard)/cms/banners/page'),
      pages: () => import('../../../app/(dashboard)/cms/pages/page'),
      blog: () => import('../../../app/(dashboard)/cms/blog/page'),
      collections: () => import('../../../app/(dashboard)/cms/collections/page'),
    };
    const { default: Page } = await pages[dir]();
    render(<Page />);
    fireEvent.click(screen.getByText(button));
    expect(screen.getByRole('dialog', { name: button })).toBeInTheDocument();
  });

  it('banner list reads position/displayOrder', async () => {
    h.queries['cms.banners.list'] = { items: [{ id: 'b1', title: 'Diwali', position: 'HERO', displayOrder: 7, isActive: true }] };
    const { default: Page } = await import('../../../app/(dashboard)/cms/banners/page');
    render(<Page />);
    expect(screen.getByText('HERO')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

describe('Orders list', () => {
  it('sends search, status and date filters to listOrders and shows the customer name', async () => {
    h.queries['ecommerce.listOrders'] = {
      items: [{ id: 'o1', orderNumber: 'ON/B2C/2611/00001', customerName: 'Asha Rao', totalPaise: 100000, status: 'CONFIRMED', placedAt: '2026-11-17T07:00:00Z' }],
      totalPages: 1, page: 1, hasNext: false, hasPrevious: false,
    };
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/orders/page');
    render(<Page />);
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'ON/B2C' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'CONFIRMED' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-11-17' } });
    expect(h.lastQueryInput['ecommerce.listOrders']).toEqual({
      filters: { search: 'ON/B2C', status: 'CONFIRMED', dateFrom: '2026-11-01', dateTo: '2026-11-17' },
      pagination: { page: 1, limit: 20, sortOrder: 'desc' },
    });
  });
});

describe('Order detail', () => {
  const order = {
    id: 'o1', orderNumber: 'ON/B2C/1', status: 'CONFIRMED', customerName: 'Asha', totalPaise: 103000,
    subtotalPaise: 100000, taxPaise: 3000, shippingPaise: 0, discountPaise: 0, items: [],
  };

  it('shows breakdown lines and moves the order to the next status after confirmation', async () => {
    const upd = mut('ecommerce.updateOrderStatus');
    h.queries['ecommerce.getOrder'] = order;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/orders/[id]/page');
    render(<Page />);
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Tax')).toBeInTheDocument();
    expect(screen.queryByText('Shipping')).toBeNull();
    fireEvent.click(screen.getByText('Mark processing'));
    await waitFor(() => expect(upd).toHaveBeenCalledWith({ orderId: 'o1', status: 'PROCESSING' }));
  });

  it('cancel requires a reason and uses cancelOrder', async () => {
    const cancel = mut('ecommerce.cancelOrder');
    h.queries['ecommerce.getOrder'] = order;
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('Customer request');
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/orders/[id]/page');
    render(<Page />);
    fireEvent.click(screen.getByText('Cancel order'));
    expect(await screen.findByText('A cancel reason is required.')).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel order'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith({ orderId: 'o1', reason: 'Customer request' }));
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});

describe('Catalog page empty state', () => {
  it('explains the empty list and syncs products to the channel', async () => {
    const sync = mut('ecommerce.syncAllProducts', { synced: 80, totalItems: 80, failed: 0 });
    h.queries['ecommerce.listCatalogItems'] = { items: [], totalPages: 0 };
    h.queries['ecommerce.listChannels'] = [{ id: 'ch1', name: 'B2C Storefront', isActive: true }];
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/catalog/page');
    render(<Page />);
    expect(screen.getByText('No catalog items')).toBeInTheDocument();
    expect(screen.getByText(/not your inventory/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sync products to channel'));
    await waitFor(() => expect(sync).toHaveBeenCalledWith({ channelId: 'ch1' }));
    expect(await screen.findByText('Synced 80 of 80 products.')).toBeInTheDocument();
  });
});

describe('Reviews tabs', () => {
  it('filters by isPublished per tab', async () => {
    h.queries['ecommerce.listReviews'] = { items: [], totalPages: 0 };
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/reviews/page');
    render(<Page />);
    expect((h.lastQueryInput['ecommerce.listReviews'] as { filters: unknown }).filters).toEqual({});
    fireEvent.click(screen.getByRole('tab', { name: 'Pending' }));
    expect((h.lastQueryInput['ecommerce.listReviews'] as { filters: unknown }).filters).toEqual({ isPublished: false });
    fireEvent.click(screen.getByRole('tab', { name: 'Published' }));
    expect((h.lastQueryInput['ecommerce.listReviews'] as { filters: unknown }).filters).toEqual({ isPublished: true });
  });
});

describe('Channel detail', () => {
  it('shows real fields, syncs products and has no test-connection control', async () => {
    h.params = { id: 'ch1' };
    const sync = mut('ecommerce.syncAllProducts', { synced: 3, totalItems: 4, failed: 1, skipped: 0 });
    h.queries['ecommerce.getChannel'] = {
      id: 'ch1', name: 'B2C Storefront', channelType: 'WEBSITE', storeUrl: null, isActive: true, lastSyncAt: null, createdAt: '2026-11-16T21:47:17Z',
    };
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/channels/[id]/page');
    render(<Page />);
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('Never synced')).toBeInTheDocument();
    expect(screen.queryByText('Pull orders from Shopify')).toBeNull();
    fireEvent.click(screen.getByText('Sync products'));
    await waitFor(() => expect(sync).toHaveBeenCalledWith({ channelId: 'ch1' }));
    expect(await screen.findByText(/Synced 3 of 4 products, 1 failed/)).toBeInTheDocument();
    h.params = { id: 'o1' };
  });
});

describe('Ecommerce dashboard KPIs', () => {
  it('shows the values getDashboard returns', async () => {
    h.queries['ecommerce.getDashboard'] = { activeChannels: 1, mtdOrders: 2, mtdRevenuePaise: 0, pendingShipments: 2 };
    const { default: Page } = await import('../../../app/(dashboard)/ecommerce/page');
    render(<Page />);
    const card = (title: string) => screen.getByText(title).parentElement as HTMLElement;
    expect(card('Active Channels').textContent).toContain('1');
    expect(card('MTD Orders').textContent).toContain('2');
  });
});
