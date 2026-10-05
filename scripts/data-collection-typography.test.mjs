import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/data-collection/data-collection.css", import.meta.url), "utf8");
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*\\{([^}]+)\\}"));
  assert.ok(match, "Missing rule: " + selector);
  return match[1];
};

test("Data Collection keeps established display, interface, and technical font roles", () => {
  assert.match(rule("[data-collection-page]"), /font-family:var\(--font-sans\),sans-serif/);
  assert.match(rule("[data-collection-page] h1,[data-collection-page] h2"), /font-family:var\(--font-brand\),sans-serif/);
  assert.match(rule("[data-collection-page] .dc-mono,[data-collection-page] .dc-eyebrow"), /font-family:var\(--font-mono\),monospace/);
});

test("Data Collection product and image display titles use the brand face", () => {
  assert.match(rule("[data-collection-page] .dc-product-mark"), /font-family:var\(--font-brand\),sans-serif/);
  assert.match(rule("[data-collection-page] .dc-hero-visual figcaption>strong"), /font-family:var\(--font-brand\),sans-serif/);
});

test("Data Collection technical qualifiers, tags, and metadata use the mono face", () => {
  for (const selector of [
    "[data-collection-page] .dc-product-mark>span",
    "[data-collection-page] .dc-hero-visual figcaption>div>span",
    "[data-collection-page] .dc-image-credit",
    "[data-collection-page] .dc-scenario-category",
    "[data-collection-page] .dc-scenario-content>span",
    "[data-collection-page] .dc-spec-row>span",
  ]) {
    assert.match(rule(selector), /font-family:var\(--font-mono\),monospace/, selector);
  }
  assert.match(rule("[data-collection-page] .dc-scenario-category"), /font-weight:500/);
});
