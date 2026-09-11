import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import * as eaisShowcase from "./eais-showcase.ts";

const { prototypeWorks, workCategories } = eaisShowcase;

const workspaceRoot = new URL("../", import.meta.url);
const readWorkspaceFile = (path: string) => readFile(new URL(path, workspaceRoot), "utf8");

test("EAIS prototype works are image-led concept records with an outcome and a short process", () => {
  assert.deepEqual(workCategories, [
    "for-you", "trending", "humanoids", "robot-arms", "mobile-robots", "quadrupeds", "drones", "education", "simulation"
  ]);
  assert.ok(prototypeWorks.length >= 8 && prototypeWorks.length <= 12);

  for (const work of prototypeWorks) {
    assert.equal(work.isPreview, true);
    assert.ok(work.title.length > 0);
    assert.ok(work.summary.length > 0);
    assert.ok(work.outcome.length > 0);
    assert.ok(work.image.startsWith("/assets/"));
    assert.ok(work.imageAlt.length > 0);
    assert.equal(work.process.length, 3);
    assert.ok(work.process.every((step) => step.length > 0));
    assert.ok(workCategories.includes(work.category));
  }

  const sortingArm = prototypeWorks.find((work) => work.slug === "prototype-sort-at-sight");
  assert.equal(sortingArm?.category, "robot-arms");
  assert.equal(sortingArm?.image, "/assets/eais-showcase/sort-at-sight-concept-v1.png");
  assert.match(sortingArm?.imageAlt ?? "", /robotic arm/i);
});

test("EAIS pagination keeps every real work, moves featured works first, and preserves stable order", () => {
  assert.equal(typeof eaisShowcase.orderEaisWorksFeaturedFirst, "function");
  assert.equal(typeof eaisShowcase.paginateEaisWorks, "function");
  const fixture = [
    { id: "regular-a", isFeatured: false },
    { id: "featured-a", isFeatured: true },
    { id: "regular-b", isFeatured: false },
    { id: "featured-b", isFeatured: true },
    { id: "regular-c", isFeatured: false },
    { id: "regular-d", isFeatured: false },
    { id: "regular-e", isFeatured: false }
  ];
  const ordered = eaisShowcase.orderEaisWorksFeaturedFirst(fixture);
  assert.deepEqual(ordered.map((work) => work.id), [
    "featured-a", "featured-b", "regular-a", "regular-b", "regular-c", "regular-d", "regular-e"
  ]);
  assert.deepEqual(fixture.map((work) => work.id), [
    "regular-a", "featured-a", "regular-b", "featured-b", "regular-c", "regular-d", "regular-e"
  ], "ordering must not mutate the source records");

  const secondPage = eaisShowcase.paginateEaisWorks(ordered, 2, 3);
  assert.deepEqual(secondPage.items.map((work) => work.id), ["regular-b", "regular-c", "regular-d"]);
  assert.deepEqual({
    currentPage: secondPage.currentPage,
    totalPages: secondPage.totalPages,
    totalItems: secondPage.totalItems,
    start: secondPage.start,
    end: secondPage.end
  }, { currentPage: 2, totalPages: 3, totalItems: 7, start: 4, end: 6 });
});

test("EAIS pagination reports honest empty ranges and keeps hundreds of pages compact", () => {
  assert.equal(typeof eaisShowcase.getEaisPaginationTokens, "function");
  const empty = eaisShowcase.paginateEaisWorks([], 9, 3);
  assert.deepEqual(empty, { items: [], currentPage: 1, totalPages: 0, totalItems: 0, start: 0, end: 0 });

  const fixture = Array.from({ length: 407 }, (_, index) => ({ id: index + 1 }));
  const page = eaisShowcase.paginateEaisWorks(fixture, 68, 3);
  assert.deepEqual({ totalItems: page.totalItems, totalPages: page.totalPages, start: page.start, end: page.end }, {
    totalItems: 407, totalPages: 136, start: 202, end: 204
  });
  assert.deepEqual(eaisShowcase.getEaisPaginationTokens(page.currentPage, page.totalPages), [
    1, "ellipsis", 67, 68, 69, "ellipsis", 136
  ]);
});

