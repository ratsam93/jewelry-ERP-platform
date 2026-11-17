import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The admin app is served under the Next.js basePath `/admin`. A raw
 * `<a href="/...">` is not prefixed with the basePath and 404s, so internal
 * links must use `next/link` `<Link>`. API links (`/api/...`) are exempt.
 */
const WEB_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCAN_DIRS = [path.join(WEB_ROOT, 'app'), path.join(WEB_ROOT, 'src')];
const RAW_ANCHOR = /<a\s[^>]*href=\{?["'`]\/(?!api\/)/;
const LINK_TAG = /<Link[\s>][^>]*>/g;

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      listSourceFiles(full, out);
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const LINKED_FILES: Array<{ file: string; hrefs: string[] }> = [
  { file: 'app/(auth)/login/page.tsx', hrefs: ['/forgot-password', '/register'] },
  { file: 'app/(auth)/register/page.tsx', hrefs: ['/login'] },
  { file: 'app/(auth)/forgot-password/page.tsx', hrefs: ['/login'] },
  {
    file: 'app/(dashboard)/settings/hardware/page.tsx',
    hrefs: ['/settings/hardware/labels', '/settings/hardware/rfid'],
  },
  { file: 'src/features/export/ExportInvoiceForm.tsx', hrefs: ['/export/invoices'] },
  { file: 'src/features/export/ExportOrderForm.tsx', hrefs: ['/export/orders'] },
];

describe('internal links honour the /admin basePath', () => {
  it('has no raw <a href="/..."> internal anchors under app/ or src/', () => {
    const offenders = SCAN_DIRS.flatMap((dir) => listSourceFiles(dir))
      .filter((file) => RAW_ANCHOR.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(WEB_ROOT, file));
    expect(offenders).toEqual([]);
  });

  it.each(LINKED_FILES)('$file imports next/link and uses <Link> for internal hrefs', ({ file, hrefs }) => {
    const source = fs.readFileSync(path.join(WEB_ROOT, file), 'utf8');
    expect(source).toMatch(/import Link from ['"]next\/link['"]/);
    const linkTags = source.match(LINK_TAG) ?? [];
    for (const href of hrefs) {
      expect(linkTags.some((tag) => tag.includes(`"${href}"`))).toBe(true);
    }
  });
});
