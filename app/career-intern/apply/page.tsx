import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import { HistoryBackButton } from "@/components/history-back-button";
import { InternshipForm } from "@/components/internship-form";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/career-intern/apply", parent, {
    title: "Apply for Internship | Agentech Talents",
    description: "Submit an Agentech internship application."
  });
}

export default function CareerInternApplyPage() {
  return (
    <section className="internship-light-page min-h-screen bg-[#f5f4f1] px-6 py-16 text-slate-950 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap gap-3">
          <HistoryBackButton
            fallbackHref="/career-intern"
            className="talent-back-button inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
          />
        </div>

        <div className="mx-auto mt-10 max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.24em] !text-black">INTERNSHIP</p>
          <h1 className="font-display mt-5 text-4xl font-semibold uppercase tracking-[0.14em] !text-black md:text-6xl">
            Apply for Internship
          </h1>
          <p className="mt-5 text-base leading-8 !text-black md:text-lg">
            Use this shared form for all Agentech internship tracks.
          </p>
        </div>

        <div className="relative mt-12 overflow-hidden rounded-[24px] shadow-[0_18px_45px_rgba(15,23,42,0.1)]">
          <Image
            src="/assets/programs/internship.png"
            alt="Agentech internship team collaborating on embodied robotics systems"
            width={1536}
            height={1024}
            priority
            className="h-[220px] w-full object-cover object-center sm:h-[320px] lg:h-[420px]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/15 to-transparent" />
        </div>

        <InternshipForm />
      </div>
    </section>
  );
}
