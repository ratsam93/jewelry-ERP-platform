import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat with us" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
