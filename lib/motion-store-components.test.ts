import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss, { type AtRule, type Rule } from "postcss";

const workspaceRoot = new URL("../", import.meta.url);

async function readWorkspaceFile(path: string) {
  return readFile(new URL(path, workspaceRoot), "utf8").catch(() => "");
}

function declarations(css: string, selector: string, media?: string) {
  const values: Record<string, string> = {};
  postcss.parse(css).walkRules((rule: Rule) => {
    const parentMedia = rule.parent?.type === "atrule" && (rule.parent as AtRule).name === "media"
      ? (rule.parent as AtRule).params
      : undefined;
    if (rule.selectors.includes(selector) && parentMedia === media) {
      rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
    }
  });
  return values;
}

test("motion cards expose product content and a replaceable preview boundary", async () => {
  const [card, preview] = await Promise.all([
    readWorkspaceFile("components/motion-store/motion-card.tsx"),
    readWorkspaceFile("components/motion-store/motion-preview.tsx")
  ]);

  assert.match(card, /data-motion-card/);
  assert.match(card, /data-motion-card-variant=\{variant\}/);
  assert.match(card, /<button[\s\S]*View Motion/);
  for (const field of ["motion.name", "motion.category", "motion.description", "motion.status"]) {
    assert.match(card, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(card, /onView\(motion, event\.currentTarget\)/);
  assert.match(preview, /data-motion-preview/);
  assert.match(preview, /data-motion-preview-fallback/);
  assert.match(preview, /<svg/);
  assert.match(preview, /preview\.type === "placeholder"/);
  assert.match(preview, /import Image from "next\/image"/);
  assert.doesNotMatch(preview, /<img\b/);
});

test("motion cards keep previews dominant with restrained accessible interaction", async () => {
  const css = await readWorkspaceFile("components/motion-store/motion-store.module.css");
  assert.equal(declarations(css, ".featuredPreview")["aspect-ratio"], "16 / 10");
  assert.equal(declarations(css, ".catalogPreview")["aspect-ratio"], "4 / 3");
  assert.equal(declarations(css, ".card:hover .previewInner").transform, "scale(1.025)");
  assert.equal(declarations(css, ".card:hover .cardArrow").transform, "translateX(4px)");
  assert.match(declarations(css, ".viewButton:focus-visible").outline ?? "", /2px/);

  const reduced = declarations(css, ".previewInner", "(prefers-reduced-motion: reduce)");
  assert.equal(reduced.transition, "none");
});

test("motion store rails and grid adapt without creating page overflow", async () => {
  const css = await readWorkspaceFile("components/motion-store/motion-store.module.css");
  assert.equal(declarations(css, ".store")["overflow-x"], "clip");
  assert.equal(declarations(css, ".featuredRail")["overflow-x"], "auto");
  assert.equal(declarations(css, ".categoryRail")["overflow-x"], "auto");
  assert.equal(declarations(css, ".catalogGrid")["grid-template-columns"], "repeat(3, minmax(0, 1fr))");
  assert.equal(
    declarations(css, ".catalogGrid", "(max-width: 1023px)")["grid-template-columns"],
    "repeat(2, minmax(0, 1fr))"
  );
  assert.equal(declarations(css, ".catalogGrid", "(max-width: 767px)")["grid-template-columns"], "1fr");
  assert.equal(declarations(css, ".viewButton")["min-height"], "44px");
  assert.equal(declarations(css, ".modal").overflow, "auto");
  assert.equal(
    declarations(css, ".categoryRail", "(max-width: 767px)")["padding-bottom"],
    "max(4px, env(safe-area-inset-bottom))"
  );
});

test("Motion Store reuses EAIS foundations and stays dark under the site light preference", async () => {
  const [store, css, reference] = await Promise.all([
    readWorkspaceFile("components/motion-store/motion-store.tsx"),
    readWorkspaceFile("components/motion-store/motion-store.module.css"),
    readWorkspaceFile("app/agentech-products/eais/eais-showcase.module.css")
  ]);

  assert.match(store, /referenceStyles\.topBar/);
  assert.match(store, /referenceStyles\.searchShell/);
  assert.match(store, /referenceStyles\.content/);
  assert.match(store, /ROBOT MOTION LIBRARY/);
  assert.match(store, /02 \/ LIBRARY/);
  assert.match(declarations(css, ".store").composes, /^darkPalette from /);
  assert.equal(declarations(reference, ".darkPalette")["--canvas"], "#080d14");
  assert.equal(declarations(reference, ".darkPalette")["--surface"], "#101b29");
  assert.doesNotMatch(css, /data-theme="light"/);
  assert.match(declarations(css, ".card").composes, /^featureCard from /);
  assert.match(declarations(css, ".viewButton").composes, /^outlineAction from /);
  assert.equal(declarations(css, ".catalogGrid", "(min-width: 1380px)")["grid-template-columns"], undefined);
});

test("Market Index shares the existing catalog, filter state, and search input", async () => {
  const [store, css] = await Promise.all([
    readWorkspaceFile("components/motion-store/motion-store.tsx"),
    readWorkspaceFile("components/motion-store/motion-store.module.css")
  ]);
  assert.match(store, /data-motion-market-index/);
  assert.match(store, /aria-label="Market index"/);
  assert.match(store, /motionCategories\.map/);
  assert.match(store, /motionCatalog\.filter\(\(motion\) => motion\.category === label\)\.length/);
  assert.match(store, /motionCatalog\.length\.toString\(\)\.padStart\(3, "0"\)/);
  assert.match(store, /featuredMotions\.length/);
  assert.match(store, /SEARCH THE LIBRARY/);
  assert.equal((store.match(/<input\b/g) ?? []).length, 1, "Index search must reuse the existing input");
  assert.match(store, /searchRef\.current\?\.focus/);
  assert.match(store, /aria-current=/);
  assert.match(store, /IntersectionObserver/);
  assert.equal(declarations(css, ".store")["grid-template-columns"], "230px minmax(0, 1fr)");
  assert.equal(declarations(css, ".marketIndex").position, "sticky");
  assert.equal(declarations(css, ".layoutGutter")["--index-top"], "max(180px, 35dvh)");
  assert.equal(declarations(css, ".layoutGutter", "(max-width: 1023px)").display, "none");
});
