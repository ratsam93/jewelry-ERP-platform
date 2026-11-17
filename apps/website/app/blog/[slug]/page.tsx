import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, posts } from "@/lib/posts";

export const dynamicParams = false;

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getPost((await params).slug);
  return post ? { title: post.title, description: post.excerpt } : {};
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  if (!post) notFound();

  return (
    <>
      <section className="bg-gradient-to-br from-navy via-navy-light to-navy pt-32 pb-12 md:pt-40 md:pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <a href="/blog" className="text-gold text-sm font-medium hover:underline">&larr; Back to Blog</a>
          <h1 className="text-3xl md:text-4xl font-bold text-white mt-4 mb-4">{post.title}</h1>
          <p className="text-sm text-gray-300">
            {post.category} &middot; {post.date} &middot; {post.readTime}
          </p>
        </div>
      </section>
      <article className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-5 text-gray-700 leading-relaxed">
          <p className="text-lg text-gray-600">{post.excerpt}</p>
          {post.body.map((block, i) => (
            <div key={i}>
              {block.heading && <h2 className="text-xl font-bold text-navy mb-2 mt-4">{block.heading}</h2>}
              <p>{block.text}</p>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
