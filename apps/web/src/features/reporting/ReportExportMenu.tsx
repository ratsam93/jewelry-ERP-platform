'use client';

import * as React from 'react';
import { ExportButton } from './ExportButton';
import {
  REPORT_PRINT_CSS,
  downloadCsv,
  printReport,
  reportFileName,
  type ExportTable,
} from '@/lib/report-export';

interface ReportExportMenuProps {
  /** File name base, e.g. 'sales-report' -> sales-report_2026-11-01_to_2026-11-17.csv */
  fileBase: string;
  from?: Date | string | null;
  to?: Date | string | null;
  /** Build the table from the data currently loaded on the page; null when nothing is loaded. */
  getTable: () => ExportTable | null;
  disabled?: boolean;
}

/**
 * Export menu for report pages: CSV, Excel (the same UTF-8 CSV, which Excel opens
 * directly; no spreadsheet library is installed) and PDF (browser print dialog).
 */
export function ReportExportMenu({ fileBase, from, to, getTable, disabled }: ReportExportMenuProps) {
  const handleExport = (format: 'csv' | 'pdf' | 'xlsx') => {
    if (format === 'pdf') {
      printReport();
      return;
    }
    const table = getTable();
    if (!table) return;
    downloadCsv(reportFileName(fileBase, from, to, 'csv'), table);
  };

  return (
    <>
      <style>{REPORT_PRINT_CSS}</style>
      <ExportButton
        onExport={handleExport}
        disabled={disabled}
        labels={{ csv: 'CSV (.csv)', xlsx: 'Excel (opens the .csv)', pdf: 'PDF (print / save as PDF)' }}
      />
    </>
  );
}
