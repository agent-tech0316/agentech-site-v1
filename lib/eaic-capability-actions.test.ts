import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const root = new URL("../", import.meta.url);

test("EAIC capability actions stay together while the expanded detail appears below both controls", async () => {
  const component = await readFile(new URL("components/eaic-public-experience.tsx", root), "utf8");
  const group = component.match(/<div data-eaic-capability-actions>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(group, "the two capability actions need a shared layout container");
  assert.match(group, /data-eaic-capability-details/);
  assert.match(group, /aria-controls="eaic-capability-detail"/);
  assert.match(group, /Inspect this in the SDK/);
  assert.doesNotMatch(group, /className="eaic-public-capability-detail"/);
  assert.match(component, /<\/div>\s*\{detailsOpen \? <div id="eaic-capability-detail" className="eaic-public-capability-detail"/);
});

test("EAIC capability controls wrap with a 24px desktop gap and 16px phone gap and keep 44px targets", async () => {
  const css = postcss.parse(await readFile(new URL("app/agentech-products/eaic/eaic-public.css", root), "utf8"));
  const desktop = new Map<string, string>();
  const phone = new Map<string, string>();
  const controls = new Map<string, string>();
  css.walkRules("[data-eaic-capability-actions]", (rule) => {
    const target = rule.parent?.type === "root" ? desktop : phone;
    rule.walkDecls((declaration) => { target.set(declaration.prop, declaration.value); });
  });
  css.walkRules("[data-eaic-capability-actions] > :is(button, a)", (rule) => {
    rule.walkDecls((declaration) => { controls.set(declaration.prop, declaration.value); });
  });
  assert.equal(desktop.get("display"), "flex");
  assert.equal(desktop.get("flex-wrap"), "wrap");
  assert.equal(desktop.get("gap"), "24px");
  assert.equal(phone.get("gap"), "16px");
  assert.equal(controls.get("margin-top"), "0", "child margins must not compound the group spacing");
  assert.equal(controls.get("min-height"), "44px");
});
