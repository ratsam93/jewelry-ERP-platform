import { describe, it, expect } from 'vitest';
import { BRAND_NAME } from '../brand';
import { PlatformPdfService } from '../../modules/platform/platform.pdf.service';

describe('API brand', () => {
  it('defaults to TechBeyond', () => {
    expect(BRAND_NAME).toBe(process.env.BRAND_NAME?.trim() || 'TechBeyond');
  });

  it('fills {{brandName}} in PDF templates with the brand by default', () => {
    const svc = Object.create(PlatformPdfService.prototype) as PlatformPdfService;
    const out = svc.fillTemplate('by {{brandName}}.', {});
    expect(out).toBe(`by ${BRAND_NAME}.`);
    expect(svc.fillTemplate('by {{brandName}}.', { brandName: 'Acme' })).toBe('by Acme.');
  });
});
