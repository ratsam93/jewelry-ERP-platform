'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { FormDialog, Field, TextInput, TextArea, SelectInput, CheckInput } from '@/components/form-dialog';
import {
  BANNER_LINK_TYPES, BANNER_POSITIONS, TARGET_AUDIENCES,
  EMPTY_BANNER_FORM, EMPTY_BLOG_FORM, EMPTY_COLLECTION_FORM, EMPTY_FAQ_FORM, EMPTY_PAGE_FORM,
  buildBannerInput, buildBlogInput, buildCollectionInput, buildFaqInput, buildPageInput,
  faqToForm, bannerToForm, pageToForm, blogToForm, collectionToForm, buildUpdateData, formatServerError, slugify,
  type Built,
} from '@/lib/cms-forms';

interface DialogProps {
  onClose: () => void;
  onSaved: () => void;
}

/** Shared state/submit plumbing for all CMS dialogs. */
function useDialogForm<T extends object>(initial: T, build: (f: T) => Built, save: (input: Record<string, unknown>) => Promise<unknown>, onSaved: () => void) {
  const [form, setForm] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof T>(k: K, v: T[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    const { input, errors: errs } = build(form);
    setErrors(errs);
    setServerError(null);
    if (!input) return;
    setPending(true);
    try {
      await save(input);
      onSaved();
    } catch (e) {
      setServerError(formatServerError(e));
    } finally {
      setPending(false);
    }
  };
  return { form, set, errors, serverError, pending, submit };
}

/** Wraps a build fn so editing sends only the changed fields (see buildUpdateData). */
function editBuild<T extends object>(build: (f: T) => Built, initial: T, editing: boolean, clearable: readonly string[]) {
  return editing ? (f: T) => buildUpdateData(build, initial, f, clearable) : build;
}

const saveUpdate = (mut: { mutateAsync: (v: never) => Promise<unknown> }, id: unknown) => (input: Record<string, unknown>) =>
  Object.keys(input).length === 0 ? Promise.resolve() : mut.mutateAsync({ id: String(id), data: input } as never);

// ─── FAQ ────────────────────────────────────────────────────────

export function FaqFormDialog({ faq, onClose, onSaved }: DialogProps & { faq?: Record<string, unknown> }) {
  const createMut = trpc.cms.faq.create.useMutation();
  const updateMut = trpc.cms.faq.update.useMutation();
  const f = useDialogForm(
    faq ? faqToForm(faq) : EMPTY_FAQ_FORM,
    buildFaqInput,
    (input) => (faq
      ? updateMut.mutateAsync({ id: String(faq.id), data: input } as never)
      : createMut.mutateAsync(input as never)),
    onSaved,
  );
  return (
    <FormDialog title={faq ? 'Edit FAQ' : 'New FAQ'} submitLabel={faq ? 'Save changes' : 'Create FAQ'} submitting={f.pending} error={f.serverError} onSubmit={f.submit} onClose={onClose}>
      <Field label="Question *" error={f.errors.question}>
        <TextInput value={f.form.question} onChange={(e) => f.set('question', e.target.value)} />
      </Field>
      <Field label="Answer *" error={f.errors.answer}>
        <TextArea rows={5} value={f.form.answer} onChange={(e) => f.set('answer', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={f.errors.category}>
          <TextInput value={f.form.category} onChange={(e) => f.set('category', e.target.value)} placeholder="e.g. Shipping" />
        </Field>
        <Field label="Display order" error={f.errors.displayOrder}>
          <TextInput inputMode="numeric" value={f.form.displayOrder} onChange={(e) => f.set('displayOrder', e.target.value)} />
        </Field>
      </div>
      <CheckInput label="Published" checked={f.form.isPublished} onChange={(v) => f.set('isPublished', v)} />
    </FormDialog>
  );
}

// ─── Banner ─────────────────────────────────────────────────────

export function BannerFormDialog({ banner, onClose, onSaved }: DialogProps & { banner?: Record<string, unknown> }) {
  const createMut = trpc.cms.banners.create.useMutation();
  const updateMut = trpc.cms.banners.update.useMutation();
  const initial = banner ? bannerToForm(banner) : EMPTY_BANNER_FORM;
  const f = useDialogForm(
    initial,
    editBuild(buildBannerInput, initial, !!banner, ['subtitle', 'linkUrl']),
    banner ? saveUpdate(updateMut, banner.id) : (i) => createMut.mutateAsync(i as never),
    onSaved,
  );
  return (
    <FormDialog title={banner ? 'Edit Banner' : 'New Banner'} submitLabel={banner ? 'Save changes' : 'Create banner'} submitting={f.pending} error={f.serverError} onSubmit={f.submit} onClose={onClose}>
      <Field label="Title *" error={f.errors.title}>
        <TextInput value={f.form.title} onChange={(e) => f.set('title', e.target.value)} />
      </Field>
      <Field label="Subtitle" error={f.errors.subtitle}>
        <TextInput value={f.form.subtitle} onChange={(e) => f.set('subtitle', e.target.value)} />
      </Field>
      <Field label="Image URL *" error={f.errors.imageUrl}>
        <TextInput value={f.form.imageUrl} onChange={(e) => f.set('imageUrl', e.target.value)} placeholder="https://..." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Link type" error={f.errors.linkType}>
          <SelectInput value={f.form.linkType} onChange={(e) => f.set('linkType', e.target.value)}>
            {BANNER_LINK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="Link URL" error={f.errors.linkUrl}>
          <TextInput value={f.form.linkUrl} onChange={(e) => f.set('linkUrl', e.target.value)} />
        </Field>
        <Field label="Position" error={f.errors.position}>
          <SelectInput value={f.form.position} onChange={(e) => f.set('position', e.target.value)}>
            {BANNER_POSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="Audience" error={f.errors.targetAudience}>
          <SelectInput value={f.form.targetAudience} onChange={(e) => f.set('targetAudience', e.target.value)}>
            {TARGET_AUDIENCES.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="Start date" error={f.errors.startDate}>
          <TextInput type="date" value={f.form.startDate} onChange={(e) => f.set('startDate', e.target.value)} />
        </Field>
        <Field label="End date" error={f.errors.endDate}>
          <TextInput type="date" value={f.form.endDate} onChange={(e) => f.set('endDate', e.target.value)} />
        </Field>
        <Field label="Display order" error={f.errors.displayOrder}>
          <TextInput inputMode="numeric" value={f.form.displayOrder} onChange={(e) => f.set('displayOrder', e.target.value)} />
        </Field>
      </div>
      <CheckInput label="Active" checked={f.form.isActive} onChange={(v) => f.set('isActive', v)} />
    </FormDialog>
  );
}

// ─── Page ───────────────────────────────────────────────────────

export function PageFormDialog({ page, onClose, onSaved }: DialogProps & { page?: Record<string, unknown> }) {
  const createMut = trpc.cms.pages.create.useMutation();
  const updateMut = trpc.cms.pages.update.useMutation();
  const initial = page ? pageToForm(page) : EMPTY_PAGE_FORM;
  const f = useDialogForm(
    initial,
    editBuild(buildPageInput, initial, !!page, ['metaTitle', 'metaDescription']),
    page ? saveUpdate(updateMut, page.id) : (i) => createMut.mutateAsync(i as never),
    onSaved,
  );
  return (
    <FormDialog title={page ? 'Edit Page' : 'New Page'} submitLabel={page ? 'Save changes' : 'Create page'} submitting={f.pending} error={f.serverError} onSubmit={f.submit} onClose={onClose}>
      <Field label="Title *" error={f.errors.title}>
        <TextInput value={f.form.title} onChange={(e) => f.set('title', e.target.value)} />
      </Field>
      <Field label="Slug" error={f.errors.slug} hint={`Leave blank to use "${slugify(f.form.title) || 'the-title'}"`}>
        <TextInput value={f.form.slug} onChange={(e) => f.set('slug', e.target.value)} />
      </Field>
      <Field label="Content *" error={f.errors.content}>
        <TextArea rows={8} value={f.form.content} onChange={(e) => f.set('content', e.target.value)} />
      </Field>
      <Field label="Meta title" error={f.errors.metaTitle}>
        <TextInput value={f.form.metaTitle} onChange={(e) => f.set('metaTitle', e.target.value)} />
      </Field>
      <Field label="Meta description" error={f.errors.metaDescription}>
        <TextArea rows={2} value={f.form.metaDescription} onChange={(e) => f.set('metaDescription', e.target.value)} />
      </Field>
      <CheckInput label="Published" checked={f.form.isPublished} onChange={(v) => f.set('isPublished', v)} />
    </FormDialog>
  );
}

// ─── Blog post ──────────────────────────────────────────────────

export function BlogFormDialog({ post, onClose, onSaved }: DialogProps & { post?: Record<string, unknown> }) {
  const createMut = trpc.cms.blog.create.useMutation();
  const updateMut = trpc.cms.blog.update.useMutation();
  const initial = post ? blogToForm(post) : EMPTY_BLOG_FORM;
  const f = useDialogForm(
    initial,
    editBuild(buildBlogInput, initial, !!post, ['excerpt', 'categoryTag']),
    post ? saveUpdate(updateMut, post.id) : (i) => createMut.mutateAsync(i as never),
    onSaved,
  );
  return (
    <FormDialog title={post ? 'Edit Post' : 'New Post'} submitLabel={post ? 'Save changes' : 'Create post'} submitting={f.pending} error={f.serverError} onSubmit={f.submit} onClose={onClose}>
      <Field label="Title *" error={f.errors.title}>
        <TextInput value={f.form.title} onChange={(e) => f.set('title', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug" error={f.errors.slug} hint={`Leave blank to use "${slugify(f.form.title) || 'the-title'}"`}>
          <TextInput value={f.form.slug} onChange={(e) => f.set('slug', e.target.value)} />
        </Field>
        <Field label="Author *" error={f.errors.author}>
          <TextInput value={f.form.author} onChange={(e) => f.set('author', e.target.value)} />
        </Field>
        <Field label="Category" error={f.errors.categoryTag}>
          <TextInput value={f.form.categoryTag} onChange={(e) => f.set('categoryTag', e.target.value)} />
        </Field>
        <Field label="Tags (comma separated)" error={f.errors.tags}>
          <TextInput value={f.form.tags} onChange={(e) => f.set('tags', e.target.value)} />
        </Field>
        <Field label="Cover image URL" error={f.errors.coverImageUrl}>
          <TextInput value={f.form.coverImageUrl} onChange={(e) => f.set('coverImageUrl', e.target.value)} />
        </Field>
        <Field label="Read time (minutes)" error={f.errors.readTimeMinutes}>
          <TextInput inputMode="numeric" value={f.form.readTimeMinutes} onChange={(e) => f.set('readTimeMinutes', e.target.value)} />
        </Field>
      </div>
      <Field label="Excerpt" error={f.errors.excerpt}>
        <TextArea rows={2} value={f.form.excerpt} onChange={(e) => f.set('excerpt', e.target.value)} />
      </Field>
      <Field label="Content *" error={f.errors.content}>
        <TextArea rows={8} value={f.form.content} onChange={(e) => f.set('content', e.target.value)} />
      </Field>
      <CheckInput label="Published" checked={f.form.isPublished} onChange={(v) => f.set('isPublished', v)} />
    </FormDialog>
  );
}

// ─── Collection ─────────────────────────────────────────────────

export function CollectionFormDialog({ collection, onClose, onSaved }: DialogProps & { collection?: Record<string, unknown> }) {
  const createMut = trpc.cms.collections.create.useMutation();
  const updateMut = trpc.cms.collections.update.useMutation();
  const initial = collection ? collectionToForm(collection) : EMPTY_COLLECTION_FORM;
  const f = useDialogForm(
    initial,
    editBuild(buildCollectionInput, initial, !!collection, ['description']),
    collection ? saveUpdate(updateMut, collection.id) : (i) => createMut.mutateAsync(i as never),
    onSaved,
  );
  return (
    <FormDialog title={collection ? 'Edit Collection' : 'New Collection'} submitLabel={collection ? 'Save changes' : 'Create collection'} submitting={f.pending} error={f.serverError} onSubmit={f.submit} onClose={onClose}>
      <Field label="Name *" error={f.errors.name}>
        <TextInput value={f.form.name} onChange={(e) => f.set('name', e.target.value)} />
      </Field>
      <Field label="Slug" error={f.errors.slug} hint={`Leave blank to use "${slugify(f.form.name) || 'the-name'}"`}>
        <TextInput value={f.form.slug} onChange={(e) => f.set('slug', e.target.value)} />
      </Field>
      <Field label="Description" error={f.errors.description}>
        <TextArea rows={3} value={f.form.description} onChange={(e) => f.set('description', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Image URL" error={f.errors.imageUrl}>
          <TextInput value={f.form.imageUrl} onChange={(e) => f.set('imageUrl', e.target.value)} />
        </Field>
        <Field label="Display order" error={f.errors.displayOrder}>
          <TextInput inputMode="numeric" value={f.form.displayOrder} onChange={(e) => f.set('displayOrder', e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-6">
        <CheckInput label="Active" checked={f.form.isActive} onChange={(v) => f.set('isActive', v)} />
        <CheckInput label="Featured" checked={f.form.isFeatured} onChange={(v) => f.set('isFeatured', v)} />
      </div>
    </FormDialog>
  );
}
