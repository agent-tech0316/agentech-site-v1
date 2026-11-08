import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const workspaceRoot = new URL("../", import.meta.url);

async function readWorkspaceFile(path: string) {
  return readFile(new URL(path, workspaceRoot), "utf8");
}

test("maps Display, Technical, and Interface to one intentional font each", async () => {
  const [layout, css] = await Promise.all([
    readWorkspaceFile("app/layout.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.doesNotMatch(layout, /manropeDisplay/);
  assert.match(css, /--font-display:\s*var\(--font-brand\)/);
  assert.match(css, /\.font-display\s*\{[^}]*font-family:\s*var\(--font-display\)/);
  assert.match(css, /\.font-technical\s*\{[^}]*font-family:\s*var\(--font-mono\)/);
  assert.match(css, /\.font-interface\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  assert.doesNotMatch(css, /\.font-mono:not\([^}]*var\(--font-sans\)/);
});

test("keeps landing-page roots on the Interface face instead of Technical", async () => {
  const [education, talents, platform, css] = await Promise.all([
    readWorkspaceFile("app/agentech-education/page.tsx"),
    readWorkspaceFile("app/talents/page.tsx"),
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-home.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  for (const page of [education, talents, platform]) {
    assert.doesNotMatch(page, /style=\{\{\s*fontFamily:\s*"var\(--font-mono\)"\s*\}\}/);
  }

  assert.doesNotMatch(css, /\.education-eaic-page\s*\{[^}]*font-family:\s*var\(--font-mono\)/);
});

test("assigns the primary navigation to Interface", async () => {
  const css = await readWorkspaceFile("app/globals.css");

  assert.match(
    css,
    /\.agent-nav-wordmark\s*\{[\s\S]*?font-family:\s*var\(--font-sans\)/
  );
});

test("matches desktop navigation labels to the robotics interface-caption rhythm", async () => {
  const css = postcss.parse(await readWorkspaceFile("app/globals.css"));
  const declarations: Record<string, string> = {};

  css.walkRules((rule) => {
    if (!rule.selectors.includes(".agent-nav-wordmark")) return;
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });

  assert.deepEqual(
    {
      family: declarations["font-family"],
      size: declarations["font-size"],
      weight: declarations["font-weight"],
      tracking: declarations["letter-spacing"],
      transform: declarations["text-transform"]
    },
    {
      family: "var(--font-sans)",
      size: "0.75rem",
      weight: "600",
      tracking: "0.34em",
      transform: "uppercase"
    }
  );
});

test("keeps the expanded navigation and drawer on opposite sides of the 1280px breakpoint", async () => {
  const header = await readWorkspaceFile("components/site-header.tsx");

  assert.match(header, /data-mobile-theme-controls[^>]*className="[^"]*xl:hidden"/);
  assert.match(header, /className="grid[^"]*xl:hidden"/);
  assert.match(header, /<nav className=\{`[^`]*xl:flex/);
  assert.match(header, /w-\[140px\][^"]*xl:flex/);
  assert.equal((header.match(/xl:hidden/g) ?? []).length, 4);
  assert.doesNotMatch(header, /\b(?:md|lg):(?:flex|hidden)\b/);
});

test("keeps mobile navigation readable without changing the approved type family or weight", async () => {
  const css = postcss.parse(await readWorkspaceFile("app/globals.css"));
  const declarations: Record<string, string> = {};

  css.walkRules((rule) => {
    if (!rule.selectors.includes(".agent-nav-wordmark.is-mobile")) return;
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });

  assert.equal(declarations["font-size"], "1.125rem");
  assert.equal(declarations["font-family"], undefined);
  assert.equal(declarations["font-weight"], undefined);
  assert.equal(declarations["letter-spacing"], undefined);
});

test("assigns core landing-page titles and numerical identifiers by responsibility", async () => {
  const [education, talents, robotics, platform] = await Promise.all([
    readWorkspaceFile("app/agentech-education/page.tsx"),
    readWorkspaceFile("app/talents/page.tsx"),
    readWorkspaceFile("app/agentech-robotic/page.tsx"),
    readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/agentech-library-home.tsx")
  ]);

  assert.match(education, /data-education-enrollment-count[^>]*className="[^"]*font-technical/);
  assert.match(talents, /data-talents-title[^>]*className="[^"]*font-display/);
  assert.match(talents, /data-talents-pathway-number[^>]*className="[^"]*font-technical/);
  assert.match(robotics, /data-robotics-product-price[^>]*className="[^"]*font-technical/);
  assert.match(robotics, /data-robotics-runtime-copy[^>]*className="[^"]*font-interface/);
  assert.match(platform, /data-eaic-hub-word[^>]*className="[^"]*font-display/);
  assert.match(platform, /data-eaic-step-number[^>]*className="[^"]*font-technical/);
});

test("assigns robotics runtime hierarchy levels to Technical", async () => {
  const robotics = await readWorkspaceFile("app/agentech-robotic/page.tsx");

  assert.match(
    robotics,
    /data-robotics-runtime-level[^>]*className="[^"]*font-technical/
  );
  assert.doesNotMatch(
    robotics,
    /data-robotics-runtime-level[^>]*className="[^"]*font-interface/
  );
});

