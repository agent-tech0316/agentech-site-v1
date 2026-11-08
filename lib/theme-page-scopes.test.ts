import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceRoot = new URL("../", import.meta.url);

async function readWorkspaceFile(path: string) {
  return readFile(new URL(path, workspaceRoot), "utf8");
}

test("major Agentech landing pages expose dedicated theme scopes", async () => {
  const [education, robotics, talents] = await Promise.all([
    readWorkspaceFile("app/agentech-education/page.tsx"),
    readWorkspaceFile("app/agentech-robotic/page.tsx"),
    readWorkspaceFile("app/talents/page.tsx")
  ]);

  assert.match(education, /education-eaic-page/);
  assert.match(robotics, /robotics-theme-page/);
  assert.match(talents, /talents-theme-page/);
});

test("each landing page has a complete warm light palette", async () => {
  const css = await readWorkspaceFile("app/globals.css");

  for (const scope of ["education-eaic-page", "robotics-theme-page", "talents-theme-page"]) {
    assert.match(css, new RegExp(`:root\\[data-theme=\\"light\\"\\] \\.${scope.replace(/-/g, "\\-")}`));
  }

  assert.match(css, /#f5f4f1/i);
  assert.match(css, /#1a73e8/i);
});

test("the light robotics hero keeps the robot crisp while protecting the left-side copy", async () => {
  const [page, css] = await Promise.all([
    readWorkspaceFile("app/agentech-robotic/page.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(page, /data-robotics-hero-image/);
  assert.match(
    css,
    /:root\[data-theme="light"\] \.robotics-theme-page \[data-robotics-hero-image\]\s*\{[^}]*opacity:\s*0\.92\s*!important;[^}]*filter:\s*contrast\(1\.08\)\s+saturate\(0\.96\)\s*!important;/
  );
  assert.match(
    css,
    /\[data-robotics-hero-overlay\][^{]*\{[^}]*linear-gradient\(90deg,[^}]*rgba\(245, 244, 241, 0\.08\)[^}]*transparent/
  );
});

test("the robotics mobile hero keeps the robot and brand copy in one shared frame", async () => {
  const [page, css] = await Promise.all([
    readWorkspaceFile("app/agentech-robotic/page.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(page, /data-robotics-hero-media/);
  assert.match(page, /data-robotics-hero-copy/);
  assert.match(page, /data-robotics-hero-brand/);
  assert.match(page, /data-robotics-hero-logo/);
  assert.match(
    css,
    /@media \(max-width:\s*767px\)[\s\S]*?\[data-robotics-hero\][^{]*\{[^}]*min-height:\s*420px;[\s\S]*?\[data-robotics-hero-media\][^{]*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*height:\s*100%;[\s\S]*?\[data-robotics-hero-copy\][^{]*\{[^}]*min-height:\s*420px;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*background:\s*transparent;/
  );
  assert.match(
    css,
    /\.robotics-theme-page \[data-robotics-hero-image\][^{]*\{[^}]*object-position:\s*60%\s+center;/
  );
  assert.match(
    css,
    /\.robotics-theme-page \[data-robotics-hero-brand\][^{]*\{[^}]*width:\s*48%;[^}]*max-width:\s*13rem;/
  );
});

test("robotics specification values use the finer mono treatment", async () => {
  const page = await readWorkspaceFile("app/agentech-robotic/page.tsx");

  assert.match(page, /data-robotics-spec-value/);
  assert.match(
    page,
    /data-robotics-spec-value[^>]*className=\{`[^`]*text-xs[^`]*font-normal[^`]*tracking-\[0\.08em\]/
  );
});

test("robot product images use the same softened corner radius as the specification panel", async () => {
  const page = await readWorkspaceFile("app/agentech-robotic/page.tsx");

  assert.match(page, /data-robotics-product-image/);
  assert.match(
    page,
    /data-robotics-product-image[^>]*className="[^"]*rounded-lg[^"]*"/
  );
});

test("robotics runtime level cards match the specification panel corner radius", async () => {
  const page = await readWorkspaceFile("app/agentech-robotic/page.tsx");

  assert.match(
    page,
    /data-robotics-runtime-level[^>]*className="[^"]*rounded-lg[^"]*"/
  );
});

test("the light Navi feature card keeps black copy while leaving the artwork visible", async () => {
  const [tabs, css] = await Promise.all([
    readWorkspaceFile("components/education-program-tabs.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  for (const hook of [
    "data-education-navi-card",
    "data-education-navi-media",
    "data-education-navi-overlay",
    "data-education-navi-kicker",
    "data-education-navi-title"
  ]) {
    assert.match(tabs, new RegExp(hook));
  }

  assert.match(
    css,
    /:root\[data-theme="light"\] \.education-eaic-page \[data-education-navi-card\][^{]*\{[^}]*background:\s*#ffffff\s*!important;/
  );
  assert.match(
    css,
    /:root\[data-theme="light"\] \.education-eaic-page \[data-education-navi-title\][^{]*\{[^}]*color:\s*#111111\s*!important;/
  );
  assert.match(
    css,
    /:root\[data-theme="light"\] \.education-eaic-page \[data-education-navi-media\][^{]*\{[^}]*opacity:\s*0\.96\s*!important;/
  );
  assert.match(
    css,
    /:root\[data-theme="light"\] \.education-eaic-page \[data-education-navi-overlay\][^{]*\{[^}]*linear-gradient\(\s*90deg,\s*#ffffff\s+0%,\s*#ffffff\s+42%[^}]*rgba\(255, 255, 255, 0\.08\)\s+100%/
  );
});

test("the high-school program logo becomes black only in the light theme", async () => {
  const [tabs, css] = await Promise.all([
    readWorkspaceFile("components/education-program-tabs.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(tabs, /data-education-program-logo/);
  assert.match(css, /:root\[data-theme="light"\] \.education-eaic-page \[data-education-program-logo\]/);
  assert.match(css, /filter:\s*brightness\(0\)/);
});

test("the light theme keeps the global navigation solid and crisp", async () => {
  const [header, css] = await Promise.all([
    readWorkspaceFile("components/site-header.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(header, /data-site-header/);
  assert.match(
    css,
    /:root\[data-theme="light"\] \[data-site-header\][^{]*\{[^}]*background:\s*#050505\s*!important;[^}]*backdrop-filter:\s*none\s*!important;/
  );
  assert.match(
    css,
    /:root\[data-theme="light"\] \[data-site-header\] \.agent-nav-wordmark[^{]*\{[^}]*color:\s*#f3f4f6;/
  );
  assert.match(
    css,
    /:root\[data-theme="light"\] \[data-site-header\] \.agent-nav-wordmark\.is-active[^{]*[\s\S]*?text-shadow:\s*none;/
  );
});

test("EAIC light humanoid compensates for its larger subject without resizing the dark reference", async () => {
  const css = await readWorkspaceFile("app/globals.css");
  const lightRule = css.match(/\.eaic-engineering-theme \[data-eaic-hero-theme="light"\]\s*\{([^}]+)\}/)?.[1] ?? "";
  const darkRule = css.match(/\.eaic-engineering-theme \[data-eaic-hero-theme="dark"\]\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(lightRule, /transform:\s*translate\(-0\.5%, -0\.5%\) scale\(0\.955\);/);
  assert.match(lightRule, /transform-origin:\s*center;/);
  assert.doesNotMatch(darkRule, /(?:transform|scale):/, "dark is the unchanged size reference");
});

test("EAIC workflow SDK accent stays as vivid and readable as the other dark steps", async () => {
  const { workflowAccentPalette, contrastRatio } = await import("./eaic-workflow-palette.ts");
  const sdkAccent = workflowAccentPalette[1].dark;
  const peerAccents = workflowAccentPalette.filter((_, index) => index !== 1).map(({ dark }) => dark);
  const channelSpread = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map((channel) => Number.parseInt(channel, 16));
    return Math.max(...channels) - Math.min(...channels);
  };

  // Keep the blue accent in the existing steps' intensity range, not washed out or overpowering.
  const peerSpreads = peerAccents.map(channelSpread);
  assert.ok(channelSpread(sdkAccent) >= Math.min(...peerSpreads), "Step 02 must not look grayer than every peer");
  assert.ok(channelSpread(sdkAccent) <= Math.max(...peerSpreads), "Step 02 must not overpower the other accents");

  const peerContrast = peerAccents.map((color) => contrastRatio(color, "#050b10"));
  const sdkContrast = contrastRatio(sdkAccent, "#050b10");
  assert.ok(sdkContrast >= Math.min(...peerContrast), "Step 02 must not be dimmer than every peer");
  assert.ok(sdkContrast <= Math.max(...peerContrast), "Step 02 must stay within the existing brightness range");
});

test("EAIC workflow connector arrowheads stay white without recoloring the step lines", async () => {
  const [home, css] = await Promise.all([
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-home.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(home, /data-workflow-arrow\s+className="[^"]*border-b-2 border-r-2"/);
  assert.match(
    css,
    /\.eaic-engineering-theme \[data-workflow-arrow\]\s*\{[^}]*border-color:\s*#ffffff;/
  );
  assert.match(home, /data-workflow-accent-background className="absolute top-0 h-10 w-px"/);
  assert.match(
    css,
    /\.eaic-engineering-theme \[data-workflow-accent-background\]\s*\{[^}]*background-color:\s*var\(--workflow-accent\);/
  );
});

test("EAIC workflow light accents keep their hues while meeting AA contrast on white", async () => {
  const [paletteModule, css] = await Promise.all([
    import("./eaic-workflow-palette.ts").catch(() => null),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.ok(paletteModule, "EAIC workflow palette must be available");
  assert.deepEqual(
    paletteModule.workflowAccentPalette.map(({ light }) => light),
    ["#007d6f", "#365f91", "#c85016", "#6f42c1"]
  );

  for (const { light } of paletteModule.workflowAccentPalette) {
    assert.ok(paletteModule.contrastRatio(light, "#ffffff") >= 4.5, `${light} must remain readable on white`);
  }

  assert.match(
    css,
    /:root\[data-theme="light"\] \.eaic-engineering-theme \[data-workflow-accent-box\][^{]*\{[^}]*border-color:\s*var\(--workflow-accent\);/
  );
});

test("the EAIC developer access gate uses the task canvas, card and readable actions", async () => {
  const gate = await readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-access-gate.tsx");
  assert.ok(gate.includes("eaic-task-theme") && gate.includes("bg-[#f5f4f1]"), "the gate must use the theme-aware task canvas");
  assert.ok(gate.includes("<EaicTaskCard>"), "all gate states must share the View SDK card");
  assert.ok(gate.includes("var(--color-title)") && gate.includes("var(--color-canvas)"), "gate actions must invert with the selected theme");
  assert.ok(!gate.includes("body:has("), "the gate should style its own surface");
});

test("EAIC label colors follow their rendered backgrounds", async () => {
  const [css, landing, guide, workbench, home] = await Promise.all([
    readWorkspaceFile("app/globals.css"),
    readWorkspaceFile("app/agentech-products/eaic/eaic-public.css"),
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/master-joint-motion-guide.tsx"),
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx"),
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-home.tsx"),
  ]);
  assert.ok(/\.eaic-public-hero-note\s*\{[^}]*color:\s*var\(--eaic-muted\)/.test(landing), "landing hero note must track the theme");
  assert.ok(css.includes(':root[data-theme="light"] .eaic-task-theme [class~="text-[#1a73e8]"]'), "task labels need a readable blue on warm or tinted surfaces");
  assert.ok(/:root\[data-theme="light"\] \.eaic-engineering-theme \[class\*="text-\[#80d8f4\]"\]\s*\{\s*color: var\(--color-accent-strong\)/.test(css), "Hub labels must use the stronger blue");
  assert.ok(css.includes("color-mix(in srgb, var(--workflow-accent) 90%, #111111)"), "workflow text must stay readable over accent-tinted and warm backgrounds");
  assert.ok(css.includes(':root[data-theme="light"] .eaic-task-theme [data-code-review-locked-badge]'), "the locked badge must use a readable light-theme foreground");
  assert.ok(home.includes("text-[color:var(--color-text-muted)]"), "small Hub footer text must follow the site palette");
  assert.ok(guide.includes("text-[color:var(--color-text-muted)]"), "motion guide captions must track both themes");
  assert.ok(workbench.includes("text-[color:var(--color-warning)]"), "the safety heading needs a theme-aware warning color");
});

test("saved certification results pair success, warning and failure ink with dark surfaces", async () => {
  const [css, workbench] = await Promise.all([
    readWorkspaceFile("app/globals.css"),
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx"),
  ]);
  assert.equal((workbench.match(/<section data-code-review-surface/g) ?? []).length, 2,
    "the review stages and the restored checklist must share the state palette");
  for (const color of ["bg-[#e8f7f3]", "bg-[#fff1f1]", "bg-[#fff8df]", "text-[#006a5c]", "text-[#a51f1f]", "text-[#8f1f1f]", "text-[#9a6700]"]) {
    assert.ok(css.includes(`:root[data-theme="dark"] [data-code-review-surface] [class~="${color}"]`), `dark review palette must translate ${color}`);
  }
});

test("page-level actions and navigation interactions share a twelve-pixel radius", async () => {
  const [home, educationTabs, talents, header, css] = await Promise.all([
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-home.tsx"),
    readWorkspaceFile("components/education-program-tabs.tsx"),
    readWorkspaceFile("app/talents/page.tsx"),
    readWorkspaceFile("components/site-header.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(home, /data-eaic-primary-action[^>]*[\s\S]*?rounded-xl/);
  assert.match(home, /data-eaic-secondary-action[^>]*[\s\S]*?rounded-xl/);
  assert.match(header, /agent-nav-link rounded-xl/);
  assert.doesNotMatch(css, /\.agent-nav-link\s*\{[^}]*border-radius:\s*999px;/);
  assert.match(educationTabs, /data-theme-primary-action[^>]*[\s\S]*?rounded-xl/);
  assert.match(talents, /data-theme-primary-action[^>]*[\s\S]*?rounded-xl/g);
  assert.match(talents, /data-theme-secondary-action[^>]*[\s\S]*?rounded-xl/);
  assert.match(talents, /data-page-cta[^>]*[\s\S]*?rounded-xl/);
});

test("all K-8 grade landing pages expose a complete dark theme scope", async () => {
  const [gradePage, css] = await Promise.all([
    readWorkspaceFile("app/agentech-education/[grade]/page.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(gradePage, /education-grade-theme/);
  assert.match(css, /:root\[data-theme="dark"\] \.education-grade-theme/);
  assert.match(css, /\.education-grade-theme \[data-course-card\]/);
});

test("the Future Founder immersion page exposes a complete dark theme scope", async () => {
  const [page, css] = await Promise.all([
    readWorkspaceFile("components/eai-immersion-landing-page.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(page, /data-ff-theme-page/);
  assert.match(page, /ff-hero/);
  assert.match(css, /:root\[data-theme="dark"\] \.ff-immersion/);
  assert.match(css, /\.ff-immersion > section:not\(\.ff-hero\)/);
  assert.match(css, /\.ff-immersion \[class\*="bg-\[#fbfaf7\]"\]/);
});

test("the Navi learning page exposes a complete page-scoped dark palette", async () => {
  const [page, css] = await Promise.all([
    readWorkspaceFile("components/navi-learning-page.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(page, /data-navi-theme-page/);
  assert.match(page, /data-navi-intro-title/);
  assert.match(page, /data-navi-intro-body/);
  assert.match(page, /data-navi-feature-card/);
  assert.match(
    css,
    /:root\[data-theme="dark"\] \[data-navi-theme-page\][^{]*\{[^}]*background:[^}]*#07111f[^}]*color:\s*#e8eef6;/
  );
  assert.match(
    css,
    /:root\[data-theme="dark"\] \[data-navi-theme-page\] \[data-navi-intro-title\][^{]*\{[^}]*color:\s*#f4f7fb\s*!important;/
  );
  assert.match(
    css,
    /:root\[data-theme="dark"\] \[data-navi-theme-page\] \[data-navi-feature-card\][^{]*\{[^}]*background:\s*#111c2d\s*!important;/
  );
});

test("the light Navi hero dots use a scoped green while the dark fallback stays lime", async () => {
  const css = await readWorkspaceFile("app/globals.css");

  assert.match(
    css,
    /:root\[data-theme="light"\] \[data-navi-theme-page\] \[data-navi-hero-chip\]::before\s*\{[^}]*background:\s*#4d7c0f;/
  );
  assert.match(
    css,
    /\.navi-hero-chip::before\s*\{[^}]*background:\s*#d9ff79;/
  );
});
