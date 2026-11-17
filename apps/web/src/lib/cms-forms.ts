// Form helpers for the CMS admin pages. They mirror the Zod schemas in
// packages/shared-types/src/cms.ts (FaqInputSchema, BannerInputSchema,
// PageInputSchema, BlogPostInputSchema, CollectionInputSchema).

export { formatServerError } from './manufacturing-forms';

export type Built = { input: Record<string, unknown> | null; errors: Record<string, string> };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function finish(input: Record<string, unknown>, errors: Record<string, string>): Built {
  return Object.keys(errors).length ? { input: null, errors } : { input, errors };
}

function maxLen(errors: Record<string, string>, key: string, v: string, max: number) {
  if (v.length > max) errors[key] = `Must be at most ${max} characters`;
}

function parseOrder(raw: string, errors: Record<string, string>): number {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) {
    errors.displayOrder = 'Display order must be a whole number, 0 or more';
    return 0;
  }
  return n;
}

// ─── FAQ ────────────────────────────────────────────────────────

export interface FaqFormValues {
  question: string;
  answer: string;
  category: string;
  displayOrder: string;
  isPublished: boolean;
}

export const EMPTY_FAQ_FORM: FaqFormValues = {
  question: '', answer: '', category: '', displayOrder: '0', isPublished: true,
};

export function buildFaqInput(f: FaqFormValues): Built {
  const errors: Record<string, string> = {};
  const question = f.question.trim();
  const answer = f.answer.trim();
  const category = f.category.trim();
  if (!question) errors.question = 'Question is required';
  else maxLen(errors, 'question', question, 500);
  if (!answer) errors.answer = 'Answer is required';
  maxLen(errors, 'category', category, 100);
  const displayOrder = parseOrder(f.displayOrder, errors);
  const input: Record<string, unknown> = { question, answer, displayOrder, isPublished: f.isPublished };
  if (category) input.category = category;
  return finish(input, errors);
}

export function faqToForm(faq: Record<string, unknown>): FaqFormValues {
  return {
    question: String(faq.question ?? ''),
    answer: String(faq.answer ?? ''),
    category: String(faq.category ?? ''),
    displayOrder: String(faq.displayOrder ?? 0),
    isPublished: faq.isPublished !== false,
  };
}

// ─── Banner ─────────────────────────────────────────────────────

export const BANNER_POSITIONS = ['HERO', 'SIDEBAR', 'POPUP', 'INLINE'] as const;
export const BANNER_LINK_TYPES = ['NONE', 'PRODUCT', 'CATEGORY', 'COLLECTION', 'EXTERNAL'] as const;
export const TARGET_AUDIENCES = ['ALL', 'NEW_CUSTOMERS', 'RETURNING', 'LOYALTY_MEMBERS'] as const;

