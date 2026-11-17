"use client";

import { useId, useState } from "react";
import Button from "./Button";
import { postJson } from "@/lib/api";

const INPUT =
  "w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold text-sm";

type Status = "idle" | "sending" | "success" | "error";

export default function ContactForm() {
  const uid = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "").trim();
    const payload = {
      name: text("name"),
      email: text("email"),
      phone: text("phone") || undefined,
      company: text("company") || undefined,
      locations: text("locations") || undefined,
      message: text("message"),
      website: text("website"),
      source: "marketing-site",
    };
    setStatus("sending");
    setError("");
    const err = await postJson("/api/v1/crm/contact", payload);
    if (err) {
      setStatus("error");
      setError(err);
      return;
    }
    form.reset();
    setStatus("success");
  }

  if (status === "success") {
    return (
      <div role="status" aria-live="polite" className="bg-white rounded-xl p-8 border border-gray-200 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-navy mb-2">Thank You!</h3>
        <p className="text-gray-600">
          We&apos;ve received your message and will get back to you within 24 hours.
        </p>
      </div>
    );
  }

  const sending = status === "sending";
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 border border-gray-200 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-navy mb-1.5">Full Name *</label>
          <input id={`${uid}-name`} name="name" type="text" required maxLength={100} autoComplete="name" className={INPUT} placeholder="Rajesh Kumar" />
        </div>
        <div>
          <label htmlFor={`${uid}-email`} className="block text-sm font-medium text-navy mb-1.5">Email Address *</label>
          <input id={`${uid}-email`} name="email" type="email" required maxLength={254} autoComplete="email" className={INPUT} placeholder="rajesh@example.com" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor={`${uid}-phone`} className="block text-sm font-medium text-navy mb-1.5">Phone Number</label>
          <input id={`${uid}-phone`} name="phone" type="tel" maxLength={20} autoComplete="tel" className={INPUT} placeholder="+91 98765 43210" />
        </div>
        <div>
          <label htmlFor={`${uid}-company`} className="block text-sm font-medium text-navy mb-1.5">Company Name</label>
          <input id={`${uid}-company`} name="company" type="text" maxLength={100} autoComplete="organization" className={INPUT} placeholder="Your Jewelry Business" />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-locations`} className="block text-sm font-medium text-navy mb-1.5">Number of Locations</label>
        <select id={`${uid}-locations`} name="locations" className={`${INPUT} bg-white`}>
          <option value="">Select...</option>
          <option value="1">1 location</option>
          <option value="2-5">2-5 locations</option>
          <option value="6-10">6-10 locations</option>
          <option value="11-25">11-25 locations</option>
          <option value="25+">25+ locations</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-message`} className="block text-sm font-medium text-navy mb-1.5">Message *</label>
        <textarea
          id={`${uid}-message`}
          name="message"
          required
          maxLength={2000}
          rows={4}
          className={`${INPUT} resize-none`}
          placeholder="Tell us about your business and how we can help..."
        />
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor={`${uid}-website`}>Leave this field empty</label>
        <input id={`${uid}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full disabled:opacity-60 disabled:cursor-not-allowed" disabled={sending} aria-busy={sending}>
        {sending ? "Sending..." : "Send Message"}
      </Button>
      <p role="alert" aria-live="assertive" className="text-sm text-red-600 min-h-5">
        {status === "error" ? error : ""}
      </p>
    </form>
  );
}
