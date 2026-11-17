import { notFound } from 'next/navigation';

// Catch-all for unknown dashboard URLs: renders (dashboard)/not-found.tsx inside the
// dashboard layout so the sidebar and topbar stay visible.
export default function UnknownDashboardRoute(): never {
  notFound();
}
