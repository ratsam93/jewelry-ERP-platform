'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { MobileNavProvider } from './mobile-nav';

interface AppShellProps {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ sidebar, topbar, children, className }: AppShellProps) {
  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar: static column on lg+, off-canvas drawer below lg */}
        {sidebar}

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          {topbar}

          {/* Page content */}
          <main className={cn('flex-1 overflow-y-auto p-4 sm:p-6', className)}>{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
