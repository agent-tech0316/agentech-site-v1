import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/aigc/aigc.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/aigc/page.tsx", import.meta.url), "utf8");
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*\\{([^}]+)\\}"));
  assert.ok(match, "Missing rule: " + selector);
  return match[1];
};
const light = ':root[data-theme="light"] [data-aigc-page] ';
const dark = ':root[data-theme="dark"] [data-aigc-page] ';
const blobHash = (text) => createHash("sha1").update("blob " + Buffer.byteLength(text) + "\0" + text).digest("hex");

test("production files exactly match the accepted AIGC design with the stage navigation removed", () => {
  assert.equal(blobHash(css), "dcc183498a097c7517f479d4422e3e686fb115e4");
  assert.equal(blobHash(page), "7e3b81152d13ed7cc21553e1af8cd05afc36197d");
});

test("AIGC removes the stage shortcut navigation without removing the stage content", () => {
  assert.doesNotMatch(page, /className="aigc-stage-nav"/);
  assert.doesNotMatch(page, /aria-label="AIGC content sections"/);
  assert.doesNotMatch(css, /\.aigc-stage-nav/);
  assert.match(page, /className="aigc-stages" data-aigc-sections/);
  assert.match(page, /creativeStages\.map\(\(stage\) => <section/);
});

test("display headings use brand typography and reimagined is not serif/italic", () => {
  for (const selector of ["h1", "h2", ".aigc-stage h3"]) {
    assert.match(rule("[data-aigc-page] " + selector), /font-family: var\(--font-brand\)/);
  }
  assert.match(rule("[data-aigc-page] h2 em"), /font-family: inherit; font-style: normal; font-weight: inherit/);
});

test("interface prose and technical metadata keep separate font roles", () => {
  assert.match(rule("[data-aigc-page]"), /font-family: var\(--font-sans\)/);
  assert.match(rule("[data-aigc-page] .aigc-stage > p"), /font-family: var\(--font-sans\)/);
  assert.match(rule("[data-aigc-page] .aigc-stage-placeholder > span"), /font-family: var\(--font-mono\)/);
});

test("light hero has warm canvas and gray-alpha linework without an opaque rectangle", () => {
  assert.match(rule(light + ".aigc-hero-shell"), /background: #f5f4f1/);
  assert.match(rule(light + '[data-aigc-art-layer="linework"]'), /filter: url\("#aigc-gray-linework"\); mix-blend-mode: normal; opacity: 1/);
  assert.match(page, /type="luminanceToAlpha"/);
  assert.match(page, /amplitude="1.35" exponent=".7" offset="-.15"/);
  assert.match(page, /floodColor="#343637"/);
});

test("copper effects reuse original source with accepted color mask and glow", () => {
  assert.equal((page.match(/src="\/assets\/aigc\/aigc-golf-robot-hero.png"/g) ?? []).length, 2);
  assert.match(rule(light + '[data-aigc-art-layer="effects"]'), /url\("#aigc-copper-effects"\) saturate\(1.12\) contrast\(1.02\)/);
  assert.match(page, /2.5 -1.3 -1.2 0 -0.16/);
  assert.match(page, /floodColor="#b65326"/);
  assert.match(page, /<feGaussianBlur in="copper" stdDeviation="1.8"/);
});

test("dark keeps the unfiltered original and hides extra effect layer", () => {
  assert.match(rule(dark + '[data-aigc-art-layer="linework"]'), /filter: none; mix-blend-mode: normal; opacity: 1/);
  assert.match(rule(dark + '[data-aigc-art-layer="effects"]'), /display: none/);
});

test("original CTA, lower media, mobile warm overlay and touch size remain", () => {
  assert.match(page, /className="aigc-back" href="\/ai-service"/);
  assert.match(page, /src="\/assets\/aigc\/full-animation-showcase.mp4"/);
  assert.match(page, /src="\/assets\/aigc\/master-humanoid-blueprint.jpg"/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /linear-gradient\(180deg, #f5f4f1 0%, #f5f4f1 47%/);
});
