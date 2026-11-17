import { describe, it, expect } from 'vitest';
import {
  CSV_BOM,
  cellToText,
  escapeCsvField,
  guardFormula,
  money,
  paiseToRupeeString,
  reportFileName,
  toCsv,
  toCsvWithBom,
} from '../report-export';

describe('escapeCsvField', () => {
  it('leaves plain text alone', () => {
    expect(escapeCsvField('Gold ring')).toBe('Gold ring');
  });
  it('quotes commas, quotes and newlines (doubling quotes)', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('formula injection guard', () => {
  it.each(['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\tx'])('prefixes %j with a single quote', (v) => {
    expect(guardFormula(v)).toBe(`'${v}`);
    expect(cellToText(v)).toBe(`'${v}`);
  });
  it('does not touch ordinary text or numbers', () => {
    expect(guardFormula('Ring = gold')).toBe('Ring = gold');
    expect(cellToText(-5)).toBe('-5');
    expect(cellToText(money(-12345))).toBe('-123.45');
  });
  it('guards then quotes in the CSV', () => {
    expect(toCsv({ headers: ['n'], rows: [['=HYPERLINK("x","y")']] })).toBe(
      'n\r\n"\'=HYPERLINK(""x"",""y"")"\r\n',
    );
  });
});

describe('money', () => {
  it('writes rupees as plain 2-decimal numbers', () => {
    expect(paiseToRupeeString(123456)).toBe('1234.56');
    expect(paiseToRupeeString(5)).toBe('0.05');
    expect(paiseToRupeeString(0)).toBe('0.00');
    expect(paiseToRupeeString(-50)).toBe('-0.50');
    expect(paiseToRupeeString(10000000)).toBe('100000.00');
  });
  it('accepts wire values (string / bigint / junk)', () => {
    expect(cellToText(money('250000'))).toBe('2500.00');
    expect(cellToText(money(BigInt(199)))).toBe('1.99');
    expect(cellToText(money(undefined))).toBe('0.00');
    expect(cellToText(money('abc'))).toBe('0.00');
  });
});

describe('toCsv', () => {
  it('builds header + rows with CRLF and mixed cell types', () => {
    const csv = toCsv({
      headers: ['Period', 'Orders', 'Revenue', 'Note', 'Active'],
      rows: [
        ['2026-11-01', 3, money(1250000), 'Chain, 22K', true],
        [new Date(2026, 10, 2), null, money(0), undefined, false],
      ],
    });
    expect(csv).toBe(
      'Period,Orders,Revenue,Note,Active\r\n' +
        '2026-11-01,3,12500.00,"Chain, 22K",Yes\r\n' +
        '2026-11-02,,0.00,,No\r\n',
    );
  });
  it('prefixes a UTF-8 BOM and keeps the rupee sign intact', () => {
    const out = toCsvWithBom({ headers: ['Amount (₹)'], rows: [] });
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out).toContain('₹');
  });
});

describe('reportFileName', () => {
  it('uses the range', () => {
    expect(reportFileName('sales-report', '2026-11-01', '2026-11-17')).toBe(
      'sales-report_2026-11-01_to_2026-11-17.csv',
    );
    expect(reportFileName('Sales Comparison', new Date(2026, 10, 1), new Date(2026, 10, 17))).toBe(
      'sales-comparison_2026-11-01_to_2026-11-17.csv',
    );
  });
  it('falls back to today when there is no range', () => {
    expect(reportFileName('Inventory valuation')).toMatch(/^inventory-valuation_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
