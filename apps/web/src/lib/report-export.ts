// Client-side report export helpers (HK-REP-05).
//
// CSV is generated in the browser from the data already loaded on the page.
// - UTF-8 with a BOM so Excel opens the file with the right encoding.
// - Rupee amounts are plain decimals (no symbol, no thousands separators).
// - Cells that start with = + - @ (or tab / CR) are prefixed with a single quote
//   so spreadsheet apps do not evaluate them as formulas (CSV injection).
//
// No spreadsheet library (exceljs/xlsx) is a dependency of this repo, so the
// "Excel" option downloads this same CSV, which Excel opens directly.

import { toLocalDateString } from './date-presets';

/** A money amount held in paise; written to the file as rupees with 2 decimals. */
export interface MoneyCell {
  kind: 'money';
  paise: number;
}

export type ExportCell = string | number | boolean | null | undefined | Date | MoneyCell;

export interface ExportTable {
  headers: string[];
  rows: ExportCell[][];
}

export const CSV_BOM = '﻿';

/** Wrap a paise value (number, numeric string or bigint from the wire) as a money cell. */
export function money(paise: unknown): MoneyCell {
  let n = 0;
  if (typeof paise === 'number') n = paise;
  else if (typeof paise === 'string') n = Number(paise);
  else if (typeof paise === 'bigint') n = Number(paise);
  return { kind: 'money', paise: Number.isFinite(n) ? n : 0 };
}

/** Paise to a plain rupee decimal string, e.g. 123456 -> '1234.56', -50 -> '-0.50'. */
export function paiseToRupeeString(paise: number): string {
  const abs = Math.round(Math.abs(paise));
  const rupees = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${paise < 0 && abs !== 0 ? '-' : ''}${rupees}.${rem}`;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Neutralise spreadsheet formula injection in a text cell. */
export function guardFormula(text: string): string {
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function isMoney(cell: unknown): cell is MoneyCell {
  return typeof cell === 'object' && cell !== null && (cell as MoneyCell).kind === 'money';
}

/** Render one cell to its raw (unquoted) text. */
export function cellToText(cell: ExportCell): string {
  if (cell === null || cell === undefined) return '';
  if (isMoney(cell)) return paiseToRupeeString(cell.paise);
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? '' : toLocalDateString(cell);
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  if (typeof cell === 'boolean') return cell ? 'Yes' : 'No';
  return guardFormula(String(cell));
}

/** RFC 4180 quoting: wrap in quotes when the text has a comma, quote, CR or LF. */
export function escapeCsvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build the CSV text (CRLF line endings, no BOM). */
export function toCsv(table: ExportTable): string {
  const lines = [
    table.headers.map((h) => escapeCsvField(guardFormula(h))).join(','),
    ...table.rows.map((row) => row.map((c) => escapeCsvField(cellToText(c))).join(',')),
  ];
  return lines.join('\r\n') + '\r\n';
}

/** CSV text prefixed with a UTF-8 BOM, ready to put in a Blob. */
export function toCsvWithBom(table: ExportTable): string {
  return CSV_BOM + toCsv(table);
}

/** e.g. reportFileName('sales-report', '2026-11-01', '2026-11-17') -> 'sales-report_2026-11-01_to_2026-11-17.csv' */
export function reportFileName(
  base: string,
  from?: Date | string | null,
  to?: Date | string | null,
  ext = 'csv',
): string {
  const slug = base.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  const day = (v: Date | string) => (typeof v === 'string' ? v : toLocalDateString(v));
  const range = from && to ? `_${day(from)}_to_${day(to)}` : `_${toLocalDateString(new Date())}`;
  return `${slug}${range}.${ext}`;
}

/** Trigger a browser download of the table as CSV. Returns false when there is no DOM. */
export function downloadCsv(filename: string, table: ExportTable): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  const blob = new Blob([toCsvWithBom(table)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** PDF = the browser print dialog ("Save as PDF"); the print stylesheet hides the app chrome. */
export function printReport(): void {
  if (typeof window !== 'undefined') window.print();
}

/** Print stylesheet: hide the sidebar/topbar and anything marked data-no-print. */
export const REPORT_PRINT_CSS = `
@media print {
  aside, header.h-14, [data-no-print] { display: none !important; }
  html, body, [class*="h-screen"], main { height: auto !important; overflow: visible !important; }
  main { padding: 0 !important; margin: 0 !important; }
  body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
