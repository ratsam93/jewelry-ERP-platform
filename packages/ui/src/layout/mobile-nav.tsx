'use client';

import * as React from 'react';

/** Tailwind `lg` breakpoint: the sidebar is a static column at and above this width. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export interface MobileNavState {
  /** True while the off-canvas drawer is open (only ever set below the `lg` breakpoint). */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** The hamburger button, so focus can be restored to it when the drawer closes. */
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const noopRef: React.MutableRefObject<HTMLButtonElement | null> = { current: null };

const MobileNavContext = React.createContext<MobileNavState>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
  triggerRef: noopRef,
});

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  // Growing past the desktop breakpoint turns the drawer into the static sidebar.
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    if (!mql || typeof mql.addEventListener !== 'function') return;
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const value = React.useMemo<MobileNavState>(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o), triggerRef }),
    [open],
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

/** Drawer state shared by AppShell, Topbar (hamburger) and Sidebar (drawer). */
export function useMobileNav(): MobileNavState {
  return React.useContext(MobileNavContext);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While the drawer is open: lock body scroll, close on Escape, trap Tab inside
 * the drawer, move focus into it, and restore focus to the trigger on close.
 */
export function useDrawerBehavior(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  close: () => void,
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>,
) {
  const closeRef = React.useRef(close);
  closeRef.current = close;

  React.useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = () =>
      container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    getFocusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!container?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, containerRef, triggerRef]);
}
