import type { Metadata, ResolvingMetadata } from "next";

export async function resolvePublicPageMetadata(
  canonicalPath: string,
  parent: ResolvingMetadata,
  metadata: Metadata = {},
): Promise<Metadata> {
  const inherited = await parent;
  const inheritedOpenGraph = inherited.openGraph ?? {};
  const metadataOpenGraph = metadata.openGraph ?? {};

  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical: canonicalPath,
    },
    openGraph: {
      ...inheritedOpenGraph,
      ...(typeof metadata.title === "string" ? { title: metadata.title } : {}),
      ...(typeof metadata.description === "string" ? { description: metadata.description } : {}),
      ...metadataOpenGraph,
      url: canonicalPath,
    },
  };
}
