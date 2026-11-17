import type { Metadata } from "next";

export const metadata: Metadata = { title: "Saved addresses" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
