import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [workshop, stylesheet] = await Promise.all([
  readFile(new URL("../app/about/about-idea-workshop.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-idea-workshop.module.css", import.meta.url), "utf8")
]);

const framePaths = [...workshop.matchAll(/"(\/assets\/about\/idea-sketch-frames-[^"]+\/frame-(\d+)\.webp)"/g)];

test("Idea uses the four complete About-specific bitmap frames in order", () => {
  assert.equal(framePaths.length, 4);
  assert.deepEqual(
    framePaths.map((match) => Number(match[2])),
    [0, 1, 2, 3]
  );
  assert.equal(new Set(framePaths.map((match) => match[1])).size, 4);
  assert.ok(framePaths.every((match) => match[1].includes("/idea-sketch-frames-v3/")));
  assert.doesNotMatch(workshop + stylesheet, /idea-sketch-frames-v[12]|coming-soon|workshop-wide/i);
  assert.doesNotMatch(workshop, /<svg\b|data-idea-concept-sketch|data-idea-inspiration|data-idea-gaze/);
});

test("each fixed frame fills the same stable visual envelope", () => {
  assert.match(workshop, /ideaFrames\.map\(\(frame, index\) =>/);
  assert.match(workshop, /data-idea-frame=\{index\}/);
  assert.match(workshop, /data-active-frame=\{frameIndex === index \? "true" : "false"\}/);

  const frameRule = stylesheet.match(/\.frame\s*{([^}]*)}/s)?.[1] ?? "";
  assert.ok(frameRule, "a dedicated complete-frame rule should exist");
  assert.match(frameRule, /position:\s*absolute/);
  assert.match(frameRule, /object-fit:\s*cover/);
  assert.doesNotMatch(frameRule, /animation\s*:|transform\s*:|transition[^;]*transform/);
});

test("the artwork itself is the accessible control with no visible control chrome", () => {
  assert.match(workshop, /<button[\s\S]*?data-idea-workshop/);
  assert.equal((workshop.match(/<button\b/g) ?? []).length, 1);
  assert.match(workshop, /aria-label="Play the Idea sketch sequence"/);
  assert.match(workshop, /aria-live="polite"/);
  assert.match(stylesheet, /\.workshop:focus-visible/);
  assert.match(stylesheet, /\.srOnly\s*{/);
  assert.doesNotMatch(workshop + stylesheet, /Sketch an idea|Pause workshop animation|Resume workshop animation/);
  assert.doesNotMatch(stylesheet, /\.sketchButton|\.pauseButton|\.controls|\.liveResponse/);
});
