import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, readStoredTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/lib/theme';

describe('theme helpers', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('applyTheme toggles the dark class', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('readStoredTheme reads the zustand persisted shape', () => {
    const store = { getItem: () => JSON.stringify({ state: { theme: 'dark' }, version: 0 }) };
    expect(readStoredTheme(store)).toBe('dark');
  });

  it('readStoredTheme never throws on bad or blocked storage', () => {
    expect(readStoredTheme({ getItem: () => '{oops' })).toBe('light');
    expect(
      readStoredTheme({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('light');
    expect(readStoredTheme({ getItem: () => null })).toBe('light');
  });

  it('init script applies dark from storage and is wrapped in try/catch', () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ state: { theme: 'dark' } }));
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    localStorage.removeItem(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain('try{');
  });
});
