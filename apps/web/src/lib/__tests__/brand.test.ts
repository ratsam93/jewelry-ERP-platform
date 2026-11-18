import { describe, it, expect } from 'vitest';
import { BRAND_NAME, BRAND_TITLE_DEFAULT, BRAND_TITLE_TEMPLATE } from '../brand';

describe('admin brand constants', () => {
  it('defaults to TechBeyond', () => {
    expect(BRAND_NAME).toBe('TechBeyond');
    expect(BRAND_TITLE_DEFAULT).toBe('TechBeyond - Jewelry ERP');
    expect(BRAND_TITLE_TEMPLATE).toBe('%s | TechBeyond');
  });
});
