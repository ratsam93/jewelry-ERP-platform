'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { HelpCircle, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { FaqFormDialog } from '@/features/cms/CmsFormDialogs';
import { CmsRowActions, useCmsDelete } from '@/features/cms/useCmsDelete';

const COLS = 'grid-cols-[3fr_1fr_0.6fr_0.9fr_1.1fr]';

export default function FaqPage() {
  const { data, isLoading, refetch } = trpc.cms.faq.list.useQuery({});
  const items = ((data as Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> } | undefined));
  const rows = Array.isArray(items) ? items : (items?.items ?? []);
  // `null` = closed, `'new'` = create dialog, otherwise the FAQ being edited.
  const [dialog, setDialog] = useState<null | 'new' | Record<string, unknown>>(null);
  const deleteMut = trpc.cms.faq.delete.useMutation();
  const del = useCmsDelete({ noun: 'FAQ', remove: (id) => deleteMut.mutateAsync({ id } as never), onDone: () => void refetch() });

  return (
    <div className="space-y-6">
      <PageHeader title="FAQ" breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'CMS', href: '/cms' },
        { label: 'FAQ' },
      ]} actions={
        <button type="button" onClick={() => setDialog('new')} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New FAQ
        </button>
      } />
      <div className="rounded-lg border">
        <div className={`grid ${COLS} gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground`}>
          <span>Question</span>
          <span>Category</span>
          <span>Order</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<HelpCircle className="h-8 w-8" />} title="No FAQ entries" />
        ) : (
          <div className="divide-y">
            {rows.map((f) => (
              <div key={f.id as string} className={`grid ${COLS} items-center gap-4 px-4 py-3 text-sm`}>
                <span className="truncate">{(f.question as string) ?? '-'}</span>
                <span>{(f.category as string) ?? '-'}</span>
                <span>{String(f.displayOrder ?? 0)}</span>
                <StatusBadge label={f.isPublished ? 'Published' : 'Draft'} variant={f.isPublished ? 'success' : 'default'} />
                <CmsRowActions name={String(f.question ?? 'FAQ')} onEdit={() => setDialog(f)} onDelete={() => del.ask(f.id, f.question)} />
              </div>
            ))}
          </div>
        )}
      </div>
      {del.dialog}
      {dialog && (
        <FaqFormDialog
          faq={dialog === 'new' ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void refetch(); }}
        />
      )}
    </div>
  );
}
