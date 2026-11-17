'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { FileText, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { BlogFormDialog } from '@/features/cms/CmsFormDialogs';
import { CmsRowActions, useCmsDelete } from '@/features/cms/useCmsDelete';
import { formatDate } from '@/components/format';

export default function BlogPostsPage() {
  const { data, isLoading, refetch } = trpc.cms.blog.list.useQuery({});
  const [dialog, setDialog] = useState<null | 'new' | Record<string, unknown>>(null);
  const deleteMut = trpc.cms.blog.delete.useMutation();
  const del = useCmsDelete({ noun: 'post', remove: (id) => deleteMut.mutateAsync({ id } as never), onDone: () => void refetch() });
  const items = ((data as Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> } | undefined));
  const rows = Array.isArray(items) ? items : (items?.items ?? []);

  return (
    <div className="space-y-6">
      <PageHeader title="Blog Posts" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'CMS', href: '/cms' },
        { label: 'Blog' },
      ]} actions={
        <button type="button" onClick={() => setDialog('new')} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Post
        </button>
      } />
      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Title</span>
          <span>Author</span>
          <span>Status</span>
          <span>Published</span>
          <span>Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No posts" />
        ) : (
          <div className="divide-y">
            {rows.map((p) => (
              <div key={p.id as string} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-4 px-4 py-3 text-sm hover:bg-accent">
                <Link href={`/cms/blog/${p.id}`} className="font-medium hover:underline">{(p.title as string) ?? '-'}</Link>
                <span>{(p.author as string) ?? '-'}</span>
                <StatusBadge label={p.isPublished ? 'Published' : 'Draft'} variant={p.isPublished ? 'success' : 'default'} />
                <span className="text-muted-foreground">{formatDate(p.publishedAt)}</span>
                <CmsRowActions name={String(p.title ?? 'post')} onEdit={() => setDialog(p)} onDelete={() => del.ask(p.id, p.title)} />
              </div>
            ))}
          </div>
        )}
      </div>
      {dialog && (
        <BlogFormDialog
          post={dialog === 'new' ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void refetch(); }}
        />
      )}
      {del.dialog}
    </div>
  );
}
