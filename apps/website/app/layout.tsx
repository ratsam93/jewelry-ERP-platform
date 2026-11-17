import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { SITE_URL } from "@/lib/api";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CaratFlow -- The Complete Jewelry ERP Platform",
    template: "%s | CaratFlow",
  },
  description:
    "Purpose-built jewelry ERP covering inventory, manufacturing, POS, accounting, CRM, e-commerce, and compliance. Trusted by 500+ jewelers across India.",
  keywords: [
    "jewelry ERP",
    "jewellery software",
    "jewelry inventory management",
    "jewelry POS",
    "gold shop software",
    "karigar management",
    "HUID compliance",
    "jewelry manufacturing software",
    "jewelry billing software",
    "Indian jewelry ERP",
  ],
  openGraph: {
    title: "CaratFlow -- The Complete Jewelry ERP Platform",
    description:
      "From inventory and manufacturing to retail POS and CRM -- one platform for your entire jewelry business.",
    url: SITE_URL,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CaratFlow jewelry ERP" }],
    siteName: "CaratFlow",
    type: "website",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
    title: "CaratFlow -- The Complete Jewelry ERP Platform",
    description:
      "Purpose-built ERP for jewelers. Inventory, manufacturing, POS, accounting, CRM, and more.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-navy focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
