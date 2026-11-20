"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { takeFlashNotice } from "@/lib/auth-config";

/** Dismissible one-shot notice (set with setFlashNotice before navigating). */
export default function FlashNotice() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = takeFlashNotice();
    if (next) setMessage(next);
  }, [pathname]);

  if (!message) return null;
  return (
    <div role="status" className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <span>{message}</span>
        <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss notice" className="text-emerald-700 font-semibold hover:underline">
          Dismiss
        </button>
      </div>
    </div>
  );
}
