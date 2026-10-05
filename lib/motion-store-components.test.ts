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

test("Skills Market reuses EAIS foundations while exposing scoped Light and unchanged Dark palettes", async () => {
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
  assert.equal(declarations(css, ".store")["color-scheme"], "dark");
  assert.equal(declarations(reference, ".darkPalette")["--canvas"], "#080d14");
  assert.equal(declarations(reference, ".darkPalette")["--surface"], "#101b29");
  const light = declarations(css, ':global(:root[data-theme="light"]) .store');
  assert.equal(light["--canvas"], "#f5f4f1");
  assert.equal(light["--surface"], "#ffffff");
  assert.equal(light["--ink"], "#111");
  assert.equal(light["--muted"], "#5f6874");
  assert.equal(light["--accent"], "#0c6f9d");
  assert.equal(light["color-scheme"], "light");
  assert.match(
    declarations(css, ':global(:root[data-theme="light"]) .store .previewInner').background ?? "",
    /var\(--surface-raised\)/
  );
  assert.match(
    declarations(css, ':global(:root[data-theme="light"]) .store .previewGrid')["background-image"] ?? "",
    /rgb\(45 72 92 \/ 8%\)/
  );
  assert.equal(
    declarations(css, ':global(:root[data-theme="light"]) .store .modalBackdrop').background,
    "rgb(28 37 45 / 32%)"
  );
  assert.match(declarations(css, ".card").composes, /^featureCard from /);
  assert.match(declarations(css, ".viewButton").composes, /^outlineAction from /);
  assert.equal(declarations(css, ".catalogGrid", "(min-width: 1380px)")["grid-template-columns"], undefined);
});

test("Skills Market removes the side index and lets the content use the full page width", async () => {
  const [store, css] = await Promise.all([
    readWorkspaceFile("components/motion-store/motion-store.tsx"),
    readWorkspaceFile("components/motion-store/motion-store.module.css")
  ]);
  assert.doesNotMatch(store, /data-motion-market-index/);
  assert.doesNotMatch(store, /aria-label="Market (?:index|navigation)"/);
  assert.doesNotMatch(store, /MARKET INDEX/);
  assert.doesNotMatch(store, /SEARCH THE LIBRARY/);
  assert.doesNotMatch(store, /IntersectionObserver/);
  assert.equal((store.match(/data-motion-category-rail/g) ?? []).length, 1, "Keep only the existing library category rail");
  assert.equal((store.match(/<input\b/g) ?? []).length, 1, "Keep the single top search input");
  assert.equal(declarations(css, ".store").display, "block");
  assert.equal(declarations(css, ".store")["grid-template-columns"], undefined);
  assert.deepEqual(declarations(css, ".layoutGutter"), {});
  assert.deepEqual(declarations(css, ".marketIndex"), {});
});
