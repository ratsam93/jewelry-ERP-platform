'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { FormDialog, Field, TextInput, SelectInput, CheckInput } from '@/components/form-dialog';
import {
  CHANNEL_TYPES, EMPTY_CHANNEL_FORM, buildChannelInput, formatServerError, type ChannelFormValues,
} from '@/lib/ecommerce-forms';

interface Props {
  /** When set the dialog edits this channel (blank credentials keep the stored values). */
  channel?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}

export function ChannelFormDialog({ channel, onClose, onSaved }: Props) {
  const editing = Boolean(channel);
  const [form, setForm] = useState<ChannelFormValues>(
    channel
      ? {
          ...EMPTY_CHANNEL_FORM,
          name: String(channel.name ?? ''),
          channelType: String(channel.channelType ?? 'WEBSITE'),
          storeUrl: String(channel.storeUrl ?? ''),
          isActive: channel.isActive !== false,
        }
      : EMPTY_CHANNEL_FORM,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const createMut = trpc.ecommerce.createChannel.useMutation();
  const updateMut = trpc.ecommerce.updateChannel.useMutation();
  const pending = createMut.isPending || updateMut.isPending;

  const set = <K extends keyof ChannelFormValues>(k: K, v: ChannelFormValues[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const { input, errors: errs } = buildChannelInput(form);
    setErrors(errs);
    setServerError(null);
    if (!input) return;
    try {
      if (editing) {
        await updateMut.mutateAsync({ channelId: String(channel!.id), data: input } as never);
      } else {
        await createMut.mutateAsync(input as never);
      }
      onSaved();
    } catch (e) {
      setServerError(formatServerError(e));
    }
  };

  return (
    <FormDialog
      title={editing ? 'Edit Channel' : 'New Channel'}
      submitLabel={editing ? 'Save changes' : 'Create channel'}
      submitting={pending}
      error={serverError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Channel name *" error={errors.name}>
        <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Shopify store" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Channel type *" error={errors.channelType}>
          <SelectInput value={form.channelType} onChange={(e) => set('channelType', e.target.value)}>
            {CHANNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>
        </Field>
        <Field label="Store URL" error={errors.storeUrl}>
          <TextInput value={form.storeUrl} onChange={(e) => set('storeUrl', e.target.value)} placeholder="https://shop.example.com" />
        </Field>
      </div>
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium uppercase text-muted-foreground">API credentials</legend>
        {editing && <p className="text-xs text-muted-foreground">Stored credentials are never shown. Leave blank to keep them.</p>}
        <Field label="API key" error={errors.apiKey}>
          <TextInput type="password" autoComplete="off" value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} />
        </Field>
        <Field label="API secret" error={errors.apiSecret}>
          <TextInput type="password" autoComplete="off" value={form.apiSecret} onChange={(e) => set('apiSecret', e.target.value)} />
        </Field>
        <Field label="Webhook secret" error={errors.webhookSecret}>
          <TextInput type="password" autoComplete="off" value={form.webhookSecret} onChange={(e) => set('webhookSecret', e.target.value)} />
        </Field>
      </fieldset>
      <CheckInput label="Active" checked={form.isActive} onChange={(v) => set('isActive', v)} />
    </FormDialog>
  );
}
