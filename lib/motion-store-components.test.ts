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
    declarations(css, ".catalogGrid", "(max-width: 900px)")["grid-template-columns"],
    "repeat(2, minmax(0, 1fr))"
  );
  assert.equal(declarations(css, ".catalogGrid", "(max-width: 639px)")["grid-template-columns"], "1fr");
  assert.equal(declarations(css, ".viewButton")["min-height"], "44px");
  assert.equal(declarations(css, ".modal").overflow, "auto");
  assert.equal(
    declarations(css, ".categoryRail", "(max-width: 639px)")["padding-bottom"],
    "max(4px, env(safe-area-inset-bottom))"
  );
});
