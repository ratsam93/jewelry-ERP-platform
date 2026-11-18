import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../../app/(dashboard)');

function pageDirs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('[')) continue;
    const d = path.join(dir, e.name);
    if (fs.existsSync(path.join(d, 'page.tsx'))) out.push(d);
    pageDirs(d, out);
  }
  return out;
}

function titleOf(dir: string): string | null {
  const f = path.join(dir, 'layout.tsx');
  if (!fs.existsSync(f)) return null;
  return /title: '([^']*)'/.exec(fs.readFileSync(f, 'utf8'))?.[1] ?? null;
}

describe('route titles (<Page> | brand via the root template)', () => {
  const dirs = pageDirs(root);

  it('every non-dynamic page route has its own titled layout', () => {
    const missing = dirs.filter((d) => !titleOf(d)).map((d) => path.relative(root, d));
    expect(missing).toEqual([]);
  });

  it('uses specific names instead of the section name', () => {
    const t = (p: string) => titleOf(path.join(root, p));
    expect(t('finance/rates')).toBe('Metal rates');
    expect(t('inventory/metals')).toBe('Metal stock');
    expect(t('export/invoices')).toBe('Export invoices');
    expect(t('reports/sales')).toBe('Sales report');
  });
});
