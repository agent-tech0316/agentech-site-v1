import type { Metadata, ResolvingMetadata } from "next";
import { ApplicationSystem } from "@/components/application-system";
import { PageHero } from "@/components/page-hero";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/career", parent);
}

export default function CareerPage() {
  return (
    <>
      <PageHero
        eyebrow="Career"
        title="Apply to Build."
        description="A unified application system for full-time, internship, partnerships, and high-signal talents."
      />

      <ApplicationSystem mode="full" />
    </>
  );
}
