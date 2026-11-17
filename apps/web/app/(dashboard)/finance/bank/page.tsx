'use client';

import * as React from 'react';
import { PageHeader, EmptyState } from '@caratflow/ui';
import { Landmark, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import {
  BANK_ACCOUNT_TYPES,
  bankLedgerAccountDraft,
  buildBankInput,
  readableError,
  type BankFormValues,
} from '@/lib/finance-forms';

const EMPTY: BankFormValues = {
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  accountType: 'Current',
  ledgerAccountId: '',
  openingBalance: '',
  isDefault: false,
};

const inputCls = 'mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm';

export default function BankAccountsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, isError } = trpc.financial.bank.listAccounts.useQuery();
  const accounts = (data as Array<Record<string, unknown>> | undefined) ?? [];

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<BankFormValues>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const ledgerQuery = trpc.financial.accounts.list.useQuery({ type: 'ASSET' } as never, { enabled: open } as never);
  const ledgerAccounts = (ledgerQuery.data as Array<{ id: string; code: string; name: string }> | undefined) ?? [];

  const createLedger = trpc.financial.accounts.create.useMutation();
  const createBank = trpc.financial.bank.createAccount.useMutation();

  const set = <K extends keyof BankFormValues>(key: K, value: BankFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const n = { ...e };
      delete n[key];
      return n;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const { input, errors: errs } = buildBankInput(form);
    setErrors(errs);
    if (!input) return;
    setSaving(true);
    try {
      let accountId = form.ledgerAccountId;
      if (!accountId) {
        // The bank account is backed by a ledger (asset) account: create one.
        // A previous attempt may already have created it: reuse by code.
        const draft = bankLedgerAccountDraft(form);
        const existing = ledgerAccounts.find((l) => l.code === draft.code);
        if (existing) accountId = existing.id;
        else {
          const ledger = (await createLedger.mutateAsync(draft as never)) as { id?: string };
          if (!ledger?.id) throw new Error('Could not create the ledger account for this bank account.');
          accountId = ledger.id;
        }
      }
      await createBank.mutateAsync({ ...input, accountId } as never);
      setSuccess(`Bank account ${form.bankName.trim()} added.`);
      setForm(EMPTY);
      setOpen(false);
      void utils.financial.bank.listAccounts.invalidate();
      void utils.financial.accounts.list.invalidate();
    } catch (err) {
      setServerError(readableError(err, 'Could not add the bank account.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Accounts"
        description="Bank ledger and reconciliation."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Bank' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              setServerError(null);
              setSuccess(null);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Add bank account
          </button>
        }
      />

      {success && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}

      {open && (
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          aria-label="Add bank account"
          className="space-y-4 rounded-lg border bg-card p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bk-name" className="block text-sm font-medium">Bank name *</label>
              <input id="bk-name" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} aria-invalid={errors.bankName ? true : undefined} className={inputCls} />
              {errors.bankName && <p role="alert" className="mt-1 text-xs text-red-600">{errors.bankName}</p>}
            </div>
            <div>
              <label htmlFor="bk-acc" className="block text-sm font-medium">Account number *</label>
              <input id="bk-acc" value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} aria-invalid={errors.accountNumber ? true : undefined} className={inputCls} />
              {errors.accountNumber && <p role="alert" className="mt-1 text-xs text-red-600">{errors.accountNumber}</p>}
            </div>
            <div>
              <label htmlFor="bk-ifsc" className="block text-sm font-medium">IFSC code *</label>
              <input
                id="bk-ifsc"
                value={form.ifscCode}
                maxLength={11}
                placeholder="HDFC0001234"
                onChange={(e) => set('ifscCode', e.target.value.toUpperCase())}
                aria-invalid={errors.ifscCode ? true : undefined}
                className={`${inputCls} font-mono`}
              />
              {errors.ifscCode && <p role="alert" className="mt-1 text-xs text-red-600">{errors.ifscCode}</p>}
            </div>
            <div>
              <label htmlFor="bk-branch" className="block text-sm font-medium">Branch</label>
              <input id="bk-branch" value={form.branchName} onChange={(e) => set('branchName', e.target.value)} className={inputCls} />
              {errors.branchName && <p role="alert" className="mt-1 text-xs text-red-600">{errors.branchName}</p>}
            </div>
            <div>
              <label htmlFor="bk-type" className="block text-sm font-medium">Account type</label>
              <select id="bk-type" value={form.accountType} onChange={(e) => set('accountType', e.target.value)} className={inputCls}>
                {BANK_ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bk-open" className="block text-sm font-medium">Opening balance (INR)</label>
              <input id="bk-open" inputMode="decimal" placeholder="0.00" value={form.openingBalance} onChange={(e) => set('openingBalance', e.target.value)} aria-invalid={errors.openingBalance ? true : undefined} className={inputCls} />
              {errors.openingBalance && <p role="alert" className="mt-1 text-xs text-red-600">{errors.openingBalance}</p>}
            </div>
            <div>
              <label htmlFor="bk-ledger" className="block text-sm font-medium">Ledger account</label>
              <select id="bk-ledger" value={form.ledgerAccountId} onChange={(e) => set('ledgerAccountId', e.target.value)} className={inputCls}>
                <option value="">Create a new ledger account</option>
                {ledgerAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
              Make default account
            </label>
          </div>
          {serverError && (
            <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save bank account'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b bg-muted/50 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
          <span>Ledger Account</span>
          <span>Account #</span>
          <span>Bank</span>
          <span>IFSC</span>
          <span>Branch</span>
          <span>Balance</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-destructive">Failed to load bank accounts.</div>
        ) : accounts.length === 0 ? (
          <EmptyState icon={<Landmark className="h-8 w-8" />} title="No bank accounts" />
        ) : (
          <div className="divide-y">
            {accounts.map((a) => {
              const ledger = a.account as { name?: string } | null | undefined;
              return (
                <div key={a.id as string} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 text-sm">
                  <span className="font-medium">
                    {ledger?.name ?? (a.accountName as string) ?? '-'}
                    {a.isDefault ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">Default</span> : null}
                  </span>
                  <span className="font-mono text-xs">{(a.accountNumber as string) ?? '-'}</span>
                  <span>{(a.bankName as string) ?? '-'}</span>
                  <span className="font-mono text-xs">{(a.ifscCode as string) ?? '-'}</span>
                  <span>{(a.branchName as string) ?? (a.branch as string) ?? '-'}</span>
                  <span className="font-semibold">{formatPaise(a.currentBalancePaise)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
