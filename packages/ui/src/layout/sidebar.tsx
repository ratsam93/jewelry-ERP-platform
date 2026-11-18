'use client';

import * as React from 'react';
import {
  LayoutDashboard,
  Package,
  Factory,
  ShoppingCart,
  IndianRupee,
  Users,
  Truck,
  Globe,
  Shield,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Gem,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useRenderLink, type RenderLink } from './link-context';
import { useDrawerBehavior, useMobileNav } from './mobile-nav';

export interface SidebarItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: { label: string; href: string }[];
}

// URL paths match the (dashboard) route group: route group parens
// do NOT appear in URLs, so /(dashboard)/inventory/page.tsx is served
// at /inventory. The /admin basePath is auto-applied by Next.js.
export const defaultNavItems: SidebarItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: <Package className="h-4 w-4" />,
    children: [
      { label: 'Stock Overview', href: '/inventory' },
      { label: 'Items', href: '/inventory/items' },
      { label: 'Metals', href: '/inventory/metals' },
      { label: 'Transfers', href: '/inventory/transfers' },
      { label: 'Stock Takes', href: '/inventory/stock-takes' },
      { label: 'Valuation', href: '/inventory/valuation' },
    ],
  },
  {
    label: 'Manufacturing',
    href: '/manufacturing',
    icon: <Factory className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/manufacturing' },
      { label: 'Job Orders', href: '/manufacturing/jobs' },
      { label: 'BOM', href: '/manufacturing/bom' },
      { label: 'Karigars', href: '/manufacturing/karigars' },
      { label: 'Planning', href: '/manufacturing/planning' },
      { label: 'Quality', href: '/manufacturing/qc' },
    ],
  },
  {
    label: 'Retail / POS',
    href: '/retail',
    icon: <ShoppingCart className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/retail' },
      { label: 'Point of Sale', href: '/retail/pos' },
      { label: 'Sales', href: '/retail/sales' },
      { label: 'Returns', href: '/retail/returns' },
      { label: 'Custom Orders', href: '/retail/custom-orders' },
      { label: 'Repairs', href: '/retail/repairs' },
      { label: 'Gift Cards', href: '/retail/gift-cards' },
      { label: 'Discounts', href: '/retail/discounts' },
    ],
  },
  {
    label: 'Finance',
    href: '/finance',
    icon: <IndianRupee className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/finance' },
      { label: 'Invoices', href: '/finance/invoices' },
      { label: 'Bank', href: '/finance/bank' },
      { label: 'Payroll', href: '/finance/payroll' },
      { label: 'Girvi', href: '/finance/girvi' },
      { label: 'Schemes', href: '/finance/schemes' },
      { label: 'BNPL', href: '/finance/bnpl' },
      { label: 'Reports', href: '/finance/reports' },
      { label: 'Tax', href: '/finance/tax' },
    ],
  },
  {
    label: 'CRM',
    href: '/crm',
    icon: <Users className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/crm' },
      { label: 'Customers', href: '/crm/customers' },
      { label: 'Leads', href: '/crm/leads' },
      { label: 'Campaigns', href: '/crm/campaigns' },
      { label: 'Loyalty', href: '/crm/loyalty' },
      { label: 'Feedback', href: '/crm/feedback' },
      { label: 'Consultations', href: '/crm/consultations' },
      { label: 'Notifications', href: '/crm/notifications' },
    ],
  },
  {
    label: 'Wholesale',
    href: '/wholesale',
    icon: <Truck className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/wholesale' },
      { label: 'Purchase Orders', href: '/wholesale/purchase-orders' },
      { label: 'Goods Receipts', href: '/wholesale/goods-receipts' },
      { label: 'Consignments In', href: '/wholesale/consignments-in' },
      { label: 'Consignments Out', href: '/wholesale/consignments-out' },
      { label: 'Suppliers', href: '/wholesale/suppliers' },
      { label: 'Agents', href: '/wholesale/agents' },
      { label: 'Rate Contracts', href: '/wholesale/rate-contracts' },
    ],
  },
  {
    label: 'E-Commerce',
    href: '/ecommerce',
    icon: <Globe className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/ecommerce' },
      { label: 'Orders', href: '/ecommerce/orders' },
      { label: 'Channels', href: '/ecommerce/channels' },
      { label: 'Catalog', href: '/ecommerce/catalog' },
      { label: 'Reviews', href: '/ecommerce/reviews' },
      { label: 'Shipments', href: '/ecommerce/shipments' },
      { label: 'Pre-orders', href: '/ecommerce/preorders' },
      { label: 'AR Try-On', href: '/ecommerce/ar' },
    ],
  },
  {
    label: 'Export',
    href: '/export',
    icon: <Globe className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/export' },
      { label: 'Orders', href: '/export/orders' },
      { label: 'Invoices', href: '/export/invoices' },
      { label: 'Documents', href: '/export/documents' },
      { label: 'Compliance', href: '/export/compliance' },
      { label: 'Licenses', href: '/export/licenses' },
    ],
  },
  {
    label: 'Compliance',
    href: '/compliance',
    icon: <Shield className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/compliance' },
      { label: 'HUID', href: '/compliance/huid' },
      { label: 'Hallmark', href: '/compliance/hallmark' },
      { label: 'Certificates', href: '/compliance/certificates' },
      { label: 'Documents', href: '/compliance/documents' },
      { label: 'Insurance', href: '/compliance/insurance' },
      { label: 'Traceability', href: '/compliance/traceability' },
      { label: 'Audits', href: '/compliance/audits' },
      { label: 'AML', href: '/compliance/aml' },
    ],
  },
  {
    label: 'CMS',
    href: '/cms',
    icon: <LayoutDashboard className="h-4 w-4" />,
    children: [
      { label: 'Banners', href: '/cms/banners' },
      { label: 'Collections', href: '/cms/collections' },
      { label: 'Blog', href: '/cms/blog' },
      { label: 'Pages', href: '/cms/pages' },
      { label: 'FAQ', href: '/cms/faq' },
      { label: 'Homepage', href: '/cms/homepage' },
      { label: 'SEO', href: '/cms/seo' },
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: <BarChart3 className="h-4 w-4" />,
    children: [
      { label: 'Sales', href: '/reports/sales' },
      { label: 'Inventory', href: '/reports/inventory' },
      { label: 'Manufacturing', href: '/reports/manufacturing' },
      { label: 'CRM', href: '/reports/crm' },
      { label: 'Forecast', href: '/reports/forecast' },
      { label: 'Custom', href: '/reports/custom' },
      { label: 'Scheduled', href: '/reports/scheduled' },
    ],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <Settings className="h-4 w-4" />,
    children: [
      { label: 'Overview', href: '/settings' },
      { label: 'Audit', href: '/settings/audit' },
      { label: 'Import', href: '/settings/import' },
      { label: 'Hardware', href: '/settings/hardware' },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  items?: SidebarItem[];
  currentPath?: string;
  /** Overrides the link renderer from LinkProvider for this sidebar only. */
  renderLink?: RenderLink;
  /** Brand text shown beside the logo icon. */
  brandName?: string;
}

export function Sidebar({
  collapsed: collapsedProp,
  onToggle,
  items = defaultNavItems,
  currentPath = '',
  renderLink,
  brandName = 'TechBeyond',
}: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const asideRef = React.useRef<HTMLElement>(null);
  const { open: mobileOpen, setOpen: setMobileOpen, triggerRef } = useMobileNav();
  const closeMobile = React.useCallback(() => setMobileOpen(false), [setMobileOpen]);

  // The icon-only collapsed mode is a desktop feature: the open drawer always shows labels.
  const collapsed = collapsedProp && !mobileOpen;

  useDrawerBehavior(mobileOpen, asideRef, closeMobile, triggerRef);

  // Close the drawer whenever the route changes.
  const lastPath = React.useRef(currentPath);
  React.useEffect(() => {
    if (lastPath.current !== currentPath) {
      lastPath.current = currentPath;
      closeMobile();
    }
  }, [currentPath, closeMobile]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const isActive = (href: string) => currentPath === href || currentPath.startsWith(href + '/');

  const contextRenderLink = useRenderLink();
  const Link = renderLink ?? contextRenderLink;

  return (
    <>
      {/* Overlay (below lg only): click to dismiss */}
      {mobileOpen && (
        <div
          data-testid="sidebar-overlay"
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMobile}
        />
      )}
      <aside
        id="app-sidebar"
        ref={asideRef}
        data-mobile-open={mobileOpen ? 'true' : 'false'}
        {...(mobileOpen
          ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Navigation menu' }
          : {})}
        className={cn(
          'flex h-full w-64 flex-col border-r bg-card transition-[transform,width,visibility] duration-200',
          // Below lg: off-canvas drawer. At lg+: static column in the flex row.
          'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto lg:translate-x-0 lg:visible',
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full invisible',
          collapsedProp && 'lg:w-16',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b px-4">
          <Gem className="h-6 w-6 shrink-0 text-brand-500" />
          {!collapsed && <span className="ml-2 text-lg font-bold text-brand-700">{brandName}</span>}
          <button
            type="button"
            onClick={closeMobile}
            aria-label="Close menu"
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav: following any link closes the drawer */}
        <nav
          aria-label="Main navigation"
          className="flex-1 overflow-y-auto py-2"
          onClick={(e) => {
            if (mobileOpen && (e.target as HTMLElement).closest('a')) closeMobile();
          }}
        >
          {items.map((item) => {
            const active = isActive(item.href);
            const expanded = expandedGroups.has(item.label);
            const hasChildren = item.children && item.children.length > 0;

            return (
              <div key={item.label}>
                <div
                  className={cn(
                    'mx-2 flex min-h-10 items-center rounded-md px-2 text-sm transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    collapsed && 'justify-center',
                  )}
                >
                  {hasChildren && !collapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.label)}
                      aria-expanded={expanded}
                      className="flex min-h-10 w-full items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronRight
                        className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
                      />
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn(
                        'flex min-h-10 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        collapsed ? 'w-full justify-center' : 'flex-1',
                      )}
                    >
                      {item.icon}
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </Link>
                  )}
                </div>

                {/* Children */}
                {hasChildren && expanded && !collapsed && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.children!.map((child) => (
                      <div key={child.href}>
                        <Link
                          href={child.href}
                          className={cn(
                            'mx-2 flex min-h-10 items-center rounded-md px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isActive(child.href)
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )}
                        >
                          {child.label}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden shrink-0 border-t p-2 lg:block">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsedProp ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-10 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsedProp ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
