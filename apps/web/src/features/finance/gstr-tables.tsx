'use client';

import * as React from 'react';
import type { Gstr1Data, Gstr3bData } from '@caratflow/shared-types';
import { formatPaise } from '@/components/format';

const th = 'px-3 py-2 text-xs font-medium uppercase text-muted-foreground';
const money = 'px-3 py-2 text-right font-mono text-sm';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border">
      <h3 className="border-b bg-muted/30 px-4 py-3 text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground">{text}</p>;
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

type InvoiceRow = Gstr1Data['b2c'][number];

function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/20 text-left">
          <th className={th}>Invoice</th>
          <th className={th}>Date</th>
          <th className={`${th} text-right`}>Taxable</th>
          <th className={`${th} text-right`}>CGST</th>
          <th className={`${th} text-right`}>SGST</th>
          <th className={`${th} text-right`}>IGST</th>
          <th className={`${th} text-right`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.invoiceNumber} className="border-b">
            <td className="px-3 py-2 font-mono">{r.invoiceNumber}</td>
            <td className="px-3 py-2">{r.invoiceDate}</td>
            <td className={money}>{formatPaise(r.taxableAmountPaise)}</td>
            <td className={money}>{formatPaise(r.cgstPaise)}</td>
            <td className={money}>{formatPaise(r.sgstPaise)}</td>
            <td className={money}>{formatPaise(r.igstPaise)}</td>
            <td className={`${money} font-semibold`}>{formatPaise(r.totalPaise)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Gstr1Tables({ data }: { data: Partial<Gstr1Data> | undefined }) {
  const b2b = Array.isArray(data?.b2b) ? data.b2b : [];
  const b2c = Array.isArray(data?.b2c) ? data.b2c : [];
  const hsn = Array.isArray(data?.hsnSummary) ? data.hsnSummary : [];
  const totalTax = num(data?.totalCgst) + num(data?.totalSgst) + num(data?.totalIgst);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Taxable value', data?.totalTaxableAmount],
          ['CGST', data?.totalCgst],
          ['SGST', data?.totalSgst],
          ['IGST', data?.totalIgst],
          ['Total tax', totalTax],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border p-3">
            <div className="text-xs uppercase text-muted-foreground">{String(label)}</div>
            <div className="text-lg font-semibold">{formatPaise(num(value))}</div>
          </div>
        ))}
      </div>

      <Section title="B2B (registered buyers)">
        {b2b.length === 0 ? (
          <Empty text="No B2B invoices in this period." />
        ) : (
          b2b.map((g) => (
            <div key={g.gstin}>
              <div className="border-b bg-muted/10 px-4 py-2 text-xs">
                GSTIN <span className="font-mono">{g.gstin}</span>
              </div>
              <InvoiceTable rows={g.invoices} />
            </div>
          ))
        )}
      </Section>

      <Section title="B2C (unregistered buyers)">
        {b2c.length === 0 ? <Empty text="No B2C invoices in this period." /> : <InvoiceTable rows={b2c} />}
      </Section>

      <Section title="HSN summary">
        {hsn.length === 0 ? (
          <Empty text="No HSN data in this period." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-left">
                <th className={th}>HSN</th>
                <th className={th}>Description</th>
                <th className={`${th} text-right`}>Qty</th>
                <th className={`${th} text-right`}>Taxable</th>
                <th className={`${th} text-right`}>CGST</th>
                <th className={`${th} text-right`}>SGST</th>
                <th className={`${th} text-right`}>IGST</th>
                <th className={`${th} text-right`}>Total tax</th>
              </tr>
            </thead>
            <tbody>
              {hsn.map((h) => (
                <tr key={h.hsnCode} className="border-b">
                  <td className="px-3 py-2 font-mono">{h.hsnCode}</td>
                  <td className="px-3 py-2">{h.description}</td>
                  <td className={money}>{h.quantity}</td>
                  <td className={money}>{formatPaise(h.taxableAmountPaise)}</td>
                  <td className={money}>{formatPaise(h.cgstPaise)}</td>
                  <td className={money}>{formatPaise(h.sgstPaise)}</td>
                  <td className={money}>{formatPaise(h.igstPaise)}</td>
                  <td className={`${money} font-semibold`}>{formatPaise(h.totalTaxPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

type Split = { igstPaise?: number; cgstPaise?: number; sgstPaise?: number; cessPaise?: number; taxableAmountPaise?: number };

function SplitTable({ rows, withTaxable }: { rows: Array<[string, Split]>; withTaxable?: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/20 text-left">
          <th className={th}>Nature</th>
          {withTaxable && <th className={`${th} text-right`}>Taxable value</th>}
          <th className={`${th} text-right`}>IGST</th>
          <th className={`${th} text-right`}>CGST</th>
          <th className={`${th} text-right`}>SGST</th>
          <th className={`${th} text-right`}>Cess</th>
          <th className={`${th} text-right`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, v]) => (
          <tr key={label} className="border-b">
            <td className="px-3 py-2">{label}</td>
            {withTaxable && <td className={money}>{formatPaise(num(v.taxableAmountPaise))}</td>}
            <td className={money}>{formatPaise(num(v.igstPaise))}</td>
            <td className={money}>{formatPaise(num(v.cgstPaise))}</td>
            <td className={money}>{formatPaise(num(v.sgstPaise))}</td>
            <td className={money}>{formatPaise(num(v.cessPaise))}</td>
            <td className={`${money} font-semibold`}>
              {formatPaise(num(v.igstPaise) + num(v.cgstPaise) + num(v.sgstPaise) + num(v.cessPaise))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Gstr3bTables({ data }: { data: Partial<Gstr3bData> | undefined }) {
  const empty: Split = {};
  const payable = data?.taxPayable ?? empty;
  const totalPayable =
    num(payable.igstPaise) + num(payable.cgstPaise) + num(payable.sgstPaise) + num(payable.cessPaise);
  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/50 p-3">
        <div className="text-xs uppercase text-muted-foreground">Net tax payable</div>
        <div className="text-lg font-bold">{formatPaise(totalPayable)}</div>
      </div>
      <Section title="3.1 Outward supplies (sales)">
        <SplitTable withTaxable rows={[['Taxable outward supplies', data?.outwardSupplies ?? empty]]} />
      </Section>
      <Section title="Inward supplies (purchases)">
        <SplitTable withTaxable rows={[['Inward supplies', data?.inwardSupplies ?? empty]]} />
      </Section>
      <Section title="4. Input tax credit (ITC) available">
        <SplitTable rows={[['ITC available', data?.itcAvailable ?? empty]]} />
      </Section>
      <Section title="6. Tax payable (outward tax minus ITC)">
        <SplitTable rows={[['Tax payable', payable]]} />
      </Section>
    </div>
  );
}
