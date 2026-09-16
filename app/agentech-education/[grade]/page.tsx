import type { ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EaiImmersionLandingPage } from "@/components/eai-immersion-landing-page";
import { EducationCourseButton } from "@/components/education-course-button";
import { HistoryBackButton } from "@/components/history-back-button";
import { getEducationCoursesByGrade } from "@/lib/education-courses";
import { educationGradePages, getEducationGradePage } from "@/lib/education-grade-pages";
import { eaiImmersionSlug } from "@/lib/program-journey-data";
import { formatUsd } from "@/lib/pricing";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

type GradePageProps = {
  params: Promise<{
    grade: string;
  }>;
};

export function generateStaticParams() {
  return educationGradePages.map((page) => ({
    grade: page.slug
  }));
}

export async function generateMetadata({ params }: GradePageProps, parent: ResolvingMetadata) {
  const { grade } = await params;
  const page = getEducationGradePage(grade);

  if (!page) {
    return {};
  }

  if (page.slug === eaiImmersionSlug) {
    return resolvePublicPageMetadata(`/agentech-education/${page.slug}`, parent, {
      title: "EAI Robotics Future Founder Immersion Program | Agentech Education",
      description:
        "Two standalone 5-day sessions where high school students build AI robotics ventures and products inside a real robotics company."
    });
  }

  return resolvePublicPageMetadata(`/agentech-education/${page.slug}`, parent, {
    title: `${page.grade} | Agentech Education`,
    description: page.subtitle
  });
}

export default async function EducationGradePage({ params }: GradePageProps) {
  const { grade } = await params;
  const page = getEducationGradePage(grade);

  if (!page) {
    notFound();
  }

  if (page.slug === eaiImmersionSlug) {
    return <EaiImmersionLandingPage />;
  }

  const courses = getEducationCoursesByGrade(page.slug);
  const heroImage = page.slug === "6-8" ? page.image : page.flyerImage;

  return (
    <main data-education-canvas="warm-off-white" className="education-grade-theme education-black min-h-screen bg-[#f5f4f1] text-black">
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <HistoryBackButton
          fallbackHref="/agentech-education?pathway=grade-k-8#program-pathways"
          className="text-sm font-semibold text-slate-600 transition hover:text-slate-950"
        />

        <div className="mt-8 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{page.grade}</p>
            <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
              {page.title}
            </h1>
            <div className="mt-5 max-w-2xl space-y-5 text-base leading-8 text-slate-700 md:text-lg">
              {page.subtitle.split("\n\n").map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login?next=/account-setup"
                className="education-enroll-button inline-flex rounded-full px-6 py-3 text-sm font-semibold transition"
              >
                Parent Login
              </Link>
            </div>
          </div>

          <div data-education-hero-media className="overflow-hidden rounded-2xl bg-slate-50 shadow-[0_18px_45px_rgba(15,23,42,0.1)] ring-1 ring-slate-200">
            <Image
              src={heroImage}
              alt={`${page.grade} class flyer`}
              width={1200}
              height={1600}
              className="h-auto w-full"
              priority
            />
          </div>
        </div>

        {courses.length ? (
          <div className="mt-14 border-t border-slate-200 pt-10">
            <div className="mb-7">
              <h2 className="font-display text-3xl font-semibold text-slate-950">Available Courses</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {courses.map((course) => {
                const usesPortraitCourseCard = ["W001", "W002", "W003"].includes(course.courseCode);

                return (
                  <article
                    key={course.courseCode}
                    data-course-card={course.courseCode}
                    className={`w-full overflow-hidden rounded-xl border border-[#d8d3ca] bg-[#f5f4f1] shadow-[0_16px_45px_rgba(15,23,42,0.08)] ${usesPortraitCourseCard ? "max-w-[320px]" : ""}`}
                  >
                  <Link href={`/agentech-education/${page.slug}/${course.slug}`} className="group block">
                    <div
                      data-course-flyer={course.courseCode}
                      className={`relative overflow-hidden ${usesPortraitCourseCard ? "aspect-[1429/2000] bg-white" : "aspect-[16/10] bg-slate-100"}`}
                    >
                      <Image
                        src={course.flyerImage}
                        alt={`${course.title} flyer`}
                        fill
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className={usesPortraitCourseCard ? "object-contain" : "object-cover transition duration-500 group-hover:scale-[1.03]"}
                      />
                    </div>
                  </Link>
                  <div
                    data-course-details={course.courseCode}
                    className={`grid sm:grid-cols-[1fr_auto] sm:items-end ${usesPortraitCourseCard ? "gap-2 p-3" : "gap-5 p-6"}`}
                  >
                    <Link href={`/agentech-education/${page.slug}/${course.slug}`} className="block">
                      <p className={`font-technical ${usesPortraitCourseCard ? "text-xs" : "text-sm"} font-semibold text-slate-500`}>{course.courseCode}</p>
                      <h3
                        data-course-title={course.courseCode}
                        className={`font-display ${usesPortraitCourseCard ? "mt-1 text-xl" : "mt-2 text-2xl"} font-semibold text-slate-950`}
                      >
                        {course.title}
                      </h3>
                      <p
                        data-course-description={course.courseCode}
                        className={`${usesPortraitCourseCard ? "mt-1 leading-5" : "mt-3 leading-6"} text-sm text-slate-600`}
                      >
                        {course.previewDescription}
                      </p>
                      {course.price > 0 ? (
                        <p
                          data-course-price={course.courseCode}
                          className={`font-technical ${usesPortraitCourseCard ? "mt-2 text-lg" : "mt-4 text-xl"} font-semibold text-slate-950`}
                        >
                          {formatUsd(course.price)}
                        </p>
                      ) : null}
                      {course.priceNote ? (
                        <p className={`font-technical ${usesPortraitCourseCard ? "mt-2 text-lg" : "mt-4 text-xl"} font-semibold text-slate-950`}>
                          {course.priceNote}
                        </p>
                      ) : null}
                      <p
                        data-course-flyer-link={course.courseCode}
                        className={`${usesPortraitCourseCard ? "mt-2" : "mt-5"} text-xs font-semibold uppercase tracking-[0.18em] text-slate-950`}
                      >
                        View Flyer
                      </p>
                    </Link>
                    <div className="sm:justify-self-end">
                    <EducationCourseButton
                      courseCode={course.courseCode}
                      className={`education-enroll-button inline-flex justify-center whitespace-nowrap rounded-full font-semibold transition disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-white ${usesPortraitCourseCard ? "px-4 py-2 text-xs" : "px-6 py-3 text-sm"}`}
                    />
                    </div>
                  </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
