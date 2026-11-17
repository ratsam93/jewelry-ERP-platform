"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { mockProducts } from "@/lib/mock-data";
import { API_BASE_URL } from "@/lib/constants";
import { getAccessToken } from "@/lib/api";
import {
  clearConsultationDraft,
  consultationLoginHref,
  consultationRegisterHref,
  loadConsultationDraft,
  saveConsultationDraft,
} from "@/lib/consultation-draft";

const LANGS = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "gu", label: "Gujarati" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
];

function RequestConsultationForm() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [lang, setLang] = useState("en");
  const [phone, setPhone] = useState("");
  const [preferredSlot, setPreferredSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [signedIn, setSignedIn] = useState(true); // optimistic until checked on mount
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [restored, setRestored] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = loadConsultationDraft();
    if (draft) {
      setSelectedProducts(draft.selectedProducts);
      setLang(draft.lang);
      setPhone(draft.phone);
      setPreferredSlot(draft.preferredSlot);
      setNotes(draft.notes);
    }
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("productId");
    if (productId) setSelectedProducts((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
    setSignedIn(Boolean(getAccessToken()));
    setRestored(true);
  }, []);

  // Keep the typed values across a sign-in detour.
  useEffect(() => {
    if (!restored || submittedRef.current) return;
    saveConsultationDraft({ selectedProducts, lang, phone, preferredSlot, notes });
  }, [restored, selectedProducts, lang, phone, preferredSlot, notes]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      saveConsultationDraft({ selectedProducts, lang, phone, preferredSlot, notes });
      setSignedIn(false);
      setNeedsSignIn(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = {
        productsOfInterest: selectedProducts.map((id) => ({ productId: id })),
        preferredLang: lang,
        customerPhone: phone || undefined,
        notes: [
          preferredSlot ? `Preferred slot: ${preferredSlot}` : null,
          notes || null,
        ].filter(Boolean).join("\n") || undefined,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/crm/video-consultation/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        saveConsultationDraft({ selectedProducts, lang, phone, preferredSlot, notes });
        setSignedIn(false);
        setNeedsSignIn(true);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || (data && data.success === false)) {
        throw new Error(data?.error?.message || data?.message || `Request failed: ${res.status}`);
      }
      submittedRef.current = true;
      clearConsultationDraft();
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-navy mb-2" style={{ fontFamily: "var(--font-serif)" }}>
          Request Received
        </h1>
        <p className="text-navy/60 mb-6">
          Thanks! Our team will call or WhatsApp you within 2 hours to confirm your consultation slot.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/account/consultations" className="h-10 px-5 inline-flex items-center rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold-dark transition-colors">
            View My Consultations
          </Link>
          <Link href="/" className="h-10 px-5 inline-flex items-center rounded-lg border border-gray-200 text-navy text-sm font-medium hover:bg-gray-50">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy" style={{ fontFamily: "var(--font-serif)" }}>
          Book a Live Consultation
        </h1>
        <p className="text-sm text-navy/60 mt-1">
          Request a 1-on-1 video call with one of our jewelry consultants. View pieces live before you buy.
        </p>
      </div>

      {!signedIn && (
        <div
          role={needsSignIn ? "alert" : "region"}
          aria-label="Sign in to book a consultation"
          className="mb-6 rounded-xl border border-gold/40 bg-gold/5 p-4"
        >
          <h2 className="text-base font-semibold text-navy">Sign in to book a consultation</h2>
          <p className="text-sm text-navy/70 mt-1">
            {needsSignIn
              ? "You are not signed in, or your session has expired. Your answers are saved: sign in and you will return right here."
              : "You need a CaratFlow account to book a live consultation. Your answers are saved while you sign in."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href={consultationLoginHref} className="h-10 px-5 inline-flex items-center rounded-lg bg-gold text-white text-sm font-medium hover:bg-gold-dark transition-colors">
              Sign in
            </Link>
            <Link href={consultationRegisterHref} className="h-10 px-5 inline-flex items-center rounded-lg border border-gray-200 text-navy text-sm font-medium hover:bg-gray-50">
              Register
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border border-gray-100 p-6">
        {/* Products of interest */}
        <div>
          <label className="text-sm font-medium text-navy">Products you want to see (optional)</label>
          <p className="text-xs text-navy/50 mb-2">Select any items you want the consultant to show you.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {mockProducts.slice(0, 12).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProduct(p.id)}
                className={`text-left text-xs p-2 rounded-lg border transition-colors ${
                  selectedProducts.includes(p.id)
                    ? "border-gold bg-gold/5 text-navy"
                    : "border-gray-200 hover:border-gold/30 text-navy/70"
                }`}
              >
                <span className="block font-medium truncate">{p.name}</span>
                <span className="block text-navy/40 truncate">{p.sku}</span>
              </button>
            ))}
          </div>
          {selectedProducts.length > 0 && (
            <p className="text-xs text-navy/60 mt-2">{selectedProducts.length} item(s) selected</p>
          )}
        </div>

        {/* Language */}
        <div>
          <label htmlFor="consult-lang" className="text-sm font-medium text-navy">Preferred Language</label>
          <select
            id="consult-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="consult-phone" className="text-sm font-medium text-navy">Phone Number</label>
          <input
            id="consult-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
          />
          <p className="text-xs text-navy/50 mt-1">We'll use this to coordinate your meeting link.</p>
        </div>

        {/* Preferred slot */}
        <div>
          <label htmlFor="consult-slot" className="text-sm font-medium text-navy">Preferred Slot (optional)</label>
          <input
            id="consult-slot"
            type="text"
            value={preferredSlot}
            onChange={(e) => setPreferredSlot(e.target.value)}
            placeholder="e.g. Weekday evenings, Saturday 11am"
            className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
          />
          <p className="text-xs text-navy/50 mt-1">Our team will confirm a specific time within 2 hours.</p>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="consult-notes" className="text-sm font-medium text-navy">Anything else? (optional)</label>
          <textarea
            id="consult-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Occasion, budget, design preferences..."
          />
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg bg-gold text-white font-medium hover:bg-gold-dark disabled:opacity-60 transition-colors"
        >
          {loading ? "Submitting..." : "Request Consultation"}
        </button>
      </form>
    </div>
  );
}

export default function RequestConsultationPage() {
  return <RequestConsultationForm />;
}
