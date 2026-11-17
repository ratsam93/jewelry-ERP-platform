'use client';

import * as React from 'react';

export interface RenderLinkProps {
  href: string;
  children: React.ReactNode;
  className: string;
}

/**
 * Renders an internal navigation link. The host app supplies an implementation
 * (e.g. next/link, which applies the app's basePath) through LinkProvider.
 */
export type RenderLink = (props: RenderLinkProps) => React.ReactNode;

const defaultRenderLink: RenderLink = ({ href, children, className }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

const LinkContext = React.createContext<RenderLink>(defaultRenderLink);

interface LinkProviderProps {
  renderLink: RenderLink;
  children: React.ReactNode;
}

/**
 * Supplies the link renderer used by framework-agnostic components in this
 * package (PageHeader breadcrumbs, Sidebar items) when no explicit
 * `renderLink` prop is passed.
 */
export function LinkProvider({ renderLink, children }: LinkProviderProps) {
  return <LinkContext.Provider value={renderLink}>{children}</LinkContext.Provider>;
}

/** Returns the link renderer from the nearest LinkProvider (plain <a> by default). */
export function useRenderLink(): RenderLink {
  return React.useContext(LinkContext);
}
