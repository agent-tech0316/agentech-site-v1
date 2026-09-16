import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import { HistoryBackButton } from "@/components/history-back-button";
import { SummerSchoolForm } from "@/components/summer-school-form";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";
import { SUMMER_SCHOOL_GRADES, type SummerSchoolGrade } from "@/lib/summer-school";

type ApplyPageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/ai-robotics-club/apply", parent);
}

function firstSearchValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function validGrade(value: string): SummerSchoolGrade | undefined {
  return SUMMER_SCHOOL_GRADES.find((grade) => grade === value);
}

export default async function AiRoboticsClubApplyPage({ searchParams }: { searchParams: ApplyPageSearchParams }) {
  const params = await searchParams;
  const initialValues = {
    name: firstSearchValue(params.name).slice(0, 120),
    grade: validGrade(firstSearchValue(params.grade)),
    projects: firstSearchValue(params.projects).slice(0, 2_000),
  };

  return (
    <section
      data-club-page-theme="warm-off-white"
      className="min-h-screen bg-[#f5f4f1] px-6 py-16 text-slate-950 lg:px-8 lg:py-20"
    >
      <div className="mx-auto max-w-7xl">
        <HistoryBackButton
          fallbackHref="/ai-robotics-club"
          className="talent-back-button mb-10 inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
        />

        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-black">AI & Robotics Club</p>
            <h1 className="font-display mt-5 text-4xl font-semibold uppercase tracking-[0.12em] text-black md:text-6xl">
              Apply for AI & Robotics Club
            </h1>
            <p className="mt-5 text-base leading-8 text-black md:text-lg">
              For motivated students ready to build AI projects, robotics systems, and future-ready engineering portfolios.
            </p>
          </div>

          <div data-club-surface className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <Image
              src="/assets/talents/club/club-1.png"
              alt="AI and Robotics Club"
              width={1400}
              height={900}
              priority
              className="h-auto w-full object-cover"
            />
          </div>
        </div>

        <SummerSchoolForm initialValues={initialValues} />
      </div>
    </section>
  );
}
