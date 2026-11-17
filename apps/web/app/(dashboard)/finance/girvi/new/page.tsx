'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@caratflow/ui';
import { Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatPaise } from '@/components/format';
import {
  computeGirviValuation,
  validateGirviForm,
  buildGirviCreateInput,
  girviCustomerLabel,
  type GirviFormValues,
} from '@/lib/girvi-form';

// ─── Page ─────────────────────────────────────────────────────────

type Option = { id: string; label: string };

const inputCls = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-sm font-medium text-muted-foreground';

export default function NewGirviLoanPage() {
  const router = useRouter();
  const [formData, setFormData] = React.useState<GirviFormValues>({
    customerId: '',
    locationId: '',
    metalType: 'GOLD',
    grossWeightG: '',
    stoneWeightG: '',
    purityFineness: '916',
    appraisedRatePer10g: '',
    loanPercentage: '75',
    interestRate: '18',
    interestType: 'SIMPLE',
    compoundingPeriod: 'MONTHLY',
    durationMonths: '12',
    collateralDescription: '',
    notes: '',
  });
  const [rateTouched, setRateTouched] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Real data: customers, locations, KYC status, live 24K rate.
  const customersQuery = trpc.crm.customerList.useQuery({ page: 1, limit: 100 } as never);
  const customerRows =
    (customersQuery.data as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? [];
  const branchesQuery = trpc.platform.branches.list.useQuery({} as never);
  const locations: Option[] = (
    (branchesQuery.data as Array<{ id: string; name?: string }> | undefined) ?? []
  ).map((b) => ({ id: b.id, label: b.name ?? b.id }));

  const kycQuery = trpc.india.kyc.getStatus.useQuery(
    { customerId: formData.customerId } as never,
    { enabled: Boolean(formData.customerId) } as never,
  );
  const kycData = kycQuery.data as
    | { isAadhaarVerified?: boolean; isPanVerified?: boolean }
    | undefined;
  const kycStatus =
    formData.customerId && kycData
      ? { aadhaar: Boolean(kycData.isAadhaarVerified), pan: Boolean(kycData.isPanVerified) }
      : null;
  const isKycValid = Boolean(kycStatus?.aadhaar || kycStatus?.pan);
  // Name + phone/email (so duplicate names differ); KYC state is known for the selected customer.
  const customers: Option[] = customerRows.map((c) => ({
    id: String(c.id),
    label: girviCustomerLabel(c, String(c.id) === formData.customerId ? kycStatus : null),
  }));

  const rateQuery = trpc.india.rates.getCurrent.useQuery(
    { metalType: formData.metalType, purity: 999 } as never,
    { retry: false } as never,
  );
  const liveRate = (rateQuery.data as { ratePer10gPaise?: number | string } | undefined)
    ?.ratePer10gPaise;
  React.useEffect(() => {
    if (!rateTouched && liveRate !== undefined && liveRate !== null) {
      setFormData((prev) => ({ ...prev, appraisedRatePer10g: (Number(liveRate) / 100).toFixed(2) }));
    }
  }, [liveRate, rateTouched]);

  const val = computeGirviValuation(formData);
  const netWeightG = (val.netWeightMg / 1000).toFixed(3);
  const { appraisedValuePaise, loanAmountPaise, loanPercentage } = val;
  const errors = validateGirviForm(formData);

  const createMutation = trpc.india.girvi.create.useMutation({
    onSuccess: (created: unknown) => {
      const id = (created as { id?: string } | undefined)?.id;
      router.push(id ? `/finance/girvi/${id}` : '/finance/girvi');
    },
    onError: (err: { message?: string }) => setServerError(err?.message ?? 'Failed to create loan'),
  } as never);

  const updateField = (field: keyof GirviFormValues, value: string) => {
    if (field === 'appraisedRatePer10g') setRateTouched(true);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;
    if (!isKycValid) {
      setServerError('At least one KYC document (Aadhaar or PAN) must be verified before creating a loan.');
      return;
    }
    (createMutation as unknown as { mutate: (i: unknown) => void }).mutate(
      buildGirviCreateInput(formData),
    );
  };

  const fieldError = (k: string) =>
    submitted && errors[k] ? <p className="mt-1 text-xs text-red-600">{errors[k]}</p> : null;
  const isPending = Boolean((createMutation as { isPending?: boolean }).isPending);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Girvi Loan"
        description="Create a mortgage loan against gold or silver collateral."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Girvi', href: '/finance/girvi' },
          { label: 'New Loan' },
        ]}
      />

      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {serverError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 lg:col-span-3"
          >
            <AlertCircle className="h-4 w-4" /> {serverError}
          </div>
        )}

        {/* Customer Selection + KYC */}
        <div className="rounded-lg border bg-card p-6 lg:col-span-3">
          <h3 className="mb-4 text-sm font-semibold">Customer & KYC</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Customer</label>
              <select
                value={formData.customerId}
                onChange={(e) => updateField('customerId', e.target.value)}
                className={inputCls}
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {fieldError('customerId')}
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <select
                value={formData.locationId}
                onChange={(e) => updateField('locationId', e.target.value)}
                className={inputCls}
              >
                <option value="">Select location...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              {fieldError('locationId')}
            </div>
            <div>
              <label className={labelCls}>KYC Status</label>
              {kycStatus ? (
                <div className="flex gap-4 pt-2">
                  <span className={`flex items-center gap-1 text-sm ${kycStatus.aadhaar ? 'text-emerald-600' : 'text-red-500'}`}>
                    {kycStatus.aadhaar ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    Aadhaar
                  </span>
                  <span className={`flex items-center gap-1 text-sm ${kycStatus.pan ? 'text-emerald-600' : 'text-red-500'}`}>
                    {kycStatus.pan ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    PAN
                  </span>
                </div>
              ) : (
                <p className="pt-2 text-sm text-muted-foreground">
                  {formData.customerId ? 'Checking KYC...' : 'Select a customer first'}
                </p>
              )}
            </div>
          </div>
          {kycStatus && !isKycValid && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              At least one KYC document (Aadhaar or PAN) must be verified before creating a loan.
            </div>
          )}
        </div>

        {/* Collateral Details */}
        <div className="rounded-lg border bg-card p-6 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold">Collateral Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Metal Type</label>
              <select
                value={formData.metalType}
                onChange={(e) => updateField('metalType', e.target.value)}
                className={inputCls}
              >
                <option value="GOLD">Gold</option>
                <option value="SILVER">Silver</option>
                <option value="PLATINUM">Platinum</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Purity (Fineness)</label>
              <select
                value={formData.purityFineness}
                onChange={(e) => updateField('purityFineness', e.target.value)}
                className={inputCls}
              >
                <option value="999">999 (24K)</option>
                <option value="916">916 (22K)</option>
                <option value="750">750 (18K)</option>
                <option value="585">585 (14K)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Gross Weight (g)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={formData.grossWeightG}
                onChange={(e) => updateField('grossWeightG', e.target.value)}
                className={inputCls}
                placeholder="0.000"
              />
              {fieldError('grossWeightG')}
            </div>
            <div>
              <label className={labelCls}>Stone/Impurity Weight (g)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={formData.stoneWeightG}
                onChange={(e) => updateField('stoneWeightG', e.target.value)}
                className={inputCls}
                placeholder="0.000"
              />
              {fieldError('stoneWeightG')}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Net Weight</label>
              <p className="text-lg font-semibold">{netWeightG} g</p>
            </div>
            <div>
              <label className={labelCls}>24K (999) Rate per 10g (Rs.)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.appraisedRatePer10g}
                onChange={(e) => updateField('appraisedRatePer10g', e.target.value)}
                className={inputCls}
                placeholder="0.00"
              />
              {fieldError('appraisedRatePer10g')}
              <p className="mt-1 text-xs text-muted-foreground">
                Prefilled from the live rate when available; the appraisal is adjusted by purity.
              </p>
            </div>
            <div>
              <label className={labelCls}>Loan % of Appraised Value</label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.loanPercentage}
                onChange={(e) => updateField('loanPercentage', e.target.value)}
                className={inputCls}
              />
              {fieldError('loanPercentage')}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Description of Collateral</label>
              <textarea
                value={formData.collateralDescription}
                onChange={(e) => updateField('collateralDescription', e.target.value)}
                className={inputCls}
                rows={3}
                placeholder="Describe the items being pledged..."
              />
              {fieldError('collateralDescription')}
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                className={inputCls}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Valuation Summary */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-4 text-sm font-semibold">Valuation Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Appraised Value</span>
                <span className="font-mono font-medium">{formatPaise(appraisedValuePaise)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Loan Percentage</span>
                <span className="font-medium">{loanPercentage}%</span>
              </div>
              <hr />
              <div className="flex justify-between text-base font-semibold">
                <span>Loan Amount</span>
                <span className="font-mono text-primary">{formatPaise(loanAmountPaise)}</span>
              </div>
            </div>
          </div>

          {/* Interest & Duration */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-4 text-sm font-semibold">Interest & Duration</h3>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Annual Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="36"
                  value={formData.interestRate}
                  onChange={(e) => updateField('interestRate', e.target.value)}
                  className={inputCls}
                />
                {fieldError('interestRate')}
              </div>
              <div>
                <label className={labelCls}>Interest Type</label>
                <select
                  value={formData.interestType}
                  onChange={(e) => updateField('interestType', e.target.value)}
                  className={inputCls}
                >
                  <option value="SIMPLE">Simple</option>
                  <option value="COMPOUND">Compound</option>
                </select>
              </div>
              {formData.interestType === 'COMPOUND' && (
                <div>
                  <label className={labelCls}>Compounding</label>
                  <select
                    value={formData.compoundingPeriod}
                    onChange={(e) => updateField('compoundingPeriod', e.target.value)}
                    className={inputCls}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Duration (Months)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.durationMonths}
                  onChange={(e) => updateField('durationMonths', e.target.value)}
                  className={inputCls}
                />
                {fieldError('durationMonths')}
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 lg:col-span-3">
          <Link
            href="/finance/girvi"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isPending || (Boolean(kycStatus) && !isKycValid)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {isPending ? 'Creating...' : 'Create Loan'}
          </button>
        </div>
      </form>
    </div>
  );
}
