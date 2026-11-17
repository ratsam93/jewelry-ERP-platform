import type { Metadata } from "next";
import AccountShell from "@/components/AccountShell";

export const metadata: Metadata = { title: "My account" };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
