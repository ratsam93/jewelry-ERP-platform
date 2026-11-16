'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, StatusBadge, getStatusVariant } from '@caratflow/ui';
import { TaxBreakdownDisplay } from '@/features/finance/tax-breakdown-display';
import { Printer, Ban, FileCheck2, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';

// ─── Types (shape of financial.invoices.getById) ──────────────────

interface InvoiceLine {
  id: string;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPricePaise: unknown;
  taxableAmountPaise: unknown;
  gstRate: number;
  cgstPaise: unknown;
  sgstPaise: unknown;
  igstPaise: unknown;
  totalPaise: unknown;
}

interface InvoicePayment {
  id: string;
  paymentNumber: string;
  method: string;
  amountPaise: unknown;
  status: string;
  createdAt: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  customer: { firstName: string; lastName: string; gstinNumber: string | null } | null;
  supplier: { name: string } | null;
  subtotalPaise: unknown;
  taxPaise: unknown;
  totalPaise: unknown;
  paidPaise: unknown;
  notes: string | null;
  lineItems: InvoiceLine[];
  payments: InvoicePayment[];
}

/** E-invoice state from einvoice.status: stored state or live NIC details. */
interface EInvoiceInfo {
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  status: string;
  lastError?: string;
}

const CANCEL_REASONS = [
  { value: '1', label: '1 - Duplicate' },
  { value: '2', label: '2 - Data entry mistake' },
  { value: '3', label: '3 - Order cancelled' },
  { value: '4', label: '4 - Others' },
];

const EINVOICE_MARKER = '__einvoice__:';

// ─── Helpers ──────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function formatAmount(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN');
}

/** Human-readable notes: strip the stored e-invoice JSON block. */
function visibleNotes(notes: string | null): string {
  if (!notes) return '';
  const idx = notes.indexOf(EINVOICE_MARKER);
  return (idx === -1 ? notes : notes.slice(0, idx)).trim();
}

