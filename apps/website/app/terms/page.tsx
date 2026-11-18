import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of the TechBeyond website and services.",
};

const sections = [
  {
    h: "1. Acceptance of terms",
    t: "By accessing this website or using TechBeyond services you agree to these terms. If you do not agree, please do not use the site or services.",
  },
  {
    h: "2. Use of the service",
    t: "You agree to use the website and services lawfully, to keep account credentials confidential, and not to interfere with the operation or security of the platform.",
  },
  {
    h: "3. Subscriptions and fees",
    t: "Paid subscriptions are billed as described in your order form or agreement with us. Fees, taxes, renewal and cancellation terms are set out in your agreement with us.",
  },
  {
    h: "4. Your data",
    t: "You retain ownership of the business data you store in TechBeyond. We process it to provide the service as described in our Privacy Policy.",
  },
  {
    h: "5. Liability",
    t: "To the extent permitted by law, the service is provided as is, and our liability is limited as set out in your agreement with us.",
  },
];

export default function TermsPage() {
  return (
    <section className="pt-32 pb-20 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl md:text-4xl font-bold text-navy mb-4">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-6">
          Template notice: this is generic placeholder text and is not legal advice. It must be reviewed and
          finalised by qualified counsel before use.
        </p>
        <div className="space-y-6 text-gray-700 leading-relaxed">
          {sections.map((s) => (
            <div key={s.h}>
              <h2 className="text-lg font-bold text-navy mb-1">{s.h}</h2>
              <p>{s.t}</p>
            </div>
          ))}
          <p>
            See also our <a href="/privacy" className="text-gold underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
