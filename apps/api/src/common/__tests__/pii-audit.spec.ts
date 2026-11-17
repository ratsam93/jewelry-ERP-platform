// Static regression guard: Prisma includes that embed a full `customer`,
// `supplier` or `employee` row pull PAN / Aadhaar / bank account numbers into
// the service layer. Any *.service.ts that does this must be listed below with
// the reason it is safe (narrow select, or output masked via pii-mask).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** Paths relative to apps/api/src, with forward slashes. */
const ALLOWLIST: Record<string, string> = {
  'auth/auth.2fa.service.ts': 'row is used internally (2FA setup); only the TOTP setup payload is returned',
  'auth/auth.b2c.service.ts': 'customer row is projected through buildCustomerProfile (name/contact only)',
  'auth/auth.social.service.ts': 'returns the auth row to the internal login flow, which builds a profile projection',
  'modules/financial/financial.service.ts': 'every invoice/payment response is wrapped in maskSensitiveDeep',
  'modules/india/india.girvi.service.ts': 'responses masked via pii-mask (maskSensitiveDeep / maskCustomerIdentifiers)',
  'modules/india/india.kyc.service.ts': 'responses masked via pii-mask (maskSensitiveDeep / maskCustomerIdentifiers)',
  'modules/india/india.scheme.service.ts': 'responses masked via pii-mask (maskSensitiveDeep / maskCustomerIdentifiers)',
  'modules/manufacturing/manufacturing.service.ts': 'job order list/getById responses wrapped in maskSensitiveDeep (customer + karigar)',
  'modules/payroll/payroll.bankfile.service.ts':
    'explicit NEFT bank-file export: needs full account numbers by design; internal use only, permission-gated',
  'modules/payroll/payroll.payslip.service.ts': 'list/getById responses wrapped in maskSensitiveDeep',
};

const PATTERN = /\b(customer|supplier|employee):\s*true\b/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.service.ts')) out.push(full);
  }
  return out;
}

describe('PII audit: full customer/supplier/employee includes', () => {
  const files = walk(SRC, []).map((f) => ({
    rel: relative(SRC, f).split(sep).join('/'),
    text: readFileSync(f, 'utf8'),
  }));
  const offenders = files.filter((f) => PATTERN.test(f.text)).map((f) => f.rel);

  it('scans a non-trivial number of service files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('only allow-listed services include a full customer/supplier/employee row', () => {
    const unlisted = offenders.filter((f) => !(f in ALLOWLIST));
    expect(unlisted, `Use a narrow select or maskSensitiveDeep, or allow-list with a reason:\n${unlisted.join('\n')}`).toEqual([]);
  });

  it('allow-list has no stale entries', () => {
    const stale = Object.keys(ALLOWLIST).filter((f) => !offenders.includes(f));
    expect(stale, `No longer needed:\n${stale.join('\n')}`).toEqual([]);
  });

  it('every allow-listed file that claims masking imports pii-mask', () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!/mask/i.test(ALLOWLIST[rel]!)) continue;
      const f = files.find((x) => x.rel === rel);
      expect(f?.text, rel).toContain('pii-mask');
    }
  });
});
