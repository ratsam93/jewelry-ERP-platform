import type { Metadata } from "next";

export const metadata: Metadata = { title: "Book a live consultation" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
