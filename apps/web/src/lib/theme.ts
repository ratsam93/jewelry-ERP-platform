// Dark-mode helpers. The zustand `caratflow-ui` store persists the choice in
// localStorage; these helpers apply it to <html> (the Tailwind `dark` class),
// and THEME_INIT_SCRIPT applies it before first paint to avoid a light flash.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'caratflow-ui';

/** Sets/removes the `dark` class and `color-scheme` on the root element. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

/** Reads the persisted theme (zustand persist shape). Never throws. */
export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    const s = storage ?? window.localStorage;
    const raw = s.getItem(THEME_STORAGE_KEY);
    if (!raw) return 'light';
    const parsed = JSON.parse(raw) as { state?: { theme?: string } };
    return parsed?.state?.theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Inline <head> script: same logic as readStoredTheme + applyTheme, all in try/catch. */
export const THEME_INIT_SCRIPT = `(function(){try{var r=localStorage.getItem('${THEME_STORAGE_KEY}');var t=r&&JSON.parse(r).state&&JSON.parse(r).state.theme;if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;
