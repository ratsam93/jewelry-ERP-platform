import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the team building CaratFlow, the jewelry ERP platform.",
};

export default function CareersPage() {
  return (
    <section className="pt-32 pb-20 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-3xl md:text-4xl font-bold text-navy mb-4">Careers at CaratFlow</h1>
        <p className="text-gray-700 leading-relaxed mb-4">
          We are building software for jewelers: inventory, manufacturing, retail, accounting and compliance in
          one platform. We don&apos;t have any open positions listed right now, but we are always glad to hear
          from engineers, designers and jewelry-industry specialists.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Send us a short note about yourself via the{" "}
          <a href="/contact" className="text-gold underline">contact page</a> and we will keep it on file.
        </p>
      </div>
    </section>
  );
}
