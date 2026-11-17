'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { Grid3x3, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CollectionFormDialog } from '@/features/cms/CmsFormDialogs';
import { CmsRowActions, useCmsDelete } from '@/features/cms/useCmsDelete';

export default function CollectionsPage() {
  const { data, isLoading, refetch } = trpc.cms.collections.list.useQuery({});
  const [dialog, setDialog] = useState<null | 'new' | Record<string, unknown>>(null);
  const deleteMut = trpc.cms.collections.delete.useMutation();
  const del = useCmsDelete({ noun: 'collection', remove: (id) => deleteMut.mutateAsync({ id } as never), onDone: () => void refetch() });
  const items = ((data as Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> } | undefined));
  const rows = Array.isArray(items) ? items : (items?.items ?? []);

  return (
    <div className="space-y-6">
      <PageHeader title="Collections" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'CMS', href: '/cms' },
        { label: 'Collections' },
      ]} actions={
        <button type="button" onClick={() => setDialog('new')} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Collection
        </button>
      } />
      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_0.8fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Slug</span>
          <span>Products</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Grid3x3 className="h-8 w-8" />} title="No collections" />
        ) : (
          <div className="divide-y">
            {rows.map((c) => (
              <div key={c.id as string} className="grid grid-cols-[2fr_1fr_1fr_0.8fr_1fr] items-center gap-4 px-4 py-3 text-sm hover:bg-accent">
                <Link href={`/cms/collections/${c.id}`} className="font-medium hover:underline">{(c.name as string) ?? '-'}</Link>
                <span className="font-mono text-xs text-muted-foreground">{(c.slug as string) ?? '-'}</span>
                <span>{String((c.products as unknown[] | null | undefined)?.length ?? 0)}</span>
                <StatusBadge label={c.isActive ? 'Active' : 'Inactive'} variant={c.isActive ? 'success' : 'default'} />
                <CmsRowActions name={String(c.name ?? 'collection')} onEdit={() => setDialog(c)} onDelete={() => del.ask(c.id, c.name)} />
              </div>
            ))}
          </div>
        )}
      </div>
      {dialog && (
        <CollectionFormDialog
          collection={dialog === 'new' ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void refetch(); }}
        />
      )}
      {del.dialog}
    </div>
  );
}
