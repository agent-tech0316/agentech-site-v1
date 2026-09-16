import type { ResolvingMetadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { EducationCourseButton } from "@/components/education-course-button";
import { HistoryBackButton } from "@/components/history-back-button";
import { educationGradePages, getEducationGradePage } from "@/lib/education-grade-pages";
import { educationCourses, getEducationCourse } from "@/lib/education-courses";
import { formatUsd } from "@/lib/pricing";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

type CoursePageProps = {
  params: Promise<{
    grade: string;
    course: string;
  }>;
};

export function generateStaticParams() {
  return educationCourses.map((course) => ({
    grade: course.gradeSlug,
    course: course.slug
  }));
}

export async function generateMetadata({ params }: CoursePageProps, parent: ResolvingMetadata) {
  const { grade, course } = await params;
  const courseData = getEducationCourse(grade, course);

  if (!courseData) {
    return {};
  }

  return resolvePublicPageMetadata(`/agentech-education/${courseData.gradeSlug}/${courseData.slug}`, parent, {
    title: `${courseData.title} | Agentech Education`,
    description: courseData.description
  });
}

export default async function EducationCoursePage({ params }: CoursePageProps) {
  const { grade, course } = await params;
  const gradePage = getEducationGradePage(grade);
  const courseData = getEducationCourse(grade, course);

  if (!gradePage || !courseData) {
    notFound();
  }

  const detailFlyerImages = courseData.detailFlyerImages ?? [courseData.flyerImage];

  return (
    <main className="education-black min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HistoryBackButton fallbackHref={`/agentech-education/${gradePage.slug}`} className="text-sm font-semibold text-slate-600 transition hover:text-slate-950" />
          <EducationCourseButton courseCode={courseData.courseCode} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-technical text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{courseData.courseCode}</p>
            <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">{courseData.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">{courseData.description}</p>
            {courseData.price > 0 ? <p className="font-technical mt-5 text-2xl font-semibold text-slate-950">{formatUsd(courseData.price)}</p> : null}
            {courseData.priceNote ? <p className="font-technical mt-5 text-2xl font-semibold text-slate-950">{courseData.priceNote}</p> : null}
          </div>
          <div className="flex lg:min-w-64 lg:justify-center">
            <EducationCourseButton
              courseCode={courseData.courseCode}
              className="education-enroll-button inline-flex rounded-full px-8 py-4 text-sm font-semibold shadow-[0_16px_35px_rgba(15,23,42,0.12)] transition disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-white"
            />
          </div>
        </div>

        <div className={`mt-10 grid gap-6 ${detailFlyerImages.length > 1 ? "md:grid-cols-2" : ""}`}>
          {detailFlyerImages.map((flyerImage, index) => (
            <div
              key={flyerImage}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.12)]"
            >
              <Image
                src={flyerImage}
                alt={`${courseData.title} flyer ${index + 1}`}
                width={1600}
                height={2200}
                className="h-auto w-full"
                priority={index === 0}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
