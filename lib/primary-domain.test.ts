import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import nextConfig from "../next.config.ts";
import { canonicalSiteUrl, getSiteUrl } from "./site-config.ts";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
});

test("keeps the operational site URL independent from public canonicalization", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://agent-tech.ai/";

  assert.equal(getSiteUrl(), "https://agent-tech.ai");
  assert.equal(canonicalSiteUrl, "https://www.agent-tech.ai");
});

test("keeps local and preview origins intact", () => {
  for (const [configuredUrl, expectedUrl] of [
    ["http://127.0.0.1:3020/", "http://127.0.0.1:3020"],
    ["https://preview.example.test/", "https://preview.example.test"],
  ]) {
    process.env.NEXT_PUBLIC_SITE_URL = configuredUrl;
    assert.equal(getSiteUrl(), expectedUrl);
  }
});

test("permanently redirects the apex host to www while preserving the requested path", async () => {
  const redirects = await nextConfig.redirects?.();

  assert.deepEqual(redirects, [
    {
      source: "/:path*",
      has: [{ type: "host", value: "agent-tech.ai" }],
      destination: "https://www.agent-tech.ai/:path*",
      permanent: true,
    },
  ]);
});
