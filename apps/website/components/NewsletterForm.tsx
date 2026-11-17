"use client";

import { useId, useState } from "react";
import Button from "./Button";
import { postJson } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "sending" | "success" | "error";

export default function NewsletterForm({ source = "marketing-site" }: { source?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const value = email.trim();
    if (!EMAIL_RE.test(value) || value.length > 254) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    setStatus("sending");
    setMessage("");
    const error = await postJson("/api/v1/crm/newsletter/subscribe", { email: value, source });
    if (error) {
      setStatus("error");
      setMessage(error);
      return;
    }
    setStatus("success");
    setMessage("Thanks for subscribing! You're on the list.");
    setEmail("");
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Newsletter signup">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          aria-invalid={status === "error"}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold text-sm text-navy bg-white"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={status === "sending"}
          className="w-full sm:w-auto whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === "sending" ? "Subscribing..." : "Subscribe"}
        </Button>
      </div>
      <p
        role={status === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`text-sm mt-3 min-h-5 ${status === "error" ? "text-red-600" : "text-green-600"}`}
      >
        {message}
      </p>
    </form>
  );
}
