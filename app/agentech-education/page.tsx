import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EducationProgramTabs } from "@/components/education-program-tabs";
import { getChildrenEnrolled } from "@/lib/education-counter";
import { educationGradePages, resolveEducationPathway } from "@/lib/education-grade-pages";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

type AgentechEducationPageProps = {
  searchParams: Promise<{
    pathway?: string | string[];
  }>;
};

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/agentech-education", parent);
}

export default async function AgentechEducationPage({ searchParams }: AgentechEducationPageProps) {
  const childrenEnrolled = await getChildrenEnrolled();
  const resolvedSearchParams = await searchParams;
  const requestedPathway = Array.isArray(resolvedSearchParams.pathway)
    ? resolvedSearchParams.pathway[0]
    : resolvedSearchParams.pathway;
  const initialTab = resolveEducationPathway(requestedPathway);
  const hasRequestedPathway = requestedPathway === initialTab;

  return (
    <div className="education-eaic-page relative isolate min-h-screen overflow-hidden bg-[#020609] text-[#dbe7f2]">
      <div className="education-eaic-grid pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      <section className="relative overflow-hidden border-b border-[#173245] px-6 py-10 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(128,216,244,0.55),transparent)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-8 md:grid-cols-[1fr_minmax(300px,520px)_1fr]">
          <div className="border-l border-[#31566d] bg-white/[0.018] px-5 py-4 text-left">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#80d8f4]">
              Children enrolled
            </p>
            <p
              data-education-enrollment-count
              className="font-technical mt-2 text-3xl font-medium tracking-[-0.06em] text-[#e4edf5]"
            >
              {childrenEnrolled}
            </p>
            <p className="mt-2 text-[9px] uppercase tracking-[0.18em] text-[#60778a]">Learning network active</p>
          </div>

          <div className="flex flex-col items-center justify-center">
            <p className="mb-5 text-[10px] font-medium uppercase tracking-[0.28em] text-[#80d8f4]">
              Applied AI learning systems
            </p>
            <Image
              src="/assets/logo/AGENTECH-education-solid.png"
              alt="Agentech Education"
              width={1000}
              height={247}
              className="education-theme-logo h-auto w-full max-w-md drop-shadow-[0_0_28px_rgba(128,216,244,0.12)]"
              priority
            />
          </div>

          <div className="flex justify-start md:justify-end">
            <Link
              href="/login?next=/account-setup"
              data-theme-secondary-action
              className="group inline-flex min-h-11 items-center gap-3 rounded-full border border-[#31566d] bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c3ced8] transition hover:border-[#80d8f4] hover:bg-[#07131b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#83c8ef]"
            >
              Parent login
              <span className="text-[#80d8f4] transition group-hover:translate-x-0.5" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

      <EducationProgramTabs
        programs={educationGradePages}
        initialTab={initialTab}
        initialAutoRotate={!hasRequestedPathway}
      />
    </div>
  );
}
