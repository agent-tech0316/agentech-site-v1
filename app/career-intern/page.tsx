import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HistoryBackButton } from "@/components/history-back-button";
import { internshipRoles } from "@/lib/internship-roles";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/career-intern", parent, {
    title: "Internship | Agentech Talents",
    description: "Explore Agentech internship openings in intelligent hardware, robotics software, AI engineering, algorithms, and research."
  });
}

export default function CareerInternPage() {
  return (
    <section className="internship-light-page internship-list-page min-h-screen bg-[#f5f4f1] px-6 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <HistoryBackButton
          fallbackHref="/talents"
          className="talent-back-button mb-10 inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
        />

        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.24em] !text-black">INTERNSHIP</p>
          <h1 className="font-display mt-5 text-4xl font-semibold uppercase tracking-[0.14em] !text-black md:text-6xl">
            Choose Your Track
          </h1>
          <p className="mt-5 text-base leading-8 !text-black md:text-lg">
            Explore Agentech internship openings, read the role details, then apply through one shared internship form.
          </p>
        </div>

        <div className="relative mt-12 overflow-hidden rounded-[24px] shadow-[0_18px_45px_rgba(15,23,42,0.1)]">
          <Image
            src="/assets/programs/internship.png"
            alt="Agentech internship team collaborating on embodied robotics systems"
            width={1536}
            height={1024}
            priority
            className="h-[260px] w-full object-cover object-center sm:h-[360px] lg:h-[520px]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/15 to-transparent" />
        </div>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold !text-black md:text-3xl">Related to your work experience</h2>
          <div className="mt-7 grid gap-5">
            {internshipRoles.map((role, index) => (
              <Link
                key={role.slug}
                data-internship-surface
                href={`/career-intern/${role.slug}`}
                className={`group block rounded-[24px] border bg-white p-5 !text-black shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.12)] md:p-6 ${
                  index === 1 ? "border-blue-600" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span data-internship-chip className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-bold !text-black">
                        {role.schedule}
                      </span>
                    </div>
                    <h3 className="font-display mt-4 text-2xl font-bold leading-tight !text-black underline decoration-slate-400 underline-offset-4 transition group-hover:decoration-slate-950">
                      <span className="font-technical">{index + 1}.</span> {role.title}
                    </h3>
                    <p className="mt-4 text-lg leading-7 !text-black">{role.eyebrow}</p>
                    <p className="mt-4 max-w-3xl text-sm leading-6 !text-black md:text-base">{role.summary}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {role.tags.map((tag) => (
                        <span data-internship-chip key={tag} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold !text-black">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="internship-view-role-button inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition">
                      View Role
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/career-intern/apply"
            className="internship-dark-button inline-flex rounded-full bg-slate-950 px-7 py-3 text-sm font-semibold transition hover:bg-slate-800"
          >
            Apply Now
          </Link>
          <HistoryBackButton
            fallbackHref="/talents"
            className="talent-back-button inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
          />
        </div>
      </div>
    </section>
  );
}
