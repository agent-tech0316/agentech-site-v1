import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { accountSessionCookieName } from "@/lib/account-session";
import { canViewNewsEntry } from "@/lib/news-access";
import { newsEntries } from "@/lib/news";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export const dynamic = "force-dynamic";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/news", parent);
}

export default async function NewsPage() {
  const cookieStore = await cookies();
  const accountEmail = cookieStore.get(accountSessionCookieName)?.value;
  const visibleEntries = newsEntries.filter((entry) => canViewNewsEntry(entry, accountEmail));

  return (
    <section className="news-theme-page border-b border-[#d8dde5] bg-[#eeeeee]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mb-10">
          <p data-news-kicker className="text-xs font-semibold uppercase tracking-[0.24em] text-[#64748b]">Agentech Updates</p>
          <h1 data-news-title className="font-display mt-4 text-4xl font-semibold uppercase tracking-[0.16em] text-[#0b1220] md:text-6xl">
            News
          </h1>
        </div>

        <div className="space-y-5">
          {visibleEntries.map((entry) => (
            <Link
              key={entry.slug}
              href={`/news/${entry.slug}`}
              data-news-card
              className="group min-h-[150px] gap-5 rounded-[8px] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:min-h-[170px] sm:gap-8 sm:p-7"
            >
              <div data-news-card-content className="min-w-0">
                <div data-news-card-meta className="flex flex-wrap items-center gap-3 text-sm">
                  <span data-news-author className="font-semibold text-[#4666a1]">{entry.author || "Agentech"}</span>
                  <span data-news-meta className="text-[#a3aab5]">{entry.displayDate}</span>
                </div>
                <h2 data-news-title data-news-card-title className="font-display mt-3 line-clamp-2 text-xl font-semibold leading-snug text-[#111827] sm:text-2xl">
                  {entry.title}
                </h2>
                <p data-news-excerpt className="mt-3 line-clamp-2 text-sm leading-6 text-[#4b5563] sm:text-base">
                  {entry.excerpt}
                </p>
                <p data-news-read-more className="mt-4 text-sm font-semibold text-[#9ca3af]">
                  Read more
                </p>
              </div>

              <div data-news-thumbnail className="relative self-center overflow-hidden rounded-[5px] bg-[#dbe3ee] max-sm:aspect-[4/3] sm:aspect-[16/9]">
                <Image
                  src={entry.coverImage}
                  alt={entry.title}
                  fill
                  sizes="(min-width: 768px) 320px, calc(100vw - 72px)"
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  priority
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