// ─── Page ─────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = String(params.id ?? '');
  const utils = trpc.useUtils();

  const [cancelReason, setCancelReason] = React.useState('3');
  const [cancelRemarks, setCancelRemarks] = React.useState('');
  const [showCancel, setShowCancel] = React.useState(false);
  const [eiError, setEiError] = React.useState<string | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);

  const invoiceQ = trpc.financial.invoices.getById.useQuery(
    { id: invoiceId },
    { enabled: invoiceId.length > 0 },
  );
  // The status procedure throws NOT_FOUND when no e-invoice has been generated.
  const eiQ = trpc.financial.einvoice.status.useQuery(
    { invoiceId },
    { enabled: invoiceId.length > 0, retry: false },
  );

  const refreshEi = () => {
    void utils.financial.einvoice.status.invalidate({ invoiceId });
    void utils.financial.invoices.getById.invalidate({ id: invoiceId });
  };

  const submitMut = trpc.financial.einvoice.submit.useMutation({
    onSuccess: () => {
      setEiError(null);
      refreshEi();
    },
    onError: (err) => setEiError(err.message),
  });
  const cancelMut = trpc.financial.einvoice.cancel.useMutation({
    onSuccess: () => {
      setEiError(null);
      setShowCancel(false);
      setCancelRemarks('');
      refreshEi();
    },
    onError: (err) => setEiError(err.message),
  });

  if (invoiceQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invoice...</p>;
  }
  if (invoiceQ.isError || !invoiceQ.data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load invoice{invoiceQ.error ? `: ${invoiceQ.error.message}` : '.'}
      </div>
    );
  }

  const inv = invoiceQ.data as unknown as InvoiceDetail;
  const lines = inv.lineItems;
  const cgst = lines.reduce((s, l) => s + toNumber(l.cgstPaise), 0);
  const sgst = lines.reduce((s, l) => s + toNumber(l.sgstPaise), 0);
  const igst = lines.reduce((s, l) => s + toNumber(l.igstPaise), 0);
  const isInterState = igst > 0;
  const gstRate = lines[0]?.gstRate ?? 0;
  const total = toNumber(inv.totalPaise);
  const paid = toNumber(inv.paidPaise);
  const outstanding = total - paid;
  const customerName = inv.customer
    ? `${inv.customer.firstName} ${inv.customer.lastName}`.trim()
    : inv.supplier?.name ?? '-';

  const ei = eiQ.data as EInvoiceInfo | undefined;
  const eiNotFound = eiQ.isError && eiQ.error?.data?.code === 'NOT_FOUND';
  const hasActiveIrn = ei?.status === 'ACT' && !!ei.irn;

  const downloadPdf = async () => {
    setPdfError(null);
    try {
      const file = await utils.financial.invoices.downloadPdf.fetch({ invoiceId });
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF download failed.');
    }
  };

  const submitToIrp = () => {
    if (!window.confirm('Submit this invoice to the NIC IRP to generate an IRN? This cannot be undone except by cancelling within 24 hours.')) {
      return;
    }
    submitMut.mutate({ invoiceId });
  };

  const cancelIrn = () => {
    cancelMut.mutate({
      invoiceId,
      reason: cancelReason as '1' | '2' | '3' | '4',
      remarks: cancelRemarks.trim(),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Invoice ${inv.invoiceNumber}`}
        description={`${inv.invoiceType === 'SALES' ? 'Sales' : 'Purchase'} Invoice`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Finance', href: '/finance' },
          { label: 'Invoices', href: '/finance/invoices' },
          { label: inv.invoiceNumber },
        ]}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void downloadPdf()}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        }
      />

      {pdfError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {pdfError}
        </div>
      )}

      {/* Invoice Header */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge label={inv.status} variant={getStatusVariant(inv.status)} />
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="text-sm font-medium">{formatDate(inv.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Due Date</span>
              <span className="text-sm font-medium">{formatDate(inv.dueDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="text-sm font-medium">{customerName}</span>
            </div>
            {inv.customer?.gstinNumber && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">GSTIN</span>
                <span className="font-mono text-sm">{inv.customer.gstinNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Supply Type</span>
              <span className="text-sm">{isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</span>
            </div>
          </div>
        </div>

        <TaxBreakdownDisplay
          taxableAmountPaise={lines.reduce((s, l) => s + toNumber(l.taxableAmountPaise), 0)}
          cgstPaise={cgst}
          sgstPaise={sgst}
          igstPaise={igst}
          cgstRate={isInterState ? 0 : gstRate / 2}
          sgstRate={isInterState ? 0 : gstRate / 2}
          igstRate={isInterState ? gstRate : 0}
          isInterState={isInterState}
        />
      </div>

      {/* E-Invoice (NIC IRP) */}
      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">E-Invoice (IRN)</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submitToIrp}
              disabled={submitMut.isPending || hasActiveIrn}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <FileCheck2 className="h-4 w-4" /> {submitMut.isPending ? 'Submitting...' : 'Generate IRN'}
            </button>
            <button
              type="button"
              onClick={() => setShowCancel((v) => !v)}
              disabled={!hasActiveIrn}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Ban className="h-4 w-4" /> Cancel IRN
            </button>
          </div>
        </div>
        <div className="space-y-2 px-4 py-3 text-sm">
          {eiQ.isLoading ? (
            <p className="text-muted-foreground">Checking e-invoice status...</p>
          ) : eiNotFound || !ei ? (
            <p className="text-muted-foreground">No IRN generated for this invoice yet.</p>
          ) : eiQ.isError ? (
            <p className="text-red-600">Could not load e-invoice status: {eiQ.error.message}</p>
          ) : (
            <>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge label={ei.status} variant={getStatusVariant(ei.status)} />
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">IRN</span>
                <span className="break-all font-mono text-xs">{ei.irn ?? '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Ack No / Date</span>
                <span className="font-mono text-xs">
                  {ei.ackNo ?? '-'} {ei.ackDate ? `· ${formatDate(ei.ackDate)}` : ''}
                </span>
              </div>
              {ei.lastError && <p className="text-xs text-red-600">Last error: {ei.lastError}</p>}
            </>
          )}
          {eiError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
              {eiError}
            </div>
          )}
        </div>
        {showCancel && (
          <div className="space-y-3 border-t bg-red-50/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              NIC allows cancelling an IRN within 24 hours of generation. Later corrections need a credit note.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                {CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={cancelRemarks}
                onChange={(e) => setCancelRemarks(e.target.value)}
                maxLength={255}
                placeholder="Remarks (required)"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={cancelIrn}
              disabled={!cancelRemarks.trim() || cancelMut.isPending}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {cancelMut.isPending ? 'Cancelling...' : 'Confirm IRN cancellation'}
            </button>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="rounded-lg border">
        <div className="border-b bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">Line Items</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20">
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-left font-medium">HSN</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Unit Price</th>
              <th className="px-4 py-2 text-right font-medium">Tax</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="px-4 py-2">{line.description}</td>
                <td className="px-4 py-2 text-muted-foreground">{line.hsnCode}</td>
                <td className="px-4 py-2 text-right">{line.quantity}</td>
                <td className="px-4 py-2 text-right font-mono">{formatAmount(toNumber(line.unitPricePaise))}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                  {formatAmount(toNumber(line.cgstPaise) + toNumber(line.sgstPaise) + toNumber(line.igstPaise))}
                </td>
                <td className="px-4 py-2 text-right font-mono font-medium">{formatAmount(toNumber(line.totalPaise))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td colSpan={5} className="px-4 py-2 text-right font-semibold">Grand Total:</td>
              <td className="px-4 py-2 text-right font-mono text-base font-bold">{formatAmount(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment History */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">Payment History</h3>
          <div className="text-sm">
            <span className="text-muted-foreground">Paid: </span>
            <span className="font-mono font-medium text-emerald-600">{formatAmount(paid)}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="font-mono font-medium">{formatAmount(total)}</span>
          </div>
        </div>
        {inv.payments.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No payments recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="px-4 py-2 text-left font-medium">Payment #</th>
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Method</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((pay) => (
                <tr key={pay.id} className="border-b">
                  <td className="px-4 py-2 font-mono">{pay.paymentNumber}</td>
                  <td className="px-4 py-2">{formatDate(pay.createdAt)}</td>
                  <td className="px-4 py-2">{pay.method}</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-600">
                    {formatAmount(toNumber(pay.amountPaise))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {outstanding > 0 && (
          <div className="border-t bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Outstanding: {formatAmount(outstanding)}
            </span>
          </div>
        )}
      </div>

      {visibleNotes(inv.notes) && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-1 text-sm font-semibold">Notes</h3>
          <p className="text-sm text-muted-foreground">{visibleNotes(inv.notes)}</p>
        </div>
      )}
    </div>
  );
}
