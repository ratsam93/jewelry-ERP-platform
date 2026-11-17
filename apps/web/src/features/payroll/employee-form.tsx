'use client';

import { useState, type FormEvent } from 'react';
import {
  EMPLOYEE_LABELS,
  errorSummary,
  type EmployeeFormValues,
  type FieldErrors,
  type BuildResult,
} from '@/lib/finance-form';
import { FormError, SelectField, SubmitBar, TextField } from './form-fields';

interface Props {
  initial: EmployeeFormValues;
  mode: 'create' | 'edit';
  build: (v: EmployeeFormValues) => BuildResult<Record<string, unknown>>;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
  pending: boolean;
  serverError?: string | null;
  submitLabel: string;
}

const FORM_KEY_TO_API: Record<string, string> = {
  basicSalary: 'basicSalaryPaise',
  hra: 'hraPaise',
  da: 'daPaise',
  conveyance: 'conveyancePaise',
  medical: 'medicalPaise',
  otherAllowance: 'otherAllowancePaise',
};

export function EmployeeForm({ initial, mode, build, onSubmit, pending, serverError, submitLabel }: Props) {
  const [v, setV] = useState<EmployeeFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const set = (k: keyof EmployeeFormValues) => (val: string) => setV((p) => ({ ...p, [k]: val }));
  const err = (k: string) => errors[FORM_KEY_TO_API[k] ?? k];

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const { input, errors: errs } = build(v);
    setErrors(errs);
    if (!input) return;
    await onSubmit(input);
  };

  const money = (k: keyof EmployeeFormValues, label: string, required = false) => (
    <TextField
      label={`${label} (₹)${required ? ' *' : ''}`}
      value={v[k] as string}
      onChange={set(k)}
      error={err(k as string)}
      inputMode="decimal"
      placeholder="e.g. 35000"
    />
  );

  return (
    <form onSubmit={handle} noValidate className="space-y-5 rounded-lg border p-5">
      <FormError message={serverError} />
      <h3 className="text-sm font-semibold">Profile</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Employee code *" value={v.employeeCode} onChange={set('employeeCode')} error={errors.employeeCode} disabled={mode === 'edit'} />
        <TextField label="First name *" value={v.firstName} onChange={set('firstName')} error={errors.firstName} />
        <TextField label="Last name *" value={v.lastName} onChange={set('lastName')} error={errors.lastName} />
        <TextField label="Joining date *" type="date" value={v.joinedAt} onChange={set('joinedAt')} error={errors.joinedAt} />
        <TextField label="Date of birth" type="date" value={v.dob} onChange={set('dob')} error={errors.dob} />
        <TextField label="Gender" value={v.gender} onChange={set('gender')} error={errors.gender} />
        <TextField label="Designation" value={v.designation} onChange={set('designation')} error={errors.designation} />
        <TextField label="Department" value={v.department} onChange={set('department')} error={errors.department} />
        {mode === 'edit' && (
          <SelectField
            label="Status"
            value={v.status}
            onChange={set('status')}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
              { value: 'TERMINATED', label: 'Terminated' },
            ]}
          />
        )}
      </div>

      <h3 className="text-sm font-semibold">Monthly salary components (rupees)</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {money('basicSalary', 'Basic salary', true)}
        {money('hra', 'HRA')}
        {money('da', 'DA')}
        {money('conveyance', 'Conveyance')}
        {money('medical', 'Medical')}
        {money('otherAllowance', 'Other allowance')}
      </div>

      <h3 className="text-sm font-semibold">Statutory and bank details</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="PAN" value={v.panNumber} onChange={set('panNumber')} error={errors.panNumber} placeholder="ABCDE1234F" />
        <TextField label="Aadhaar" value={v.aadhaarNumber} onChange={set('aadhaarNumber')} error={errors.aadhaarNumber} placeholder="12 digits" inputMode="numeric" />
        <TextField label="PF number" value={v.pfNumber} onChange={set('pfNumber')} error={errors.pfNumber} />
        <TextField label="ESI number" value={v.esiNumber} onChange={set('esiNumber')} error={errors.esiNumber} />
        <TextField label="Bank account number" value={v.bankAccountNumber} onChange={set('bankAccountNumber')} error={errors.bankAccountNumber} inputMode="numeric" />
        <TextField label="IFSC" value={v.bankIfsc} onChange={set('bankIfsc')} error={errors.bankIfsc} placeholder="HDFC0001234" />
        <TextField label="Bank name" value={v.bankName} onChange={set('bankName')} error={errors.bankName} />
      </div>

      <SubmitBar pending={pending} idleLabel={submitLabel} summary={errorSummary(errors, EMPLOYEE_LABELS)} />
    </form>
  );
}
