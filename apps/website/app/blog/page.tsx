import type { Metadata } from "next";
import SectionHeader from "@/components/SectionHeader";
import NewsletterForm from "@/components/NewsletterForm";
import { posts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights, guides, and best practices for running a modern jewelry business. From HUID compliance to choosing the right ERP.",
};

export default function BlogPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-navy via-navy-light to-navy pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            The CaratFlow <span className="text-gold">Blog</span>
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Insights, guides, and best practices for running a modern jewelry
            business.
          </p>
        </div>
      </section>

      {/* Blog Posts */}
      <section className="py-20 bg-warm-gray">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="space-y-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-gold uppercase tracking-wide bg-gold/10 px-3 py-1 rounded-full">
                    {post.category}
                  </span>
                  <span className="text-xs text-gray-400">{post.date}</span>
                  <span className="text-xs text-gray-400">{post.readTime}</span>
                </div>
                <h2 className="text-xl font-bold text-navy mb-3 group-hover:text-gold transition-colors">
                  {post.title}
                </h2>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  {post.excerpt}
                </p>
                <a
                  href={`/blog/${post.slug}`}
                  aria-label={`Read article: ${post.title}`}
                  className="text-gold font-semibold text-sm inline-flex items-center gap-1 group-hover:gap-2 transition-all"
                >
                  Read Article
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <SectionHeader
            title="Stay in the Loop"
            subtitle="Get the latest jewelry industry insights, product updates, and compliance guides delivered to your inbox."
          />
          <NewsletterForm source="marketing-site-blog" />
          <p className="text-xs text-gray-400 mt-3">
            No spam. Unsubscribe anytime.
          </p>
        </div>
      </section>
    </>
  );
}
