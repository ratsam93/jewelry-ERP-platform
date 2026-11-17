'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { Image as ImageIcon, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { BannerFormDialog } from '@/features/cms/CmsFormDialogs';
import { CmsRowActions, useCmsDelete } from '@/features/cms/useCmsDelete';

export default function BannersPage() {
  const { data, isLoading, refetch } = trpc.cms.banners.list.useQuery({});
  const [dialog, setDialog] = useState<null | 'new' | Record<string, unknown>>(null);
  const deleteMut = trpc.cms.banners.delete.useMutation();
  const del = useCmsDelete({ noun: 'banner', remove: (id) => deleteMut.mutateAsync({ id } as never), onDone: () => void refetch() });
  const items = ((data as Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> } | undefined));
  const rows = Array.isArray(items) ? items : (items?.items ?? []);

  return (
    <div className="space-y-6">
      <PageHeader title="Banners" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'CMS', href: '/cms' },
        { label: 'Banners' },
      ]} actions={
        <button type="button" onClick={() => setDialog('new')} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New Banner
        </button>
      } />
      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_0.8fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Title</span>
          <span>Position</span>
          <span>Sort</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ImageIcon className="h-8 w-8" />} title="No banners" />
        ) : (
          <div className="divide-y">
            {rows.map((b) => (
              <div key={b.id as string} className="grid grid-cols-[2fr_1fr_1fr_0.8fr_1fr] items-center gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{(b.title as string) ?? '-'}</span>
                <span>{(b.position as string) ?? '-'}</span>
                <span>{String(b.displayOrder ?? 0)}</span>
                <StatusBadge label={b.isActive ? 'Active' : 'Inactive'} variant={b.isActive ? 'success' : 'default'} />
                <CmsRowActions name={String(b.title ?? 'banner')} onEdit={() => setDialog(b)} onDelete={() => del.ask(b.id, b.title)} />
              </div>
            ))}
          </div>
        )}
      </div>
      {dialog && (
        <BannerFormDialog
          banner={dialog === 'new' ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void refetch(); }}
        />
      )}
      {del.dialog}
    </div>
  );
}
