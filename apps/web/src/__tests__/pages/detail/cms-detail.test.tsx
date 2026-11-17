import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test query results keyed by tRPC path (e.g. 'cms.blog.getById').
const mockState = vi.hoisted(() => ({
  queries: {} as Record<string, { data?: unknown; isLoading?: boolean; error?: unknown }>,
}));

vi.mock('@/lib/trpc', () => {
  function createProxy(path: string[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'useQuery') {
            return () => {
              const entry = mockState.queries[path.join('.')];
              return {
                data: entry?.data,
                isLoading: entry?.isLoading ?? false,
                error: entry?.error ?? null,
                refetch: vi.fn(),
              };
            };
          }
          if (prop === 'useMutation') {
            return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null, isSuccess: false });
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

const blogPostFixture = {
  id: 'post-1',
  title: 'Gold Buying Guide 2026',
  excerpt: 'How to sell old gold',
  content: '<p>Body text</p>',
  isPublished: true,
};

const collectionFixture = { id: 'col-1', name: 'Bridal Edit', isActive: true };

beforeEach(() => {
  mockState.queries = {};
});

describe('CMS Detail Pages', () => {
  describe('Blog Post Detail [id]', () => {
    it('renders the post title when data is present', async () => {
      mockState.queries['cms.blog.getById'] = { data: blogPostFixture };
      const { default: Page } = await import('../../../../app/(dashboard)/cms/blog/[id]/page');
      render(<Page />);
      expect(screen.getAllByText('Gold Buying Guide 2026').length).toBeGreaterThan(0);
    });

    it('renders a not-found state when the post is null', async () => {
      mockState.queries['cms.blog.getById'] = { data: null };
      const { default: Page } = await import('../../../../app/(dashboard)/cms/blog/[id]/page');
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Blog post not found' })).toBeInTheDocument();
    });
  });

  describe('Collection Detail [id]', () => {
    it('renders the collection name when data is present', async () => {
      mockState.queries['cms.collections.getById'] = { data: collectionFixture };
      const { default: Page } = await import('../../../../app/(dashboard)/cms/collections/[id]/page');
      render(<Page />);
      expect(screen.getAllByText('Bridal Edit').length).toBeGreaterThan(0);
    });

    it('renders a not-found state when the collection is null', async () => {
      mockState.queries['cms.collections.getById'] = { data: null };
      const { default: Page } = await import('../../../../app/(dashboard)/cms/collections/[id]/page');
      render(<Page />);
      expect(screen.getByRole('heading', { name: 'Collection not found' })).toBeInTheDocument();
    });
  });
});
