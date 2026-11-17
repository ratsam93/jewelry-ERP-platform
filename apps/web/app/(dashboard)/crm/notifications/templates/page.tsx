'use client';

import { useState } from 'react';
import { PageHeader, StatusBadge, EmptyState } from '@caratflow/ui';
import { FileText, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatServerError } from '@/lib/manufacturing-forms';
import {
  EMPTY_TEMPLATE,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CHANNELS,
  extractVariables,
  renderTemplatePreview,
  toTemplatePayload,
  validateTemplate,
  type TemplateFormValues,
} from '@/features/notifications/template-utils';

type Template = {
  id: string;
  name: string;
  channel: string;
  category: string;
  subject?: string | null;
  body: string;
  isActive: boolean;
};

const label = (list: ReadonlyArray<{ value: string; label: string }>, v: string) =>
  list.find((o) => o.value === v)?.label ?? v;

export default function NotificationTemplatesPage() {
  const { data, isLoading, isError, error, refetch } = trpc.crm.notificationTemplateList.useQuery();
  const items = ((data as Template[] | undefined) ?? []) as Template[];

  const [editing, setEditing] = useState<{ id: string | null; values: TemplateFormValues } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const done = (message: string) => {
    setBanner({ type: 'success', message });
    setEditing(null);
    setErrors({});
    void refetch();
  };
  const fail = (err: unknown) => setBanner({ type: 'error', message: formatServerError(err) });

  const createMutation = trpc.crm.notificationTemplateCreate.useMutation({
    onSuccess: () => done('Template created.'),
    onError: fail,
  });
  const updateMutation = trpc.crm.notificationTemplateUpdate.useMutation({
    onSuccess: () => done('Template updated.'),
    onError: fail,
  });
  const deleteMutation = trpc.crm.notificationTemplateDelete.useMutation({
    onSuccess: () => {
      setBanner({ type: 'success', message: 'Template deleted.' });
      void refetch();
    },
    onError: fail,
  });

  const startEdit = (t: Template) =>
    setEditing({
      id: t.id,
      values: {
        name: t.name,
        channel: t.channel as TemplateFormValues['channel'],
        category: t.category as TemplateFormValues['category'],
        subject: t.subject ?? '',
        body: t.body,
        isActive: t.isActive,
      },
    });

  const handleSave = () => {
    if (!editing) return;
    const found = validateTemplate(editing.values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const payload = toTemplatePayload(editing.values);
    if (editing.id) updateMutation.mutate({ id: editing.id, ...payload } as never);
    else createMutation.mutate(payload as never);
  };

  const handleDelete = (t: Template) => {
    if (!window.confirm(`Delete the template "${t.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ id: t.id });
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const v = editing?.values;
  const set = (patch: Partial<TemplateFormValues>) =>
    setEditing((cur) => (cur ? { ...cur, values: { ...cur.values, ...patch } } : cur));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Templates"
        description="Reusable templates for SMS, email, and WhatsApp."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'CRM', href: '/crm' },
          { label: 'Notifications', href: '/crm/notifications' },
          { label: 'Templates' },
        ]}
        actions={
          <button
            onClick={() => {
              setBanner(null);
              setErrors({});
              setEditing({ id: null, values: { ...EMPTY_TEMPLATE } });
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        }
      />

      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`rounded-md border p-3 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      {editing && v && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">{editing.id ? 'Edit Template' : 'New Template'}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium" htmlFor="nt-name">
                Name <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <input
                id="nt-name"
                value={v.name}
                onChange={(e) => set({ name: e.target.value })}
                aria-invalid={!!errors.name}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${errors.name ? 'border-red-500' : ''}`}
                placeholder="e.g. Invoice ready"
              />
              {errors.name && <p role="alert" className="mt-1 text-xs text-red-600">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="nt-channel">Channel</label>
              <select
                id="nt-channel"
                value={v.channel}
                onChange={(e) => set({ channel: e.target.value as TemplateFormValues['channel'] })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                {TEMPLATE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="nt-category">Category</label>
              <select
                id="nt-category"
                value={v.category}
                onChange={(e) => set({ category: e.target.value as TemplateFormValues['category'] })}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {v.channel === 'EMAIL' && (
              <div className="md:col-span-3">
                <label className="block text-sm font-medium" htmlFor="nt-subject">
                  Subject <span className="text-red-600" aria-hidden="true">*</span>
                </label>
                <input
                  id="nt-subject"
                  value={v.subject}
                  onChange={(e) => set({ subject: e.target.value })}
                  aria-invalid={!!errors.subject}
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${errors.subject ? 'border-red-500' : ''}`}
                  placeholder="Your invoice {{invoiceNumber}} is ready"
                />
                {errors.subject && <p role="alert" className="mt-1 text-xs text-red-600">{errors.subject}</p>}
              </div>
            )}
            <div className="md:col-span-3">
              <label className="block text-sm font-medium" htmlFor="nt-body">
                Message <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <textarea
                id="nt-body"
                rows={5}
                value={v.body}
                onChange={(e) => set({ body: e.target.value })}
                aria-invalid={!!errors.body}
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${errors.body ? 'border-red-500' : ''}`}
                placeholder="Hello {{customerName}}, your invoice {{invoiceNumber}} for {{amount}} is ready."
              />
              {errors.body && <p role="alert" className="mt-1 text-xs text-red-600">{errors.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Use {'{{variable}}'} placeholders. Variables detected:{' '}
                {extractVariables(v.body, v.channel === 'EMAIL' ? v.subject : '').join(', ') || 'none'}
              </p>
            </div>
            <div className="md:col-span-3">
              <p className="text-sm font-medium">Preview (sample data)</p>
              <div className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                {v.channel === 'EMAIL' && v.subject && (
                  <p className="mb-2 font-medium">{renderTemplatePreview(v.subject)}</p>
                )}
                {v.body ? renderTemplatePreview(v.body) : (
                  <span className="text-muted-foreground">Start typing a message to see the preview.</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="nt-active"
                type="checkbox"
                checked={v.isActive}
                onChange={(e) => set({ isActive: e.target.checked })}
                className="h-4 w-4 rounded border"
              />
              <label htmlFor="nt-active" className="text-sm font-medium">Active</label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                setEditing(null);
                setErrors({});
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing.id ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Name</span>
          <span>Channel</span>
          <span>Category</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div role="alert" className="py-12 text-center text-sm text-red-700">
            Could not load templates: {formatServerError(error)}{' '}
            <button onClick={() => void refetch()} className="underline">Retry</button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No templates yet"
            description="Create a template to reuse messages across SMS, email, and WhatsApp."
          />
        ) : (
          <div className="divide-y">
            {items.map((t) => (
              <div key={t.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-4 px-4 py-3 text-sm">
                <span className="font-medium">{t.name ?? '-'}</span>
                <span>{label(TEMPLATE_CHANNELS, t.channel)}</span>
                <span className="text-muted-foreground">{label(TEMPLATE_CATEGORIES, t.category)}</span>
                <StatusBadge label={t.isActive ? 'Active' : 'Inactive'} variant={t.isActive ? 'success' : 'default'} />
                <span className="flex justify-end gap-3 text-xs">
                  <button onClick={() => startEdit(t)} className="text-primary hover:underline">Edit</button>
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
