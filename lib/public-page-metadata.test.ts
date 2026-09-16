import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePublicPageMetadata } from "./public-page-metadata.ts";

test("sets a route-specific canonical and Open Graph URL without dropping inherited fields", async () => {
  const metadata = await resolvePublicPageMetadata(
    "/news",
    Promise.resolve({
      alternates: { canonical: "https://www.agent-tech.ai" },
      openGraph: {
        title: "Agentech",
        description: "Inherited description",
        siteName: "Agentech",
        type: "website",
      },
    }) as never,
    { title: "News" },
  );

  assert.equal(metadata.alternates?.canonical, "/news");
  assert.equal(metadata.title, "News");
  assert.equal(metadata.openGraph?.url, "/news");
  assert.equal(metadata.openGraph?.title, "News");
  assert.equal(metadata.openGraph?.siteName, "Agentech");
  assert.equal(metadata.openGraph?.description, "Inherited description");
});