test("shared public-facing title components use Display", async () => {
  const components = await Promise.all([
    readWorkspaceFile("components/page-hero.tsx"),
    readWorkspaceFile("components/section-heading.tsx"),
    readWorkspaceFile("components/product-showcase-card.tsx"),
    readWorkspaceFile("components/news-article-content.tsx")
  ]);

  for (const component of components) {
    assert.match(component, /font-display/);
  }

  const [placeholder, comingSoonRobot] = await Promise.all([
    readWorkspaceFile("components/placeholder-page.tsx"),
    readWorkspaceFile("components/coming-soon-robot.tsx")
  ]);

  assert.match(placeholder, /<ComingSoonRobot/);
  assert.match(comingSoonRobot, /font-display/);
});

test("keeps EAIC interface controls in Interface while preserving technical values", async () => {
  const workbench = await readWorkspaceFile(
    "features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx"
  );

  const header = await readWorkspaceFile("features/eaic/01-clients/eaic-hub/components/eaic-task-header.tsx");
  assert.match(header, /font-interface[^>]*>\{eyebrow\}<\/p>[\s\S]{0,180}<h1 className="[^"]*font-display/);
  assert.match(header, /font-mono[^>]*>[\s\S]*?item\.number/);
  assert.doesNotMatch(workbench, /font-mono[^>]*>View functions/);
  assert.doesNotMatch(workbench, /font-mono[^>]*>Hide functions/);
  assert.doesNotMatch(workbench, /font-mono[^>]*>details<\/span>/);
});

test("uses Technical for prominent measurements and countdown values", async () => {
  const [immersion, css] = await Promise.all([
    readWorkspaceFile("components/eai-immersion-landing-page.tsx"),
    readWorkspaceFile("app/globals.css")
  ]);

  assert.match(immersion, /font-technical[^>]*>\{text\.countdownNumber\}/);
  assert.match(css, /\.navi-growth-stats strong\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  assert.match(css, /\.navi-growth-stats span\s*\{[^}]*font-family:\s*var\(--font-mono\)/);
});

test("assigns AI Robotics Club metadata and application progress to Technical 500", async () => {
  const experience = await readWorkspaceFile("components/ai-robotics-club-experience.tsx");

  for (const hook of [
    "data-club-fact-label",
    "data-club-fact-value",
    "data-club-application-progress",
    "data-club-grade-option"
  ]) {
    assert.match(
      experience,
      new RegExp(`${hook}[^>]*className="[^"]*font-technical[^"]*font-medium`)
    );
  }
});

test("keeps the AI Robotics Club application heading in Interface", async () => {
  const experience = await readWorkspaceFile("components/ai-robotics-club-experience.tsx");

  assert.match(
    experience,
    /data-club-application-title[^>]*className="[^"]*font-interface[^"]*font-bold/
  );
  assert.doesNotMatch(
    experience,
    /data-club-application-title[^>]*className="[^"]*font-display/
  );
});

test("keeps the AI Robotics Club hero in Display with restrained tracking", async () => {
  const page = await readWorkspaceFile("app/ai-robotics-club/page.tsx");

  assert.match(
    page,
    /data-club-hero-title[^>]*className="[^"]*font-display[^"]*tracking-\[0\.05em\]/
  );
  assert.doesNotMatch(
    page,
    /data-club-hero-title[^>]*className="[^"]*tracking-\[0\.1em\]/
  );
});
