'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  tenantSlug: string;
  email: string;
  password: string;
  onDone: () => void;
}

/** One-time panel: the password is only shown here and is not stored anywhere. */
export function CredentialsPanel({ tenantSlug, email, password, onDone }: Props) {
  const [copied, setCopied] = useState(false);
  const text = `Business: ${tenantSlug}\nEmail: ${email}\nPassword: ${password}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-labelledby="credentials-heading" className="rounded-lg border border-amber-300 bg-amber-50 p-6 shadow-sm">
      <h3 id="credentials-heading" className="text-lg font-semibold text-amber-900">Share these login details securely</h3>
      <p className="mt-1 text-sm text-amber-900">
        This password is shown only once. Ask the user to change it after first login.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="font-medium">Business</dt>
        <dd><code className="rounded bg-white px-2 py-1">{tenantSlug || 'your business slug'}</code></dd>
        <dt className="font-medium">Email</dt>
        <dd><code className="rounded bg-white px-2 py-1">{email}</code></dd>
        <dt className="font-medium">Password</dt>
        <dd><code className="rounded bg-white px-2 py-1 break-all">{password}</code></dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-muted">
          I have saved these details
        </button>
      </div>
    </section>
  );
}
