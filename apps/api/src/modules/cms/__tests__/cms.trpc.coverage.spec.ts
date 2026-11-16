import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrpcService } from '../../../trpc/trpc.service';
import { CmsTrpcRouter } from '../cms.trpc';

describe('CmsTrpcRouter (procedure coverage)', () => {
  const trpc = new TrpcService();

  const cmsService = {
    getDashboard: vi.fn(),
    listBanners: vi.fn(),
    getBanner: vi.fn(),
    createBanner: vi.fn(),
    updateBanner: vi.fn(),
    deleteBanner: vi.fn(),
    listCollections: vi.fn(),
    getCollection: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    deleteCollection: vi.fn(),
    listPages: vi.fn(),
    getPage: vi.fn(),
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
    listFaqs: vi.fn(),
    createFaq: vi.fn(),
    updateFaq: vi.fn(),
    deleteFaq: vi.fn(),
    reorderFaqs: vi.fn(),
    listAnnouncements: vi.fn(),
    createAnnouncement: vi.fn(),
    updateAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn(),
  };
  const blogService = {
    listBlogPosts: vi.fn(),
    getBlogPost: vi.fn(),
    createBlogPost: vi.fn(),
    updateBlogPost: vi.fn(),
    deleteBlogPost: vi.fn(),
    publishBlogPost: vi.fn(),
    unpublishBlogPost: vi.fn(),
  };
  const homepageService = {
    listSections: vi.fn(),
    getSection: vi.fn(),
    createSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
    toggleSectionActive: vi.fn(),
    reorderSections: vi.fn(),
  };
  const seoService = {
    listSeoMetadata: vi.fn(),
    getSeoMetadataById: vi.fn(),
    upsertSeoMetadata: vi.fn(),
    deleteSeoMetadata: vi.fn(),
    generateProductSeo: vi.fn(),
    generateCategorySeo: vi.fn(),
  };

  const ctx = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    userRole: 'admin',
    userPermissions: ['*'],
  };

  const routerInstance = new CmsTrpcRouter(
    trpc,
    cmsService as never,
    blogService as never,
    homepageService as never,
    seoService as never,
  );
  const caller = routerInstance.router.createCaller(ctx);

  // Valid RFC 9562 v4 UUIDs (Zod 4 validates version/variant nibbles)
  const ID = '3f1e2d4c-5b6a-4789-9abc-def012345678';
  const ID_2 = '4a2f3e5d-6c7b-489a-8bcd-ef0123456789';
  const PRODUCT_ID = '5b3a4f6e-7d8c-49ab-9cde-f01234567890';
  const CATEGORY_ID = '6c4b5a7f-8e9d-4abc-8def-012345678901';

  const IMAGE_URL = 'https://cdn.example.com/banner.jpg';

  const validBanner = {
    title: 'Summer Sale',
    imageUrl: IMAGE_URL,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Dashboard ──────────────────────────────────────────
  describe('dashboard', () => {
    it('delegates to cmsService.getDashboard with tenant', async () => {
      cmsService.getDashboard.mockResolvedValue({ activeBanners: 3 });
      const result = await caller.dashboard();
      expect(cmsService.getDashboard).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual({ activeBanners: 3 });
    });
  });

  // ─── Banners ────────────────────────────────────────────
  describe('banners', () => {
    it('list applies default pagination and empty filters', async () => {
      cmsService.listBanners.mockResolvedValue({ items: [] });
      const result = await caller.banners.list({});
      expect(cmsService.listBanners).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 20, sortOrder: 'asc' },
      );
      expect(result).toEqual({ items: [] });
    });

    it('list forwards filters and explicit pagination', async () => {
      cmsService.listBanners.mockResolvedValue({ items: [] });
      await caller.banners.list({
        filters: { position: 'HERO', isActive: true },
        pagination: { page: 2, limit: 5, sortOrder: 'desc' },
      });
      expect(cmsService.listBanners).toHaveBeenCalledWith(
        'tenant-1',
        { position: 'HERO', isActive: true },
        { page: 2, limit: 5, sortOrder: 'desc' },
      );
    });

    it('getById delegates with tenant and id', async () => {
      cmsService.getBanner.mockResolvedValue({ id: ID });
      const result = await caller.banners.getById({ id: ID });
      expect(cmsService.getBanner).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ id: ID });
    });

    it('getById rejects a non-uuid id', async () => {
      await expect(caller.banners.getById({ id: 'nope' })).rejects.toThrow();
    });

    it('create applies schema defaults before delegating', async () => {
      cmsService.createBanner.mockResolvedValue({ id: ID });
      const result = await caller.banners.create(validBanner);
      expect(cmsService.createBanner).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          title: 'Summer Sale',
          imageUrl: IMAGE_URL,
          linkType: 'NONE',
          position: 'HERO',
          displayOrder: 0,
          isActive: true,
          targetAudience: 'ALL',
        }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('create rejects a non-URL imageUrl', async () => {
      await expect(
        caller.banners.create({ title: 'X', imageUrl: 'not-a-url' }),
      ).rejects.toThrow();
      expect(cmsService.createBanner).not.toHaveBeenCalled();
    });

    it('update passes only the single supplied field (no defaults injected)', async () => {
      cmsService.updateBanner.mockResolvedValue({ id: ID, title: 'New' });
      const result = await caller.banners.update({ id: ID, data: { title: 'New' } });
      expect(cmsService.updateBanner).toHaveBeenCalledTimes(1);
      const [tenant, user, id, data] = cmsService.updateBanner.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ title: 'New' });
      expect(result).toEqual({ id: ID, title: 'New' });
    });

    it('update forwards explicitly supplied false/zero values', async () => {
      cmsService.updateBanner.mockResolvedValue({});
      await caller.banners.update({ id: ID, data: { isActive: false, displayOrder: 0 } });
      const [, , , data] = cmsService.updateBanner.mock.calls[0]!;
      expect(data).toStrictEqual({ isActive: false, displayOrder: 0 });
    });

    it('delete delegates with tenant and id', async () => {
      cmsService.deleteBanner.mockResolvedValue({ success: true });
      const result = await caller.banners.delete({ id: ID });
      expect(cmsService.deleteBanner).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Collections ────────────────────────────────────────
  describe('collections', () => {
    const collectionInput = { name: 'Bridal', slug: 'bridal-edit' };

    it('list applies default pagination', async () => {
      cmsService.listCollections.mockResolvedValue([]);
      const result = await caller.collections.list({});
      expect(cmsService.listCollections).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 20, sortOrder: 'asc' },
      );
      expect(result).toEqual([]);
    });

    it('getById delegates with tenant and id', async () => {
      cmsService.getCollection.mockResolvedValue({ id: ID });
      const result = await caller.collections.getById({ id: ID });
      expect(cmsService.getCollection).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ id: ID });
    });

    it('create applies products and flag defaults', async () => {
      cmsService.createCollection.mockResolvedValue({ id: ID });
      const result = await caller.collections.create(collectionInput);
      expect(cmsService.createCollection).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          name: 'Bridal',
          slug: 'bridal-edit',
          products: [],
          displayOrder: 0,
          isActive: true,
          isFeatured: false,
        }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('create rejects a slug with uppercase characters', async () => {
      await expect(
        caller.collections.create({ name: 'Bridal', slug: 'Bridal Edit' }),
      ).rejects.toThrow();
    });

    it('update passes only the single supplied field', async () => {
      cmsService.updateCollection.mockResolvedValue({ id: ID });
      await caller.collections.update({ id: ID, data: { isFeatured: true } });
      const [tenant, user, id, data] = cmsService.updateCollection.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ isFeatured: true });
    });

    it('delete delegates with tenant and id', async () => {
      cmsService.deleteCollection.mockResolvedValue({ success: true });
      const result = await caller.collections.delete({ id: ID });
      expect(cmsService.deleteCollection).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Pages ──────────────────────────────────────────────
  describe('pages', () => {
    it('list applies default pagination with desc order', async () => {
      cmsService.listPages.mockResolvedValue([]);
      const result = await caller.pages.list({});
      expect(cmsService.listPages).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 20, sortOrder: 'desc' },
      );
      expect(result).toEqual([]);
    });

    it('getById delegates with tenant and id', async () => {
      cmsService.getPage.mockResolvedValue({ id: ID });
      const result = await caller.pages.getById({ id: ID });
      expect(cmsService.getPage).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ id: ID });
    });

    it('create applies isPublished default', async () => {
      cmsService.createPage.mockResolvedValue({ id: ID });
      const result = await caller.pages.create({
        title: 'About',
        slug: 'about-us',
        content: '<p>Hi</p>',
      });
      expect(cmsService.createPage).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ slug: 'about-us', isPublished: false }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('update passes only the single supplied field', async () => {
      cmsService.updatePage.mockResolvedValue({ id: ID });
      await caller.pages.update({ id: ID, data: { metaTitle: 'About | Store' } });
      const [tenant, user, id, data] = cmsService.updatePage.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ metaTitle: 'About | Store' });
    });

    it('delete delegates with tenant and id', async () => {
      cmsService.deletePage.mockResolvedValue({ success: true });
      const result = await caller.pages.delete({ id: ID });
      expect(cmsService.deletePage).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Blog ───────────────────────────────────────────────
  describe('blog', () => {
    const blogInput = {
      title: 'Gold Guide',
      slug: 'gold-guide',
      content: 'Body',
      author: 'Asha',
    };

    it('list applies default pagination with desc order', async () => {
      blogService.listBlogPosts.mockResolvedValue([]);
      const result = await caller.blog.list({});
      expect(blogService.listBlogPosts).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 20, sortOrder: 'desc' },
      );
      expect(result).toEqual([]);
    });

    it('list forwards tag filter', async () => {
      blogService.listBlogPosts.mockResolvedValue([]);
      await caller.blog.list({ filters: { tag: 'gold' }, pagination: { page: 1, limit: 10, sortOrder: 'asc' } });
      expect(blogService.listBlogPosts).toHaveBeenCalledWith(
        'tenant-1',
        { tag: 'gold' },
        { page: 1, limit: 10, sortOrder: 'asc' },
      );
    });

    it('getById delegates with tenant and id', async () => {
      blogService.getBlogPost.mockResolvedValue({ id: ID });
      const result = await caller.blog.getById({ id: ID });
      expect(blogService.getBlogPost).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ id: ID });
    });

    it('create applies tags, readTime and publish defaults', async () => {
      blogService.createBlogPost.mockResolvedValue({ id: ID });
      const result = await caller.blog.create(blogInput);
      expect(blogService.createBlogPost).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          title: 'Gold Guide',
          author: 'Asha',
          tags: [],
          readTimeMinutes: 0,
          isPublished: false,
        }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('update passes only the single supplied field', async () => {
      blogService.updateBlogPost.mockResolvedValue({ id: ID });
      await caller.blog.update({ id: ID, data: { readTimeMinutes: 7 } });
      const [tenant, user, id, data] = blogService.updateBlogPost.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ readTimeMinutes: 7 });
    });

    it('delete delegates with tenant and id', async () => {
      blogService.deleteBlogPost.mockResolvedValue({ success: true });
      const result = await caller.blog.delete({ id: ID });
      expect(blogService.deleteBlogPost).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });

    it('publish delegates with tenant, user and id', async () => {
      blogService.publishBlogPost.mockResolvedValue({ id: ID, isPublished: true });
      const result = await caller.blog.publish({ id: ID });
      expect(blogService.publishBlogPost).toHaveBeenCalledWith('tenant-1', 'user-1', ID);
      expect(result).toEqual({ id: ID, isPublished: true });
    });

    it('unpublish delegates with tenant, user and id', async () => {
      blogService.unpublishBlogPost.mockResolvedValue({ id: ID, isPublished: false });
      const result = await caller.blog.unpublish({ id: ID });
      expect(blogService.unpublishBlogPost).toHaveBeenCalledWith('tenant-1', 'user-1', ID);
      expect(result).toEqual({ id: ID, isPublished: false });
    });
  });

  // ─── FAQ ────────────────────────────────────────────────
  describe('faq', () => {
    it('list applies default pagination with limit 50', async () => {
      cmsService.listFaqs.mockResolvedValue([]);
      const result = await caller.faq.list({});
      expect(cmsService.listFaqs).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 50, sortOrder: 'asc' },
      );
      expect(result).toEqual([]);
    });

    it('create applies displayOrder and isPublished defaults', async () => {
      cmsService.createFaq.mockResolvedValue({ id: ID });
      const result = await caller.faq.create({ question: 'Hallmarked?', answer: 'Yes' });
      expect(cmsService.createFaq).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ question: 'Hallmarked?', answer: 'Yes', displayOrder: 0, isPublished: true }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('update passes only the single supplied field', async () => {
      cmsService.updateFaq.mockResolvedValue({ id: ID });
      await caller.faq.update({ id: ID, data: { category: 'Shipping' } });
      const [tenant, user, id, data] = cmsService.updateFaq.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ category: 'Shipping' });
    });

    it('delete delegates with tenant and id', async () => {
      cmsService.deleteFaq.mockResolvedValue({ success: true });
      const result = await caller.faq.delete({ id: ID });
      expect(cmsService.deleteFaq).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });

    it('reorder forwards the item list', async () => {
      cmsService.reorderFaqs.mockResolvedValue({ success: true });
      const items = [
        { id: ID, displayOrder: 1 },
        { id: ID_2, displayOrder: 2 },
      ];
      const result = await caller.faq.reorder({ items });
      expect(cmsService.reorderFaqs).toHaveBeenCalledWith('tenant-1', 'user-1', items);
      expect(result).toEqual({ success: true });
    });

    it('reorder rejects negative displayOrder', async () => {
      await expect(
        caller.faq.reorder({ items: [{ id: ID, displayOrder: -1 }] }),
      ).rejects.toThrow();
    });
  });

  // ─── Announcements ──────────────────────────────────────
  describe('announcements', () => {
    it('list applies default pagination with desc order', async () => {
      cmsService.listAnnouncements.mockResolvedValue([]);
      const result = await caller.announcements.list({});
      expect(cmsService.listAnnouncements).toHaveBeenCalledWith(
        'tenant-1',
        { page: 1, limit: 20, sortOrder: 'desc' },
      );
      expect(result).toEqual([]);
    });

    it('create applies isActive default', async () => {
      cmsService.createAnnouncement.mockResolvedValue({ id: ID });
      const result = await caller.announcements.create({ message: 'Free shipping' });
      expect(cmsService.createAnnouncement).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ message: 'Free shipping', isActive: true }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('update passes only the single supplied field', async () => {
      cmsService.updateAnnouncement.mockResolvedValue({ id: ID });
      await caller.announcements.update({ id: ID, data: { textColor: '#ffffff' } });
      const [tenant, user, id, data] = cmsService.updateAnnouncement.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ textColor: '#ffffff' });
    });

    it('delete delegates with tenant and id', async () => {
      cmsService.deleteAnnouncement.mockResolvedValue({ success: true });
      const result = await caller.announcements.delete({ id: ID });
      expect(cmsService.deleteAnnouncement).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Homepage sections ──────────────────────────────────
  describe('homepage', () => {
    it('list delegates with tenant', async () => {
      homepageService.listSections.mockResolvedValue([]);
      const result = await caller.homepage.list();
      expect(homepageService.listSections).toHaveBeenCalledWith('tenant-1');
      expect(result).toEqual([]);
    });

    it('getById delegates with tenant and id', async () => {
      homepageService.getSection.mockResolvedValue({ id: ID });
      const result = await caller.homepage.getById({ id: ID });
      expect(homepageService.getSection).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ id: ID });
    });

    it('create applies displayOrder and isActive defaults', async () => {
      homepageService.createSection.mockResolvedValue({ id: ID });
      const result = await caller.homepage.create({
        sectionType: 'FEATURED_PRODUCTS',
        config: { title: 'Picks', limit: 4, categoryId: CATEGORY_ID },
      });
      expect(homepageService.createSection).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          sectionType: 'FEATURED_PRODUCTS',
          displayOrder: 0,
          isActive: true,
          config: { title: 'Picks', limit: 4, categoryId: CATEGORY_ID },
        }),
      );
      expect(result).toEqual({ id: ID });
    });

    it('create rejects an unknown sectionType', async () => {
      await expect(
        caller.homepage.create({ sectionType: 'NOT_A_SECTION' }),
      ).rejects.toThrow();
    });

    it('update passes only the single supplied field', async () => {
      homepageService.updateSection.mockResolvedValue({ id: ID });
      await caller.homepage.update({ id: ID, data: { displayOrder: 3 } });
      const [tenant, user, id, data] = homepageService.updateSection.mock.calls[0]!;
      expect([tenant, user, id]).toEqual(['tenant-1', 'user-1', ID]);
      expect(data).toStrictEqual({ displayOrder: 3 });
    });

    it('delete delegates with tenant and id', async () => {
      homepageService.deleteSection.mockResolvedValue({ success: true });
      const result = await caller.homepage.delete({ id: ID });
      expect(homepageService.deleteSection).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });

    it('toggleActive delegates with tenant, user and id', async () => {
      homepageService.toggleSectionActive.mockResolvedValue({ id: ID, isActive: false });
      const result = await caller.homepage.toggleActive({ id: ID });
      expect(homepageService.toggleSectionActive).toHaveBeenCalledWith('tenant-1', 'user-1', ID);
      expect(result).toEqual({ id: ID, isActive: false });
    });

    it('reorder forwards the item list', async () => {
      homepageService.reorderSections.mockResolvedValue({ success: true });
      const items = [{ id: ID, displayOrder: 0 }];
      const result = await caller.homepage.reorder({ items });
      expect(homepageService.reorderSections).toHaveBeenCalledWith('tenant-1', 'user-1', items);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── SEO ────────────────────────────────────────────────
  describe('seo', () => {
    it('list applies default pagination with desc order', async () => {
      seoService.listSeoMetadata.mockResolvedValue([]);
      const result = await caller.seo.list({});
      expect(seoService.listSeoMetadata).toHaveBeenCalledWith(
        'tenant-1',
        {},
        { page: 1, limit: 20, sortOrder: 'desc' },
      );
      expect(result).toEqual([]);
    });

    it('getById delegates with tenant and id', async () => {
      seoService.getSeoMetadataById.mockResolvedValue({ id: ID });
      const result = await caller.seo.getById({ id: ID });
      expect(seoService.getSeoMetadataById).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ id: ID });
    });

    it('upsert delegates validated input with tenant and user', async () => {
      seoService.upsertSeoMetadata.mockResolvedValue({ id: ID });
      const input = {
        pageType: 'PRODUCT' as const,
        pageIdentifier: 'ring-22k',
        metaTitle: 'Ring',
        ogImage: 'https://cdn.example.com/og.png',
        canonicalUrl: 'https://shop.example.com/ring-22k',
        structuredData: { '@type': 'Product' },
      };
      const result = await caller.seo.upsert(input);
      expect(seoService.upsertSeoMetadata).toHaveBeenCalledWith('tenant-1', 'user-1', input);
      expect(result).toEqual({ id: ID });
    });

    it('upsert rejects an invalid canonical URL', async () => {
      await expect(
        caller.seo.upsert({ pageType: 'HOME', pageIdentifier: 'home', canonicalUrl: 'nope' }),
      ).rejects.toThrow();
    });

    it('delete delegates with tenant and id', async () => {
      seoService.deleteSeoMetadata.mockResolvedValue({ success: true });
      const result = await caller.seo.delete({ id: ID });
      expect(seoService.deleteSeoMetadata).toHaveBeenCalledWith('tenant-1', ID);
      expect(result).toEqual({ success: true });
    });

    it('generateForProduct delegates with tenant, user and product id', async () => {
      seoService.generateProductSeo.mockResolvedValue({ id: ID });
      const result = await caller.seo.generateForProduct({ productId: PRODUCT_ID });
      expect(seoService.generateProductSeo).toHaveBeenCalledWith('tenant-1', 'user-1', PRODUCT_ID);
      expect(result).toEqual({ id: ID });
    });

    it('generateForCategory delegates with tenant, user and category id', async () => {
      seoService.generateCategorySeo.mockResolvedValue({ id: ID });
      const result = await caller.seo.generateForCategory({ categoryId: CATEGORY_ID });
      expect(seoService.generateCategorySeo).toHaveBeenCalledWith('tenant-1', 'user-1', CATEGORY_ID);
      expect(result).toEqual({ id: ID });
    });
  });
});
