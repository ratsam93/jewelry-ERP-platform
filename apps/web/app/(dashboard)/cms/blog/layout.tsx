import type { ReactNode } from 'react';

export const metadata = { title: 'Blog' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
