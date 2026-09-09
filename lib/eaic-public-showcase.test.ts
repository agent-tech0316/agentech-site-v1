import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import { navigation } from "./site-data.ts";

const workspaceRoot = new URL("../", import.meta.url);

async function readWorkspaceFile(path: string) {
  return readFile(new URL(path, workspaceRoot), "utf8");
}

test("EAIC has a public product route while the Hub stays the explicit developer-workspace destination", async () => {
  const platform = navigation.find((item) => item.label === "Platform");
  assert.ok(platform);
  assert.equal(platform.href, "/agentech-products/eaic");
  assert.equal(platform.menuTriggerHref, "/agentech-products/eaic");
  assert.equal(platform.columns?.find((item) => item.label === "EAIC")?.href, "/agentech-products/eaic");

  const page = await readWorkspaceFile("app/agentech-products/eaic/page.tsx");
  assert.match(page, /data-eaic-public-page/);
  assert.match(page, /href=\{eaicHubPath\}/);
  assert.match(page, /data-eaic-public-hub-cta/);
  assert.doesNotMatch(page, /AgentechLibraryAccessGate/);
});

test("EAIC public metadata overrides the root canonical and Open Graph URL without dropping route identity", async () => {
  const page = await readWorkspaceFile("app/agentech-products/eaic/page.tsx");

  assert.match(page, /export const metadata:\s*Metadata\s*=\s*\{\s*title:\s*"EAIC",/);
  assert.match(page, /alternates:\s*\{\s*canonical:\s*"\/agentech-products\/eaic"\s*\}/);
  assert.match(page, /openGraph:\s*\{[\s\S]*?url:\s*"\/agentech-products\/eaic"/);
  assert.match(page, /openGraph:\s*\{\s*title:\s*"EAIC \| Agentech",/);
  for (const field of ["title", "description", "siteName", "type"]) {
    assert.match(page, new RegExp(`${field}:`), `EAIC Open Graph metadata must keep ${field}`);
  }
});

test("EAIC public entry lets a developer explore tangible, published robot outcomes before opening the Hub", async () => {
  const [page, experience] = await Promise.all([
    readWorkspaceFile("app/agentech-products/eaic/page.tsx"),
    readWorkspaceFile("components/eaic-public-experience.tsx")
  ]);

  assert.match(page, /EaicPublicExperience/);
  assert.match(page, /Turn your ideas into robot actions\./);

  for (const hook of [
    "data-eaic-capability-picker",
    "data-eaic-capability-trigger",
    "data-eaic-capability-preview",
    "data-eaic-capability-details",
    "data-eaic-simulation-preview"
  ]) {
    assert.match(experience, new RegExp(hook));
  }

  assert.match(experience, /useState/);
  assert.match(experience, /Agentech\.wave/);
  assert.match(experience, /Agentech\.return_to_home/);
  assert.match(experience, /Agentech\.capture_image/);
  assert.match(experience, /master\/02_action_wave_right\.mp4/);
  assert.match(experience, /navi\/return-to-home\/navi-return-to-home\.mp4/);
  assert.match(experience, /aegis\/capture-view\/aegis-capture-view\.mp4/);
  assert.doesNotMatch(experience, /data-eaic-still-preview/);
  assert.match(experience, /Simulated camera preview/);
  assert.match(experience, /not live robot footage/);
  assert.match(experience, /<video[^>]*muted[^>]*playsInline/);
  assert.match(experience, /Simulation preview/);
  assert.match(experience, /A simple hello\./);
  assert.match(experience, /Find the way home\./);
  assert.match(experience, /See from a new angle\./);
  assert.doesNotMatch(experience, /<dl>/, "capability details must stay on demand instead of becoming a dense specifications table");
  assert.match(page, /data-eaic-public-safety-boundary/);
  assert.match(page, /do not prove physical safety/i);
  assert.match(page, /calibration, live media availability, or a successful robot run/i);
});

test("EAIC public presentation keeps page-scoped light, dark, responsive, and reduced-motion styles", async () => {
  const css = await readWorkspaceFile("app/agentech-products/eaic/eaic-public.css");
  const rules = postcss.parse(css);

  const selectors = new Set<string>();
  rules.walkRules((rule) => rule.selectors.forEach((selector) => selectors.add(selector)));

  assert.ok(selectors.has("[data-eaic-public-page]"));
  assert.ok(selectors.has(':root[data-theme="light"] [data-eaic-public-page]'));
  assert.ok(selectors.has(':root[data-theme="dark"] [data-eaic-public-page]'));
  assert.match(css, /#f5f4f1/i);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[data-eaic-capability-trigger\]\[aria-pressed="true"\]/);
  assert.match(css, /\.eaic-public-hero-note\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  assert.match(css, /min-height:\s*44px/);
});

test("EAIC presents the generated motion-study artwork consistently in both themes", async () => {
  const [page, css, demo] = await Promise.all([
    readWorkspaceFile("app/agentech-products/eaic/page.tsx"),
    readWorkspaceFile("app/agentech-products/eaic/eaic-public.css"),
    readWorkspaceFile("components/eaic-wave-demo.tsx")
  ]);

  assert.match(page, /<EaicWaveDemo \/>/);
  assert.match(demo, /eaic-next-move-wireframe-v1\.png/);
  assert.match(demo, /data-eaic-wave-body/);
  assert.match(demo, /data-eaic-wave-arm/);
  assert.match(css, /\.eaic-public-hero-art\s*\{[^}]*mix-blend-mode:\s*screen/);
  assert.match(css, /:root\[data-theme="light"\][^{]*\.eaic-public-hero-art\s*\{[^}]*mix-blend-mode:\s*multiply/);
  assert.match(css, /filter: invert\(1\) grayscale\(1\) contrast\(1\.16\)/);
});
