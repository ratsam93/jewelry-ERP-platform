'use client';

import * as React from 'react';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-navy-50 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-brand-700">{BRAND_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Reset your password</p>
        </div>

        <div className="rounded-lg border bg-card p-8 shadow-sm">
          {submitted ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                If an account exists for <strong>{email}</strong>, a password reset link has been
                sent. Check your email.
              </p>
              <Link href="/login" className="inline-block text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="your@email.com"
                  required
                />
              </div>
              <button
                type="submit"
                className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Send Reset Link
              </button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
