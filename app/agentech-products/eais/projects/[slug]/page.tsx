import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { EaisProjectDetail } from "@/components/eais-project-detail";
import { findEaisProject, prototypeWorks } from "@/lib/eais-showcase";

type ProjectPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return prototypeWorks.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(
  { params }: ProjectPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { slug } = await params;
  const work = findEaisProject(slug);
  if (!work) return { title: "Project not found | EAIS" };

  const title = `${work.title} | EAIS Project`;
  const description = `${work.summary} Explore this concept’s proposed build, development process, and experiment plan.`;
  const canonical = `/agentech-products/eais/projects/${slug}`;
  const inherited = await parent;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      ...inherited.openGraph,
      title,
      description,
      url: canonical
    }
  };
}

export default async function EaisProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const work = findEaisProject(slug);
  if (!work) notFound();

  return <EaisProjectDetail work={work} />;
}
