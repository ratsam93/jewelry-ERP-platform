import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compare jewelry" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
