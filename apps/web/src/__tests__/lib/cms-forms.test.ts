import { describe, it, expect } from 'vitest';
import {
  buildFaqInput, EMPTY_FAQ_FORM, faqToForm, buildBannerInput, EMPTY_BANNER_FORM, buildPageInput, EMPTY_PAGE_FORM,
  buildBlogInput, EMPTY_BLOG_FORM, buildCollectionInput, EMPTY_COLLECTION_FORM, slugify,
} from '@/lib/cms-forms';

describe('buildFaqInput (FaqInputSchema)', () => {
  it('requires question and answer', () => {
    const r = buildFaqInput(EMPTY_FAQ_FORM);
    expect(r.input).toBeNull();
    expect(r.errors.question).toBeTruthy();
    expect(r.errors.answer).toBeTruthy();
  });
  it('builds the payload with displayOrder/isPublished (not sortOrder/isActive)', () => {
    const r = buildFaqInput({ question: ' Q? ', answer: 'A.', category: ' Shipping ', displayOrder: '3', isPublished: false });
    expect(r.input).toEqual({ question: 'Q?', answer: 'A.', category: 'Shipping', displayOrder: 3, isPublished: false });
  });
  it('rejects a negative or fractional display order', () => {
    expect(buildFaqInput({ ...EMPTY_FAQ_FORM, question: 'q', answer: 'a', displayOrder: '-1' }).errors.displayOrder).toBeTruthy();
    expect(buildFaqInput({ ...EMPTY_FAQ_FORM, question: 'q', answer: 'a', displayOrder: '1.5' }).errors.displayOrder).toBeTruthy();
  });
  it('round-trips a server FAQ row through faqToForm', () => {
    const form = faqToForm({ id: 'x', question: 'Q', answer: 'A', category: null, displayOrder: 2, isPublished: true });
    expect(buildFaqInput(form).input).toEqual({ question: 'Q', answer: 'A', displayOrder: 2, isPublished: true });
  });
});

describe('buildBannerInput', () => {
  it('requires title and a valid image URL', () => {
    const r = buildBannerInput({ ...EMPTY_BANNER_FORM, imageUrl: 'nope' });
    expect(r.errors.title).toBeTruthy();
    expect(r.errors.imageUrl).toBeTruthy();
  });
  it('builds a BannerInputSchema payload and checks the date order', () => {
    const ok = buildBannerInput({ ...EMPTY_BANNER_FORM, title: 'Diwali', imageUrl: 'https://cdn.x.com/a.jpg', startDate: '2026-11-01', endDate: '2026-11-10' });
    expect(ok.input).toMatchObject({ title: 'Diwali', position: 'HERO', linkType: 'NONE', targetAudience: 'ALL', displayOrder: 0, isActive: true, startDate: '2026-11-01' });
    const bad = buildBannerInput({ ...EMPTY_BANNER_FORM, title: 'D', imageUrl: 'https://x.com/a.jpg', startDate: '2026-11-10', endDate: '2026-11-01' });
    expect(bad.errors.endDate).toBeTruthy();
  });
});

describe('slug based forms', () => {
  it('slugify', () => {
    expect(slugify('  About Us & Our Story! ')).toBe('about-us-our-story');
  });
  it('page derives the slug from the title and validates content', () => {
    const r = buildPageInput({ ...EMPTY_PAGE_FORM, title: 'Shipping Policy', content: '<p>x</p>' });
    expect(r.input).toMatchObject({ slug: 'shipping-policy', isPublished: false });
    expect(buildPageInput({ ...EMPTY_PAGE_FORM, title: 'T', content: 'c', slug: 'Bad Slug' }).errors.slug).toBeTruthy();
    expect(buildPageInput({ ...EMPTY_PAGE_FORM, title: 'T' }).errors.content).toBeTruthy();
  });
  it('blog needs an author and splits tags', () => {
    expect(buildBlogInput({ ...EMPTY_BLOG_FORM, title: 'Gold', content: 'c' }).errors.author).toBeTruthy();
    const r = buildBlogInput({ ...EMPTY_BLOG_FORM, title: 'Gold Guide', content: 'c', author: 'Asha', tags: 'gold, care ,', readTimeMinutes: '4' });
    expect(r.input).toMatchObject({ slug: 'gold-guide', tags: ['gold', 'care'], readTimeMinutes: 4 });
  });
  it('collection sends an empty products array by default', () => {
    const r = buildCollectionInput({ ...EMPTY_COLLECTION_FORM, name: 'Bridal Sets' });
    expect(r.input).toMatchObject({ slug: 'bridal-sets', products: [], isActive: true, isFeatured: false });
    expect(buildCollectionInput(EMPTY_COLLECTION_FORM).errors.name).toBeTruthy();
  });
});

import { diffInput, buildUpdateData, bannerToForm, pageToForm } from '@/lib/cms-forms';

describe('edit helpers', () => {
  it('bannerToForm prefills and trims dates to yyyy-mm-dd', () => {
    const f = bannerToForm({ title: 'T', imageUrl: 'https://a.b/c.jpg', startDate: '2026-11-01T00:00:00.000Z', endDate: null, displayOrder: 2 });
    expect(f.startDate).toBe('2026-11-01');
    expect(f.endDate).toBe('');
    expect(f.displayOrder).toBe('2');
  });

  it('diffInput sends only changed keys, never products, and clears clearable text', () => {
    expect(diffInput({ name: 'a', products: [], isActive: true, description: 'd' }, { name: 'b', products: [], isActive: true }, ['description']))
      .toEqual({ name: 'b', description: '' });
  });

  it('buildUpdateData returns an empty patch when nothing changed and keeps validation errors', () => {
    const initial = pageToForm({ title: 'A', slug: 'a', content: 'c', isPublished: false });
    expect(buildUpdateData(buildPageInput, initial, { ...initial }).input).toEqual({});
    expect(buildUpdateData(buildPageInput, initial, { ...initial, title: '' }).errors.title).toBeTruthy();
  });
});
