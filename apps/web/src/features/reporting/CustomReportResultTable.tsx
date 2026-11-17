'use client';

import * as React from 'react';
import { formatReportCell, reportColumnLabel } from '@/lib/custom-report';

export interface CustomReportRunResult {
  headers: Array<{ key: string; label: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

export function CustomReportResultTable({ result }: { result: CustomReportRunResult }) {
  if (result.rows.length === 0) {
    return <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">No rows match this report.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            {result.headers.map((h) => (
              <th key={h.key} className="px-3 py-2 font-medium">{reportColumnLabel(h.label)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.rows.map((row, i) => (
            <tr key={i}>
              {result.headers.map((h) => (
                <td key={h.key} className="px-3 py-2">{formatReportCell(row[h.key], h.key, h.type)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
