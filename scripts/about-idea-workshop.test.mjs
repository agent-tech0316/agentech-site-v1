import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [journey, workshop, stylesheet, introStyles] = await Promise.all([
  readFile(new URL("../app/about/about-journey.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-idea-workshop.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-idea-workshop.module.css", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-intro.module.css", import.meta.url), "utf8")
]);

test("Idea uses the interactive frame player while Build and Share remain decorative", () => {
  assert.match(journey, /import \{ IdeaWorkshop \} from "\.\/about-idea-workshop"/);
  assert.match(journey, /<IdeaWorkshop active=\{isActive\}\s*\/>/);
  assert.match(journey, /aria-hidden=\{isInteractive \? undefined : true\}/);
  assert.doesNotMatch(journey, /function IdeaScene/);
  assert.match(journey, /function BuildScene/);
  assert.match(journey, /function ShareScene/);
  assert.match(introStyles, /\.scene\s*{[^}]*min-height:\s*13rem/s);
});

test("the four complete v3 frames stay aligned with no vector drawing overlay", () => {
  const framePaths = workshop.match(/\/assets\/about\/idea-sketch-frames-[^"']+\/frame-\d+\.webp/g) ?? [];
  assert.equal(framePaths.length, 4);
  assert.equal(new Set(framePaths).size, 4);
  assert.ok(framePaths.every((frame) => frame.includes("/idea-sketch-frames-v3/")));
  assert.doesNotMatch(workshop + stylesheet, /idea-sketch-frames-v[12]|coming-soon|STILL BUILDING|ROBOTICS RENT/i);
  assert.doesNotMatch(workshop, /<svg\b|data-idea-concept-sketch|data-idea-inspiration|data-idea-gaze/);
  assert.match(workshop, /data-idea-frame=\{index\}/);
  assert.match(stylesheet, /mask-image:\s*linear-gradient/);
  assert.match(stylesheet, /\.frame\s*{[^}]*position:\s*absolute[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s);
});

test("playback is finite, repeatable, context-aware, and reduced-motion safe", () => {
  assert.match(workshop, /^"use client";/);
  assert.match(workshop, /active:\s*boolean/);
  assert.match(workshop, /IntersectionObserver/);
  assert.match(workshop, /prefers-reduced-motion:\s*reduce/);
  assert.match(workshop, /const FRAME_INTERVAL_MS = 1000/);
  assert.match(workshop, /const framesReady = loadedFrameCount === ideaFrames\.length/);
  assert.match(workshop, /if \(!active \|\| !isInViewport\) return/);
  assert.match(workshop, /if \(!framesReady\)[\s\S]*pendingPlayRef\.current = true/);
  assert.match(workshop, /setFrameIndex\(0\);[\s\S]*setIsPlaying\(true\)/);
  assert.match(workshop, /setFrameIndex\(FINAL_FRAME_INDEX\);[\s\S]*setIsPlaying\(false\)/);
  assert.match(workshop, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(workshop, /onPointerLeave=\{handlePointerLeave\}/);
  assert.match(workshop, /onClick=\{playSequence\}/);
  assert.match(workshop, /onBlur=\{handleBlur\}/);
  assert.match(workshop, /aria-live="polite"/);
  assert.match(workshop, /window\.clearTimeout/);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(stylesheet, /@keyframes/);
});
