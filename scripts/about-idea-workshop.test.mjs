import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [journey, workshop, stylesheet, introStyles] = await Promise.all([
  readFile(new URL("../app/about/about-journey.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-idea-workshop.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-idea-workshop.module.css", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-intro.module.css", import.meta.url), "utf8")
]);

test("Idea, Build, and Share expose their independent approved interactions", () => {
  assert.match(journey, /import \{ IdeaWorkshop \} from "\.\/about-idea-workshop"/);
  assert.match(journey, /import \{ BuildWorkshop \} from "\.\/about-build-workshop"/);
  assert.match(journey, /import \{ ShareWorkshop \} from "\.\/about-share-workshop"/);
  assert.match(journey, /<IdeaWorkshop active\s*\/>/);
  assert.match(journey, /id: "build"[\s\S]*Scene: BuildWorkshop/);
  assert.match(journey, /aria-hidden=\{isInteractive \? undefined : true\}/);
  assert.doesNotMatch(journey, /function IdeaScene/);
  assert.doesNotMatch(journey, /function BuildScene/);
  assert.doesNotMatch(journey, /function ShareScene/);
  assert.match(introStyles, /\.scene\s*{[^}]*aspect-ratio:\s*2\s*\/\s*1/s);
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

test("playback responds on the first decoded action frame and remains context-aware", () => {
  assert.match(workshop, /^"use client";/);
  assert.match(workshop, /active:\s*boolean/);
  assert.match(workshop, /IntersectionObserver/);
  assert.match(workshop, /prefers-reduced-motion:\s*reduce/);
  assert.match(workshop, /const FRAME_INTERVAL_MS = 1000/);
  assert.match(workshop, /const FIRST_ACTIVE_FRAME_INDEX = Math\.min\(1, FINAL_FRAME_INDEX\)/);
  assert.match(workshop, /const framesReady = loadedFrameCount === ideaFrames\.length/);
  assert.match(workshop, /if \(!active \|\| !isInViewport\) return/);
  assert.match(
    workshop,
    /if \(!loadedFramesRef\.current\.has\(requiredStartFrameIndex\)\)[\s\S]*pendingPlayRef\.current = true/
  );
  const beginSequence = workshop.match(/const beginSequence = useCallback\([\s\S]*?\n  const requestPlayback/)?.[0] ?? "";
  assert.match(beginSequence, /setFrameIndex\(FIRST_ACTIVE_FRAME_INDEX\)/);
  assert.doesNotMatch(beginSequence, /setFrameIndex\(0\)/);
  assert.match(workshop, /setFrameIndex\(FINAL_FRAME_INDEX\);[\s\S]*setIsPlaying\(false\)/);
  assert.match(workshop, /pendingFrameRef/);
  assert.match(workshop, /loadedFramesRef\.current\.has\(nextFrameIndex\)/);
  assert.match(workshop, /data-playback-pending=\{isPlaybackPending \? "true" : "false"\}/);
  assert.match(workshop, /data-idea-loading-cue/);
  assert.match(stylesheet, /\.loadingCue\[data-visible="true"\]/);
  assert.match(workshop, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(workshop, /onPointerLeave=\{handlePointerLeave\}/);
  assert.match(workshop, /onClick=\{playSequence\}/);
  assert.match(workshop, /onBlur=\{handleBlur\}/);
  assert.match(workshop, /aria-live="polite"/);
  assert.match(workshop, /window\.clearTimeout/);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(stylesheet, /@keyframes/);
});
