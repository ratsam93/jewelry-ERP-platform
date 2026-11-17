'use client';

import { useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc';
import {
  buildEnrollInput,
  readableError,
  todayInput,
  type FieldErrors,
} from '@/lib/finance-form';
import { FormError, SelectField, SubmitBar, TextField } from '@/features/payroll/form-fields';

interface Props {
  idKey: 'kittySchemeId' | 'goldSavingsSchemeId';
  schemeId: string;
  enroll: (input: Record<string, unknown>) => Promise<unknown>;
  pending: boolean;
  error: unknown;
  onDone: () => void;
}

/** Enrol a customer into a scheme (kitty/gold-savings enrollMember). */
export function EnrollForm({ idKey, schemeId, enroll, pending, error, onDone }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [joinedDate, setJoinedDate] = useState(todayInput());
  const [errors, setErrors] = useState<FieldErrors>({});
  const { data, isLoading } = trpc.crm.customerList.useQuery({ page: 1, limit: 100 } as never);
  const customers = ((data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? []);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = buildEnrollInput({ customerId, joinedDate }, idKey, schemeId);
    setErrors(errs);
    if (!input) return;
    try {
      await enroll(input);
      setCustomerId('');
      onDone();
    } catch {
      // shown through `error`
    }
  };

  const none = !isLoading && customers.length === 0;
  return (
    <form onSubmit={handle} noValidate className="space-y-3 rounded-lg border p-5">
      <h3 className="text-sm font-semibold">Enroll a customer</h3>
      <FormError message={error ? readableError(error, 'Could not enroll the customer.') : null} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Customer *"
          value={customerId}
          onChange={setCustomerId}
          placeholder={isLoading ? 'Loading customers...' : 'Select customer'}
          error={errors.customerId}
          disabled={none}
          options={customers.map((c) => ({
            value: c.id as string,
            label: `${(c.firstName as string) ?? ''} ${(c.lastName as string) ?? ''}`.trim() + (c.phone ? ` (${c.phone as string})` : ''),
          }))}
        />
        <TextField label="Joining date *" type="date" value={joinedDate} onChange={setJoinedDate} error={errors.joinedDate} />
      </div>
      <SubmitBar
        pending={pending}
        idleLabel="Enroll customer"
        pendingLabel="Enrolling..."
        blockedReason={none ? 'No customers found. Add a customer in CRM first.' : null}
      />
    </form>
  );
}
