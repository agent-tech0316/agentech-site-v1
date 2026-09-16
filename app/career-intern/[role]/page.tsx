import type { ResolvingMetadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { HistoryBackButton } from "@/components/history-back-button";
import { InternshipRoleDetail } from "@/components/internship-role-detail";
import { getInternshipRole, internshipRoles } from "@/lib/internship-roles";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

type InternshipRolePageProps = {
  params: Promise<{
    role: string;
  }>;
};

const roleVisuals: Record<string, { src: string; alt: string }> = {
  "intelligent-hardware-development-intern": {
    src: "/assets/internships/futuristic-city.avif",
    alt: "Futuristic AI city and intelligent hardware environment"
  },
  "robotics-ai-software-engineering-intern": {
    src: "/assets/internships/futuristic-ai-path.webp",
    alt: "Futuristic AI and robotics software environment"
  },
  "algorithm-research-intern": {
    src: "/assets/internships/math-research.jpg",
    alt: "Mathematics and algorithm research visualization"
  }
};

const imageClassName: Record<string, string> = {
  "robotics-ai-software-engineering-intern": "object-cover object-center opacity-92",
  "intelligent-hardware-development-intern": "object-cover object-center opacity-92",
  "algorithm-research-intern": "object-cover object-center opacity-92"
};

export function generateStaticParams() {
  return internshipRoles.map((role) => ({
    role: role.slug
  }));
}

export async function generateMetadata({ params }: InternshipRolePageProps, parent: ResolvingMetadata) {
  const { role: roleSlug } = await params;
  const role = getInternshipRole(roleSlug);

  if (!role) {
    return {};
  }

  return resolvePublicPageMetadata(`/career-intern/${role.slug}`, parent, {
    title: `${role.title} | Agentech Internship`,
    description: role.summary
  });
}

export default async function InternshipRolePage({ params }: InternshipRolePageProps) {
  const { role: roleSlug } = await params;
  const role = getInternshipRole(roleSlug);

  if (!role) {
    notFound();
  }

  const visual = roleVisuals[role.slug] || roleVisuals["robotics-ai-software-engineering-intern"];

  return (
    <section className="internship-light-page min-h-screen bg-[#f5f4f1] px-6 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap gap-3">
          <HistoryBackButton
            fallbackHref="/career-intern"
            className="talent-back-button inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
          />
        </div>

        <div data-internship-surface className="relative mt-10 overflow-hidden rounded-[30px] border border-[#b7c8df] bg-[radial-gradient(circle_at_82%_20%,rgba(56,189,248,0.36),transparent_30%),radial-gradient(circle_at_92%_76%,rgba(99,102,241,0.28),transparent_34%),linear-gradient(135deg,#f8fbff_0%,#e8f1ff_48%,#d9e8f8_100%)] shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
          <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(15,23,42,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative grid min-h-[460px] gap-8 p-7 md:p-9 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div data-internship-surface className="rounded-[24px] border border-white/70 bg-white/86 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.12)] backdrop-blur md:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] !text-black">{role.eyebrow}</p>
              <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight !text-black md:text-6xl">{role.title}</h1>
              <p className="mt-5 max-w-3xl text-base leading-8 !text-black md:text-lg">{role.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span data-internship-chip className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold !text-black ring-1 ring-[#93b4ff]">
                  {role.schedule}
                </span>
                {role.tags.map((tag) => (
                  <span data-internship-chip key={tag} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold !text-black ring-1 ring-[#93b4ff]">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative min-h-[280px] overflow-hidden rounded-[26px] border border-white/60 bg-[#07111f] shadow-[0_24px_70px_rgba(14,31,58,0.28)] md:min-h-[360px]">
              <Image
                src={visual.src}
                alt={visual.alt}
                fill
                sizes="(min-width: 1024px) 430px, 90vw"
                className={imageClassName[role.slug] || "object-cover opacity-90"}
                priority
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,22,0.04),rgba(4,10,22,0.46))]" />
              <div className="absolute bottom-5 left-5 right-5 flex flex-wrap gap-2">
                {["AI", "Robotics", "Systems"].map((label) => (
                  <span key={label} className="internship-image-chip rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] backdrop-blur">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <InternshipRoleDetail role={role} />
        </div>

      </div>
    </section>
  );
}
