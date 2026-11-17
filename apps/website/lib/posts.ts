export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: string;
  body: Array<{ heading?: string; text: string }>;
}

export const posts: Post[] = [
  {
    slug: "why-generic-erps-fail-jewelers",
    title: "Why Generic ERPs Fail Jewelers",
    excerpt:
      "Most ERP systems are built for general manufacturing or retail. They don't understand karat-wise tracking, tunch calculations, or karigar metal balances. Here's why jewelry businesses need purpose-built software and what to look for when evaluating options.",
    date: "March 15, 2026",
    readTime: "8 min read",
    category: "Industry Insights",
    body: [
      {
        text: "Generic ERPs model stock as quantities of identical items. Jewelry stock is nothing like that: every piece has its own gross, net and stone weight, a purity, a making charge and often a hallmark identifier.",
      },
      {
        heading: "Metal is the real inventory",
        text: "A jeweler's working capital sits in gold, silver and stones. Software has to track metal by weight and purity (for example 22K / 916) and reconcile it through every stage: purchase, issue to karigar, wastage, finished goods and sale.",
      },
      {
        heading: "Karigar and job-work flows",
        text: "Metal issued to karigars comes back as finished pieces, scrap and wastage. Without a metal-balance ledger per karigar, losses stay invisible until the annual stock-take.",
      },
      {
        heading: "What to look for",
        text: "Ask any vendor to demonstrate weight-based stock, tunch and wastage calculation, live metal-rate pricing, GST treatment for jewelry and making charges, and old-gold exchange. If those need customisation, the product was not built for jewelers.",
      },
    ],
  },
  {
    slug: "huid-compliance-guide",
    title: "HUID Compliance Guide for Indian Jewelers",
    excerpt:
      "Hallmark Unique Identification (HUID) is now mandatory for gold jewelry sales in India. This comprehensive guide covers the BIS hallmarking process, HUID assignment workflow, record-keeping requirements, and how technology can automate compliance.",
    date: "February 28, 2026",
    readTime: "12 min read",
    category: "Compliance",
    body: [
      {
        text: "Hallmark Unique Identification (HUID) is a six-character alphanumeric code assigned to each hallmarked piece of gold jewelry in India. This overview is general information only; always confirm current requirements with the Bureau of Indian Standards (BIS).",
      },
      {
        heading: "The hallmarking process",
        text: "Jewelry is submitted to a BIS-recognised Assaying and Hallmarking Centre, tested for purity, marked with the BIS logo, purity grade and HUID, and recorded against the registered jeweler.",
      },
      {
        heading: "Record-keeping",
        text: "Jewelers should be able to tie each sold piece to its HUID, weight, purity and invoice. Keeping HUIDs on the item record at the time of stock entry makes billing and audits straightforward.",
      },
      {
        heading: "Automating compliance",
        text: "A jewelry ERP can capture the HUID at stock entry, print it on invoices and tags, block sale of unhallmarked items where required, and produce a searchable history when a customer or auditor asks.",
      },
    ],
  },
  {
    slug: "how-to-choose-the-right-jewelry-erp",
    title: "How to Choose the Right Jewelry ERP",
    excerpt:
      "With dozens of ERP options on the market, choosing the right one for your jewelry business can feel overwhelming. We break down the 10 essential features every jewelry ERP should have -- from live metal rate integration to karigar management and GST compliance.",
    date: "February 10, 2026",
    readTime: "10 min read",
    category: "Buying Guide",
    body: [
      {
        text: "Start from your workflows, not the feature list. Walk through a real day: buying old gold, billing a customer, issuing metal to a karigar, closing the day's cash and metal book.",
      },
      {
        heading: "Ten things to check",
        text: "Weight and purity based inventory; live metal-rate integration; karigar and job-work management; making-charge and wastage rules; GST-ready invoicing; HUID and hallmark tracking; barcode/RFID tagging; multi-branch stock transfer; customer CRM with schemes and loyalty; and reporting on metal position and margins.",
      },
      {
        heading: "Run a pilot",
        text: "Load a few hundred real items, bill real scenarios, and ask your staff to try it. Adoption by the counter staff decides whether an ERP delivers value.",
      },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
