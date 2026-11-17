import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How CaratFlow collects, uses and protects personal information.",
};

const sections = [
  {
    h: "1. Information we collect",
    t: "When you contact us or subscribe to our newsletter we collect the details you provide, such as your name, email address, phone number, company name and message. We may also collect basic technical information such as browser type and pages visited.",
  },
  {
    h: "2. How we use information",
    t: "We use your information to respond to enquiries, send updates you have requested, operate and improve our website and services, and meet legal obligations. You can unsubscribe from marketing emails at any time.",
  },
  {
    h: "3. Sharing",
    t: "We do not sell personal information. We may share it with service providers who help us run our business, or where required by law.",
  },
  {
    h: "4. Retention and security",
    t: "We keep information only as long as needed for the purposes above and use reasonable technical and organisational measures to protect it.",
  },
  {
    h: "5. Your choices",
    t: "You may ask to access, correct or delete your personal information by contacting us through the contact page.",
  },
];

export default function PrivacyPage() {
  return (
    <section className="pt-32 pb-20 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl md:text-4xl font-bold text-navy mb-4">Privacy Policy</h1>
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
            Questions? <a href="/contact" className="text-gold underline">Contact us</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
