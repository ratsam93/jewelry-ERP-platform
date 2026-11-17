'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useRenderLink, type RenderLink } from './link-context';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  className?: string;
  /** Overrides the link renderer from LinkProvider for this header only. */
  renderLink?: RenderLink;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
  renderLink,
}: PageHeaderProps) {
  const contextRenderLink = useRenderLink();
  const Link = renderLink ?? contextRenderLink;

  return (
    <div className={cn('space-y-1', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              {crumb.href ? (
                <Link href={crumb.href} className="inline-flex min-h-8 items-center hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Title + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
