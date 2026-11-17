/**
 * Pure builders for the global command palette (Ctrl/Cmd+K). Kept free of
 * React/Next so they are trivially testable; navigation is injected so the
 * host can use next/navigation's router (which applies the /admin basePath).
 */

export interface NavLeaf {
  label: string;
  href: string;
}

export interface NavGroup extends NavLeaf {
  children?: NavLeaf[];
}

export interface PaletteEntry {
  id: string;
  label: string;
  description?: string;
  group: string;
  onSelect: () => void;
}

/** Quick actions point at the real create pages. */
export const QUICK_ACTIONS: ReadonlyArray<NavLeaf & { description: string }> = [
  { label: 'New invoice', href: '/finance/invoices/new', description: 'Create a finance invoice' },
  { label: 'New customer', href: '/crm/customers/new', description: 'Add a customer' },
  { label: 'New sale', href: '/retail/pos', description: 'Open the point of sale' },
];

/** Extra app routes that are not in the sidebar but are useful from the palette. */
export const EXTRA_ROUTES: ReadonlyArray<NavLeaf> = [
  { label: 'Profile', href: '/profile' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Settings', href: '/settings' },
];

export function buildCommandItems(
  navItems: ReadonlyArray<NavGroup>,
  navigate: (href: string) => void,
): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  const seen = new Set<string>();
  const add = (e: PaletteEntry) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    entries.push(e);
  };

  for (const a of QUICK_ACTIONS) {
    add({
      id: `action:${a.href}`,
      label: a.label,
      description: a.description,
      group: 'Quick actions',
      onSelect: () => navigate(a.href),
    });
  }

  for (const item of navItems) {
    add({
      id: `nav:${item.href}`,
      label: item.label,
      group: 'Go to',
      onSelect: () => navigate(item.href),
    });
    for (const child of item.children ?? []) {
      // Skip a child that just repeats its parent's route (e.g. "Overview").
      if (child.href === item.href) continue;
      add({
        id: `nav:${child.href}`,
        // Prefix the section so duplicate labels (Overview, Documents) stay unique and searchable.
        label: `${item.label} / ${child.label}`,
        group: 'Go to',
        onSelect: () => navigate(child.href),
      });
    }
  }

  for (const r of EXTRA_ROUTES) {
    add({ id: `nav:${r.href}`, label: r.label, group: 'Go to', onSelect: () => navigate(r.href) });
  }

  return entries;
}