test("EAIS provides discoverable local work details without app-store, account, or execution destinations", async () => {
  const [route, page] = await Promise.all([
    readWorkspaceFile("app/agentech-products/eais/page.tsx"),
    readWorkspaceFile("components/eais-showcase.tsx")
  ]);

  assert.match(route, /EaisShowcase/);
  for (const hook of [
    "data-eais-public-page",
    "data-eais-search",
    "data-eais-category-tabs",
    "data-eais-featured-work",
    "data-eais-work-grid",
    "data-eais-work-dialog",
    "data-eais-process"
  ]) assert.match(page, new RegExp(hook));

  assert.match(page, /CONCEPT PREVIEW/);
  assert.match(page, /setSelectedWork/);
  assert.match(page, /<dialog/);
  assert.match(page, /showModal\(\)/);
  assert.match(page, /onClose=/);
  assert.match(page, /data-eais-work-team/);
  assert.match(page, /NAVI STORE is for ready-to-use robot apps, games, and skills/i);
  assert.doesNotMatch(page, /role="dialog"|aria-modal="true"/);
  assert.doesNotMatch(page, /href="\/(login|account|agentech-products\/eaic-hub)|mailto:|window\.open/i);
});

test("EAIS list and project metadata override the inherited root URL while preserving Open Graph fields", async () => {
  const [route, projectRoute] = await Promise.all([
    readWorkspaceFile("app/agentech-products/eais/page.tsx"),
    readWorkspaceFile("app/agentech-products/eais/projects/[slug]/page.tsx")
  ]);

  assert.match(route, /alternates:\s*\{\s*canonical:\s*"\/agentech-products\/eais"\s*\}/);
  assert.match(route, /openGraph:\s*\{[\s\S]*?url:\s*"\/agentech-products\/eais"/);
  for (const field of ["title", "description", "siteName", "type"]) {
    assert.match(route, new RegExp(`${field}:`), `EAIS Open Graph metadata must keep ${field}`);
  }

  assert.match(projectRoute, /ResolvingMetadata/);
  assert.match(projectRoute, /canonical\s*=\s*`\/agentech-products\/eais\/projects\/\$\{slug\}`/);
  assert.match(projectRoute, /alternates:\s*\{\s*canonical\s*\}/);
  assert.match(projectRoute, /openGraph:\s*\{[\s\S]*?\.\.\.inherited\.openGraph[\s\S]*?url:\s*canonical/);
});

test("EAIS keeps visual styling page-scoped and touch-friendly across light, dark, and phone layouts", async () => {
  const css = await readWorkspaceFile("app/agentech-products/eais/eais-showcase.module.css");
  const rules = postcss.parse(css);
  const selectors = new Set<string>();
  rules.walkRules((rule) => rule.selectors.forEach((selector) => selectors.add(selector)));

  assert.ok(selectors.has(".page"));
  assert.ok(selectors.has(".page .primaryAction"), "primary-action contrast must override the generic page link color");
  assert.ok(selectors.has(':global(:root[data-theme="light"]) .page'));
  assert.ok(selectors.has(':global(:root[data-theme="dark"]) .page'));
  assert.match(css, /#f5f4f1/i);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height:\s*44px/);
});

test("EAIS discovery and quick previews stay public while the full project route requires the shared account session", async () => {
  const [showcase, route, detail, authForm, loginBypass] = await Promise.all([
    readWorkspaceFile("components/eais-showcase.tsx"),
    readWorkspaceFile("app/agentech-products/eais/projects/[slug]/page.tsx").catch(() => ""),
    readWorkspaceFile("components/eais-project-detail.tsx").catch(() => ""),
    readWorkspaceFile("components/universal-auth-form.tsx"),
    readWorkspaceFile("lib/local-auth-bypass.ts")
  ]);

  assert.match(showcase, /href=\{`\/agentech-products\/eais\/projects\/\$\{selectedWork\.slug\}`\}/);
  assert.match(showcase, /<dialog/);
  assert.doesNotMatch(showcase, /getAccountSession|\/login\?next=/);
  assert.match(route, /findEaisProject/);
  assert.match(route, /notFound\(\)/);
  assert.match(route, /generateStaticParams/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /getServerAccountIdentity\(undefined, \{ allowLegacyCookie: false \}\)/);
  assert.match(route, /redirect\(buildLoginPath\(projectPath\)\)/);
  assert.match(authForm, /resolveAuthReturnPath\(searchParams\.get\("next"\), ""\)/);
  assert.match(loginBypass, /isProtectedAuthDestination\(destination\)/);
  for (const section of ["data-eais-project-page", "data-eais-project-build", "data-eais-project-evidence", "data-eais-project-resources", "data-eais-project-demo"]) {
    assert.match(detail, new RegExp(section));
  }
  assert.match(detail, /HistoryBackButton/);
  assert.match(detail, /href="\/agentech-products\/eaic-hub\/view-sdk"/);
  assert.match(detail, /profile required/i);
});

test("EAIS uses the shared blue-gray Agentech interface palette instead of a lime or pill-led visual system", async () => {
  const css = await readWorkspaceFile("app/agentech-products/eais/eais-showcase.module.css");

  assert.match(css, /--canvas:\s*#080d14/i);
  assert.match(css, /--surface:\s*#101b29/i);
  assert.match(css, /--accent:\s*#91dfff/i);
  assert.match(css, /--ink:\s*#111/i);
  assert.doesNotMatch(css, /#d8fd65|#b9eb3f|#d8fd|#b9eb/i);
  assert.match(css, /\.categoryTab, \.activeTab[\s\S]*?border-radius:\s*12px/);
  assert.match(css, /\.eyebrow[\s\S]*?font-family:\s*var\(--font-sans\)/);
  assert.match(css, /\.heroFeatureCopy[\s\S]*?color:\s*#fff/);
});

test("the EAIS detail back control overrides the shared important pill radius within its own page", async () => {
  const css = await readWorkspaceFile("app/agentech-products/eais/eais-project-detail.module.css");
  let scopedRadius = "";
  let overridesSharedRadius = false;
  postcss.parse(css).walkRules(".detailPage .backButton", (rule) => {
    rule.walkDecls("border-radius", (declaration) => {
      scopedRadius = declaration.value;
      overridesSharedRadius = Boolean(declaration.important);
    });
  });
  assert.equal(scopedRadius, "12px");
  assert.equal(overridesSharedRadius, true, "the shared HistoryBackButton radius is important and must be overridden locally");
});

test("The Gesture Lab detail preserves the full robot in its wide cover at every viewport", async () => {
  const [detail, css] = await Promise.all([
    readWorkspaceFile("components/eais-project-detail.tsx"),
    readWorkspaceFile("app/agentech-products/eais/eais-project-detail.module.css")
  ]);
  assert.match(detail, /data-eais-cover-framing=\{work\.slug === "prototype-gesture-lab" \? "full-body" : undefined\}/);

  const declarations = new Map<string, string>();
  postcss.parse(css).walkRules('.coverImage[data-eais-cover-framing="full-body"] img', (rule) => {
    assert.equal(rule.parent?.type, "root", "the complete robot must also be visible outside phone layouts");
    rule.walkDecls((declaration) => { declarations.set(declaration.prop, declaration.value); });
  });
  assert.equal(declarations.get("object-fit"), "contain", "cover cropping loses the robot's head and feet");
  assert.equal(declarations.get("object-position"), "center");
});

test("The Gesture Lab keeps the full robot in the unified work list and its quick preview", async () => {
  const [showcase, css] = await Promise.all([
    readWorkspaceFile("components/eais-showcase.tsx"),
    readWorkspaceFile("app/agentech-products/eais/eais-showcase.module.css")
  ]);
  assert.equal((showcase.match(/data-eais-cover-framing=\{work\.slug === "prototype-gesture-lab" \? "full-body" : undefined\}/g) ?? []).length, 1);
  assert.match(showcase, /data-eais-cover-framing=\{selectedWork\.slug === "prototype-gesture-lab" \? "full-body" : undefined\}/);
  const declarations = new Map<string, string>();
  postcss.parse(css).walkRules('.page [data-eais-cover-framing="full-body"] img', (rule) => {
    assert.equal(rule.parent?.type, "root");
    rule.walkDecls((declaration) => { declarations.set(declaration.prop, declaration.value); });
  });
  assert.equal(declarations.get("object-fit"), "contain", "portrait covers must show the robot's head, hands, and feet");
  assert.equal(declarations.get("transform"), "none", "hover zoom must not enlarge the portrait out of its frame");
});

test("EAIS quick previews stay inside the viewport after opening from a scrolled card", async () => {
  const css = postcss.parse(await readWorkspaceFile("app/agentech-products/eais/eais-showcase.module.css"));
  const desktop = new Map<string, string[]>();
  const phone = new Map<string, string[]>();
  css.walkRules(".dialog", (rule) => {
    const declarations = rule.parent?.type === "root" ? desktop : phone;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, [...(declarations.get(declaration.prop) ?? []), declaration.value]);
    });
  });
  assert.deepEqual(desktop.get("position"), ["fixed"], "relative top-layer dialogs compute to absolute and scroll off screen");
  assert.deepEqual(desktop.get("inset"), ["0"]);
  assert.deepEqual(desktop.get("margin"), ["auto"]);
  assert.deepEqual(desktop.get("max-height"), ["min(760px, calc(100vh - 48px))", "min(760px, calc(100dvh - 48px))"]);
  assert.deepEqual(phone.get("inset"), ["auto 0 0"]);
  assert.deepEqual(phone.get("margin"), ["0"]);
  assert.deepEqual(phone.get("max-height"), ["92vh", "92dvh"]);
});
