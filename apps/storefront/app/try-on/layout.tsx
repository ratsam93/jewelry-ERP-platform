import type { Metadata } from "next";

export const metadata: Metadata = { title: "Virtual try-on" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
