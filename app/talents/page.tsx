import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";
import { company } from "@/lib/site-data";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/talents", parent, {
    title: "Agentech Talents",
    description:
      "Explore Agentech pathways for students, emerging builders, and professionals working in AI and robotics."
  });
}

const talentPrograms = [
  {
    id: "club",
    number: "01",
    title: "AI & Robotics Club",
    audience: "Middle School · High School · College",
    description:
      "Build technical fluency through real robotics challenges, collaborative projects, and guided exploration.",
    href: "/ai-robotics-club",
    applyHref: "/ai-robotics-club/apply",
    image: "/assets/programs/summer-school.png",
    alt: "Students collaborating in the Agentech AI and Robotics Club",
    accent: "#75d4c2",
    lightAccent: "#007d6f"
  },
  {
    id: "internship",
    number: "02",
    title: "Internship",
    audience: "University · Early Career · Beyond",
    description:
      "Work alongside the Agentech team on embodied AI, robotics systems, and products built for the real world.",
    href: "/career-intern",
    applyHref: "/career-intern/apply",
    image: "/assets/programs/internship.png",
    alt: "Agentech internship team collaborating on embodied robotics systems",
    accent: "#83c8ef",
    lightAccent: "#1a73e8"
  },
  {
    id: "workshop",
    number: "03",
    title: "Workshop",
    audience: "Professionals · Founders · Adult Learners",
    description:
      "Turn curiosity into working capability with focused, hands-on sessions across AI, robotics, and product building.",
    href: "/tech-education",
    applyHref: "/tech-education#workshop-application",
    image: "/assets/programs/tech-education.png",
    alt: "Students building robotics projects in an Agentech workshop",
    accent: "#c7aff2",
    lightAccent: "#6f42c1"
  }
] as const;

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export default function TalentsPage() {
  return (
    <div className="talents-theme-page min-h-screen overflow-hidden bg-[#020609] text-[#dbe7f2]">
      <section
        data-talents-hero
        className="relative isolate min-h-[calc(100svh-72px)] overflow-hidden border-b border-white/10 bg-[#071017]"
        aria-labelledby="talents-hero-title"
      >
        <Image
          src="/assets/agents/talents-page.png"
          alt="Agentech team members collaborating in a robotics workspace"
          fill
          sizes="100vw"
          className="-z-20 object-cover object-[58%_center] grayscale-[18%] saturate-[0.72]"
          priority
        />
        <div
          data-talents-hero-overlay
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(2,6,9,0.45)_0%,rgba(2,6,9,0.42)_42%,#020609_100%)] md:bg-[linear-gradient(90deg,#020609_0%,rgba(2,6,9,0.96)_22%,rgba(2,6,9,0.68)_52%,rgba(2,6,9,0.18)_100%)]"
          aria-hidden="true"
        />
        <div
          data-talents-hero-sheen
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_72%_35%,rgba(128,216,244,0.13),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_24%,rgba(0,0,0,0.3)_100%)]"
          aria-hidden="true"
        />

        <div className="mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-7xl items-end px-5 pb-14 pt-24 sm:px-8 md:items-center md:py-20">
          <div data-talents-hero-copy className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#80d8f4] sm:text-xs">
              Agentech / Talent systems
            </p>
            <div
              data-talents-split-wordmark="true"
              role="img"
              aria-label="Agentech Talents"
              className="relative mt-8 aspect-[1000/247] w-[min(82vw,32.5rem)]"
            >
              <Image
                data-talents-wordmark-line="agentech"
                src="/assets/logo/AGENTECH-talents-solid.png"
                alt=""
                fill
                sizes="(min-width: 768px) 520px, 82vw"
                className="talents-theme-logo object-contain object-left"
                priority
              />
              <Image
                data-talents-wordmark-line="talents"
                src="/assets/logo/AGENTECH-talents-solid.png"
                alt=""
                fill
                sizes="(min-width: 768px) 520px, 82vw"
                className="talents-theme-logo object-contain object-left"
              />
            </div>
            <h1
              id="talents-hero-title"
              data-talents-title
              data-hero-optical-align="display-title"
              className="font-display mt-9 max-w-xl text-4xl font-medium uppercase leading-[1.04] tracking-[-0.055em] text-white sm:text-5xl lg:text-6xl"
            >
              Start early. Build for real.
            </h1>
            <p data-talents-hero-body className="mt-6 max-w-lg text-sm leading-7 text-[#a7b2bd] sm:text-base sm:leading-8">
              Pathways for students, emerging builders, and professionals ready to learn by making real AI and robotics systems.
            </p>
            <div data-talents-hero-actions className="mt-8 flex flex-wrap gap-3">
              <a
                href="#talent-pathways"
                data-theme-primary-action
                className="inline-flex min-h-11 items-center gap-3 rounded-xl bg-[#e6edf2] px-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#071017] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef]"
              >
                Explore pathways <ArrowIcon />
              </a>
              <a
                href={`mailto:${company.contactEmail}`}
                data-theme-secondary-action
                className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-white/25 bg-black/10 px-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#c3ced8] backdrop-blur-sm transition hover:border-[#83c8ef] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef]"
              >
                Contact talents <ArrowIcon />
              </a>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-6 right-6 hidden items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-white/45 lg:flex" aria-hidden="true">
          <span className="h-px w-10 bg-[#80d8f4]/50" />
          Education · Experience · Opportunity
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-5 pb-16 pt-16 sm:px-8 lg:pb-24 lg:pt-24">
        <section id="talent-pathways" aria-labelledby="talent-pathways-title">
          <div className="grid gap-6 border-b border-[#173245] pb-9 md:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)] md:items-end">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-[#80d8f4]">
                Choose your entry point
              </p>
              <h2
                id="talent-pathways-title"
                className="font-display mt-4 text-3xl font-medium uppercase tracking-[-0.045em] text-[#e4edf5] sm:text-4xl"
              >
                Talent pathways
              </h2>
            </div>
            <p className="text-sm leading-7 text-[#8293a7] md:text-right">
              Three ways to begin. Each pathway turns learning into tangible work, feedback, and forward momentum.
            </p>
          </div>

          <ol className="mt-8 grid gap-5 lg:grid-cols-3">
            {talentPrograms.map((program) => (
              <li
                key={program.href}
                data-talents-program={program.id}
                style={{ "--talents-light-accent": program.lightAccent } as CSSProperties}
                className="relative"
              >
                <Link
                  href={program.href}
                  aria-label={`Explore ${program.title}`}
                  data-talents-program-link={program.id}
                  className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#223947] bg-[#050b10] transition duration-300 hover:-translate-y-0.5 hover:border-[#4c7087] hover:bg-[#08131b] hover:shadow-[0_22px_60px_rgba(0,0,0,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef]"
                >
                  <div className="relative aspect-[16/11] overflow-hidden border-b border-[#24323b]">
                    <Image
                      src={program.image}
                      alt={program.alt}
                      fill
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="object-cover saturate-[0.72] transition duration-700 group-hover:scale-[1.035] group-hover:saturate-100"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,9,0.08),transparent_52%,rgba(2,6,9,0.64))]" />
                    <span
                      data-talents-pathway-number
                      data-talents-accent="true"
                      className="font-technical absolute bottom-5 left-5 grid h-14 w-14 place-items-center rounded-lg border bg-[#020609]/80 text-xl font-semibold shadow-[0_12px_30px_rgba(0,0,0,0.38)] backdrop-blur-md"
                      style={{
                        color: program.accent,
                        borderColor: `${program.accent}88`,
                        boxShadow: `0 12px 30px rgba(0,0,0,0.38), inset 0 0 24px ${program.accent}12`
                      }}
                    >
                      {program.number}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <p
                      data-talents-accent="true"
                      className="text-[10px] font-medium uppercase tracking-[0.18em]"
                      style={{ color: program.accent }}
                    >
                      {program.audience}
                    </p>
                    <h3 className="font-display mt-4 text-2xl font-semibold uppercase tracking-[-0.035em] text-[#e4edf5] sm:text-3xl">
                      {program.title}
                    </h3>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-[#91a2b5]">
                      {program.description}
                    </p>
                    <span
                      data-page-cta
                      data-talents-accent="true"
                      className="mt-7 inline-flex min-h-11 w-fit items-center gap-3 rounded-xl border border-[#31566d] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition group-hover:border-current group-hover:text-white max-[359px]:px-3 max-[359px]:tracking-[0.08em] lg:mt-auto lg:translate-y-1"
                      style={{ color: program.accent }}
                    >
                      Explore <ArrowIcon />
                    </span>
                  </div>
                </Link>
                <Link
                  href={program.applyHref}
                  aria-label={`Apply for ${program.title}`}
                  data-talents-application={program.id}
                  data-talents-accent="true"
                  className="absolute bottom-6 right-6 z-20 inline-flex min-h-11 items-center gap-2 rounded-xl border bg-[#020609]/80 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] shadow-[0_10px_24px_rgba(0,0,0,0.2)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-[#08131b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef] max-[359px]:px-3 max-[359px]:tracking-[0.08em] sm:bottom-7 sm:right-7"
                  style={{ color: program.accent, borderColor: `${program.accent}88` }}
                >
                  Apply now <ArrowIcon />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="mt-16 overflow-hidden rounded-xl border border-[#174766] bg-[#061722] px-6 py-9 sm:px-9 sm:py-11 lg:flex lg:items-center lg:justify-between lg:gap-10"
          aria-labelledby="talents-contact-title"
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#80d8f4]">
              Need a different entry point?
            </p>
            <h2 id="talents-contact-title" className="font-display mt-4 text-2xl font-semibold tracking-[0.02em] text-[#e4edf5] sm:text-3xl">
              Start a conversation with our team.
            </h2>
          </div>
          <a
            href={`mailto:${company.contactEmail}`}
            data-theme-primary-action
            className="mt-7 inline-flex min-h-12 shrink-0 items-center gap-3 rounded-xl bg-[#e6edf2] px-6 text-xs font-semibold uppercase tracking-[0.08em] text-[#071017] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef] lg:mt-0"
          >
            {company.contactEmail} <ArrowIcon />
          </a>
        </section>

        <div className="mt-8 flex flex-col gap-3 border-t border-[#173245] pt-6 text-[10px] uppercase tracking-[0.17em] text-[#5f7185] sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-technical">03</span> pathways · One builder mindset</p>
          <p>Agentech / Talent systems</p>
        </div>
      </div>
    </div>
  );
}
