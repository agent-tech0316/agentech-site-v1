import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { HistoryBackButton } from "@/components/history-back-button";
import { NewsArticleContent } from "@/components/news-article-content";
import { NewsSlideshow } from "@/components/news-slideshow";
import { accountSessionCookieName } from "@/lib/account-session";
import { getNewsEntry } from "@/lib/news";
import { canViewNewsEntry, isCompanyNewsEntry } from "@/lib/news-access";

export const dynamic = "force-dynamic";

type NewsArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: NewsArticlePageProps) {
  const { slug } = await params;
  const entry = getNewsEntry(slug);

  if (!entry) {
    return {};
  }

  const metadata = {
    title: entry.title,
    description: entry.excerpt,
    openGraph: {
      title: entry.title,
      description: entry.excerpt,
      images: [entry.coverImage]
    }
  };

  if (isCompanyNewsEntry(entry)) {
    return metadata;
  }

  const canonicalPath = `/news/${entry.slug}`;

  return {
    ...metadata,
    alternates: { canonical: canonicalPath },
    openGraph: { ...metadata.openGraph, url: canonicalPath }
  };
}

export default async function NewsArticlePage({ params }: NewsArticlePageProps) {
  const { slug } = await params;
  const entry = getNewsEntry(slug);

  const cookieStore = await cookies();
  const accountEmail = cookieStore.get(accountSessionCookieName)?.value;

  if (!entry || !canViewNewsEntry(entry, accountEmail)) {
    notFound();
  }

  return (
    <article data-news-article className="news-theme-page">
      <NewsSlideshow images={entry.images} media={entry.media} title={entry.title} />

      <div data-news-article-copy className="mx-auto max-w-4xl px-6 py-12 lg:px-8 lg:py-16">
        <HistoryBackButton
          fallbackHref="/news"
          className="text-xs font-semibold uppercase tracking-[0.18em] text-slate transition hover:text-white"
        />
        <div className="mt-6">
          <NewsArticleContent entry={entry} />
        </div>
      </div>
    </article>
  );
}
