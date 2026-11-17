"use client";

import { useState } from "react";
import { CRM_API, TENANT_ID } from "@/lib/constants";
import { validateContact, contactErrorText as errorTextFor } from "@/lib/contact";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setStatus(null);
    const invalid = validateContact(form);
    if (invalid) {
      setStatus({ type: "err", text: invalid });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${CRM_API}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          message: form.message.trim(),
          website: form.website,
          source: "storefront",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.success === false)) {
        setStatus({ type: "err", text: errorTextFor(res.status, data) });
        return;
      }
      setStatus({ type: "ok", text: "Thanks! We will get back to you within 1 business day." });
      setForm({ name: "", email: "", phone: "", message: "", website: "" });
    } catch {
      setStatus({ type: "err", text: "Network error. Please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-navy mb-2" style={{ fontFamily: "var(--font-serif)" }}>
        Contact Us
      </h1>
      <p className="text-navy/60 text-sm mb-8">
        We typically reply within one business day. For urgent order issues please call.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-1">Customer care</p>
          <p className="text-sm text-navy"><a href="tel:+918000800800" className="hover:text-gold">+91 80 0080 0800</a></p>
          <p className="text-xs text-navy/40 mt-1">Mon - Sat, 09:00 - 21:00</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-1">Email</p>
          <p className="text-sm text-navy"><a href="mailto:hello@caratflow.com" className="hover:text-gold">hello@caratflow.com</a></p>
          <p className="text-xs text-navy/40 mt-1">For orders, returns, or sizing</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-1">WhatsApp</p>
          <p className="text-sm text-navy"><a href="https://wa.me/918000800800" className="hover:text-gold">+91 80 0080 0800</a></p>
          <p className="text-xs text-navy/40 mt-1">Fastest channel for live help</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-navy">Send us a message</h2>
        {status && (
          <div role={status.type === "err" ? "alert" : "status"} className={`text-sm rounded-lg p-3 ${status.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {status.text}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className="block text-xs font-medium text-navy/60 mb-1">Name *</label>
            <input
              id="contact-name"
              name="name"
              required
              maxLength={100}
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-xs font-medium text-navy/60 mb-1">Email *</label>
            <input
              id="contact-email"
              name="email"
              autoComplete="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
            />
          </div>
        </div>
        <div>
          <label htmlFor="contact-phone" className="block text-xs font-medium text-navy/60 mb-1">Phone (optional)</label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
          />
        </div>
        <div>
          <label htmlFor="contact-message" className="block text-xs font-medium text-navy/60 mb-1">How can we help? *</label>
          <textarea
            id="contact-message"
            name="message"
            maxLength={2000}
            required
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/20"
          />
        </div>
        {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-gold text-white text-sm font-semibold rounded-lg hover:bg-gold-dark disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Send Message"}
        </button>
      </form>
    </div>
  );
}