export interface BannerFormValues {
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  linkType: string;
  position: string;
  targetAudience: string;
  displayOrder: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export const EMPTY_BANNER_FORM: BannerFormValues = {
  title: '', subtitle: '', imageUrl: '', linkUrl: '', linkType: 'NONE', position: 'HERO',
  targetAudience: 'ALL', displayOrder: '0', startDate: '', endDate: '', isActive: true,
};

export function buildBannerInput(f: BannerFormValues): Built {
  const errors: Record<string, string> = {};
  const title = f.title.trim();
  const subtitle = f.subtitle.trim();
  const imageUrl = f.imageUrl.trim();
  const linkUrl = f.linkUrl.trim();
  if (!title) errors.title = 'Title is required';
  else maxLen(errors, 'title', title, 255);
  maxLen(errors, 'subtitle', subtitle, 500);
  if (!imageUrl) errors.imageUrl = 'Image URL is required';
  else if (!isUrl(imageUrl)) errors.imageUrl = 'Enter a full URL, e.g. https://cdn.example.com/banner.jpg';
  else maxLen(errors, 'imageUrl', imageUrl, 1000);
  maxLen(errors, 'linkUrl', linkUrl, 1000);
  if (!(BANNER_POSITIONS as readonly string[]).includes(f.position)) errors.position = 'Choose a position';
  if (!(BANNER_LINK_TYPES as readonly string[]).includes(f.linkType)) errors.linkType = 'Choose a link type';
  if (!(TARGET_AUDIENCES as readonly string[]).includes(f.targetAudience)) errors.targetAudience = 'Choose an audience';
  if (f.startDate && f.endDate && f.startDate > f.endDate) errors.endDate = 'End date must be on or after the start date';
  const displayOrder = parseOrder(f.displayOrder, errors);
  const input: Record<string, unknown> = {
    title, imageUrl, linkType: f.linkType, position: f.position, targetAudience: f.targetAudience,
    displayOrder, isActive: f.isActive,
  };
  if (subtitle) input.subtitle = subtitle;
  if (linkUrl) input.linkUrl = linkUrl;
  if (f.startDate) input.startDate = f.startDate;
  if (f.endDate) input.endDate = f.endDate;
  return finish(input, errors);
}

// ─── Page ───────────────────────────────────────────────────────

export interface PageFormValues {
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  isPublished: boolean;
}

export const EMPTY_PAGE_FORM: PageFormValues = {
  title: '', slug: '', content: '', metaTitle: '', metaDescription: '', isPublished: false,
};

export function buildPageInput(f: PageFormValues): Built {
  const errors: Record<string, string> = {};
  const title = f.title.trim();
  const slug = (f.slug.trim() || slugify(title));
  const content = f.content.trim();
  const metaTitle = f.metaTitle.trim();
  const metaDescription = f.metaDescription.trim();
  if (!title) errors.title = 'Title is required';
  else maxLen(errors, 'title', title, 255);
  if (!slug) errors.slug = 'Slug is required';
  else if (!SLUG_RE.test(slug)) errors.slug = 'Use lowercase letters, numbers and hyphens only';
  if (!content) errors.content = 'Content is required';
  maxLen(errors, 'metaTitle', metaTitle, 255);
  maxLen(errors, 'metaDescription', metaDescription, 500);
  const input: Record<string, unknown> = { title, slug, content, isPublished: f.isPublished };
  if (metaTitle) input.metaTitle = metaTitle;
  if (metaDescription) input.metaDescription = metaDescription;
  return finish(input, errors);
}

// ─── Blog post ──────────────────────────────────────────────────

export interface BlogFormValues {
  title: string;
  slug: string;
  author: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  categoryTag: string;
  tags: string; // comma separated
  readTimeMinutes: string;
  isPublished: boolean;
}

export const EMPTY_BLOG_FORM: BlogFormValues = {
  title: '', slug: '', author: '', excerpt: '', content: '', coverImageUrl: '', categoryTag: '',
  tags: '', readTimeMinutes: '0', isPublished: false,
};

export function buildBlogInput(f: BlogFormValues): Built {
  const errors: Record<string, string> = {};
  const title = f.title.trim();
  const slug = f.slug.trim() || slugify(title);
  const author = f.author.trim();
  const content = f.content.trim();
  const cover = f.coverImageUrl.trim();
  const categoryTag = f.categoryTag.trim();
  const excerpt = f.excerpt.trim();
  if (!title) errors.title = 'Title is required';
  else maxLen(errors, 'title', title, 255);
  if (!slug) errors.slug = 'Slug is required';
  else if (!SLUG_RE.test(slug)) errors.slug = 'Use lowercase letters, numbers and hyphens only';
  if (!author) errors.author = 'Author is required';
  else maxLen(errors, 'author', author, 255);
  if (!content) errors.content = 'Content is required';
  if (cover && !isUrl(cover)) errors.coverImageUrl = 'Enter a full URL';
  maxLen(errors, 'categoryTag', categoryTag, 100);
  const rt = f.readTimeMinutes.trim() === '' ? 0 : Number(f.readTimeMinutes);
  if (!Number.isInteger(rt) || rt < 0) errors.readTimeMinutes = 'Read time must be a whole number of minutes';
  const tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
  const input: Record<string, unknown> = {
    title, slug, author, content, tags, readTimeMinutes: rt, isPublished: f.isPublished,
  };
  if (excerpt) input.excerpt = excerpt;
  if (cover) input.coverImageUrl = cover;
  if (categoryTag) input.categoryTag = categoryTag;
  return finish(input, errors);
}

// ─── Collection ─────────────────────────────────────────────────

export interface CollectionFormValues {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  displayOrder: string;
  isActive: boolean;
  isFeatured: boolean;
}

export const EMPTY_COLLECTION_FORM: CollectionFormValues = {
  name: '', slug: '', description: '', imageUrl: '', displayOrder: '0', isActive: true, isFeatured: false,
};

export function buildCollectionInput(f: CollectionFormValues): Built {
  const errors: Record<string, string> = {};
  const name = f.name.trim();
  const slug = f.slug.trim() || slugify(name);
  const description = f.description.trim();
  const imageUrl = f.imageUrl.trim();
  if (!name) errors.name = 'Name is required';
  else maxLen(errors, 'name', name, 255);
  if (!slug) errors.slug = 'Slug is required';
  else if (!SLUG_RE.test(slug)) errors.slug = 'Use lowercase letters, numbers and hyphens only';
  if (imageUrl && !isUrl(imageUrl)) errors.imageUrl = 'Enter a full URL';
  const displayOrder = parseOrder(f.displayOrder, errors);
  const input: Record<string, unknown> = {
    name, slug, products: [], displayOrder, isActive: f.isActive, isFeatured: f.isFeatured,
  };
  if (description) input.description = description;
  if (imageUrl) input.imageUrl = imageUrl;
  return finish(input, errors);
}

// ─── Edit helpers (prefill + partial updates) ───────────────────

const dateOnly = (v: unknown): string => {
  if (!v) return '';
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

export function bannerToForm(b: Record<string, unknown>): BannerFormValues {
  return {
    title: String(b.title ?? ''),
    subtitle: String(b.subtitle ?? ''),
    imageUrl: String(b.imageUrl ?? ''),
    linkUrl: String(b.linkUrl ?? ''),
    linkType: String(b.linkType ?? 'NONE'),
    position: String(b.position ?? 'HERO'),
    targetAudience: String(b.targetAudience ?? 'ALL'),
    displayOrder: String(b.displayOrder ?? 0),
    startDate: dateOnly(b.startDate),
    endDate: dateOnly(b.endDate),
    isActive: b.isActive !== false,
  };
}

export function pageToForm(p: Record<string, unknown>): PageFormValues {
  return {
    title: String(p.title ?? ''),
    slug: String(p.slug ?? ''),
    content: String(p.content ?? ''),
    metaTitle: String(p.metaTitle ?? ''),
    metaDescription: String(p.metaDescription ?? ''),
    isPublished: p.isPublished === true,
  };
}

export function blogToForm(p: Record<string, unknown>): BlogFormValues {
  return {
    title: String(p.title ?? ''),
    slug: String(p.slug ?? ''),
    author: String(p.author ?? ''),
    excerpt: String(p.excerpt ?? ''),
    content: String(p.content ?? ''),
    coverImageUrl: String(p.coverImageUrl ?? ''),
    categoryTag: String(p.categoryTag ?? ''),
    tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(String).join(', ') : '',
    readTimeMinutes: String(p.readTimeMinutes ?? 0),
    isPublished: p.isPublished === true,
  };
}

export function collectionToForm(c: Record<string, unknown>): CollectionFormValues {
  return {
    name: String(c.name ?? ''),
    slug: String(c.slug ?? ''),
    description: String(c.description ?? ''),
    imageUrl: String(c.imageUrl ?? ''),
    displayOrder: String(c.displayOrder ?? 0),
    isActive: c.isActive !== false,
    isFeatured: c.isFeatured === true,
  };
}

/**
 * Builds the `data` payload for a partial `update` procedure: only the fields
 * whose built value differs from the record's original values are sent, so
 * untouched fields (and fields the form cannot edit, such as a collection's
 * product list) are never reset. A text field in `clearable` that was emptied
 * is sent as '' so it can be cleared.
 */
export function diffInput(
  original: Record<string, unknown>,
  next: Record<string, unknown>,
  clearable: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    if (k === 'products') continue;
    if (JSON.stringify(v) !== JSON.stringify(original[k])) out[k] = v;
  }
  for (const k of clearable) {
    if (original[k] !== undefined && next[k] === undefined) out[k] = '';
  }
  return out;
}

/** Compares the built input of the untouched form against the edited form. */
export function buildUpdateData<T extends object>(
  build: (f: T) => Built,
  initial: T,
  edited: T,
  clearable: readonly string[] = [],
): Built {
  const next = build(edited);
  if (!next.input) return next;
  const original = build(initial).input ?? {};
  return { input: diffInput(original, next.input, clearable), errors: {} };
}
