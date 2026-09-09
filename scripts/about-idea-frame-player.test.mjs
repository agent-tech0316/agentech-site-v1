import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [workshop, stylesheet] = await Promise.all([
  readFile(new URL("../app/about/about-idea-workshop.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-idea-workshop.module.css", import.meta.url), "utf8")
]);

test("Idea uses only a finite set of About-specific complete frames", () => {
  assert.match(workshop, /const ideaFrames = \[[\s\S]*?\] as const/);
  const framePaths = workshop.match(/\/assets\/about\/[^"']+\.(?:png|webp|jpe?g)/g) ?? [];
  assert.deepEqual(framePaths, [
    "/assets/about/idea-sketch-frames-v3/frame-0.webp",
    "/assets/about/idea-sketch-frames-v3/frame-1.webp",
    "/assets/about/idea-sketch-frames-v3/frame-2.webp",
    "/assets/about/idea-sketch-frames-v3/frame-3.webp"
  ]);
  assert.equal(new Set(framePaths).size, framePaths.length);
  assert.doesNotMatch(workshop + stylesheet, /idea-sketch-frames-v[12]|coming-soon|workshop-wide/i);
  assert.match(workshop, /data-idea-frame/);
  assert.match(workshop, /data-frame-index=\{frameIndex\}/);
});

test("the whole artwork is the only native control and no visible controls remain", () => {
  assert.match(workshop, /<button[\s\S]*?data-idea-workshop/);
  assert.equal((workshop.match(/<button\b/g) ?? []).length, 1);
  assert.doesNotMatch(workshop + stylesheet, /Sketch an idea|Pause workshop animation|Resume workshop animation/);
  assert.doesNotMatch(stylesheet, /\.sketchButton|\.pauseButton|\.controls|\.liveResponse/);
  assert.doesNotMatch(workshop, /data-idea-concept-sketch|data-idea-inspiration|data-idea-gaze|<svg\b/);
  assert.match(workshop, /aria-live="polite"/);
  assert.match(stylesheet, /\.srOnly\s*{/);
});

test("playback is ready-gated, finite, repeatable, and resets outside its active context", () => {
  assert.match(workshop, /const FRAME_INTERVAL_MS = \d+/);
  assert.match(workshop, /framesReady/);
  assert.match(workshop, /loadedFrameCount/);
  assert.match(workshop, /onLoad/);
  assert.match(workshop, /setTimeout/);
  assert.match(workshop, /setFrameIndex/);
  assert.match(workshop, /ideaFrames\.length - 1/);
  assert.match(workshop, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(workshop, /onPointerLeave=\{handlePointerLeave\}/);
  assert.match(workshop, /onClick=\{playSequence\}/);
  assert.match(workshop, /onBlur=\{handleBlur\}/);
  assert.match(workshop, /prefersReducedMotion[\s\S]*setFrameIndex\(ideaFrames\.length - 1\)/);
  assert.match(workshop, /if \(active && isInViewport\) return;[\s\S]*cancelSequence\(\)/);
  assert.match(workshop, /clearTimeout/);
  assert.match(workshop, /playbackCycle/);
  assert.match(workshop, /setPlaybackCycle\(\(cycle\) => cycle \+ 1\)/);
  assert.match(workshop, /\[[^\]]*playbackCycle[^\]]*\]/);

  const interval = Number(workshop.match(/const FRAME_INTERVAL_MS = (\d+)/)?.[1] ?? 0);
  const frameCount = (workshop.match(/\/assets\/about\/[^"']+\.(?:png|webp|jpe?g)/g) ?? []).length;
  assert.ok(interval > 0);
  assert.ok(interval * Math.max(frameCount - 1, 0) < 5000, "the full sequence must finish in under five seconds");
});

test("cold-load hover waits for decoded frames and touch leave cannot cancel click playback", () => {
  assert.match(workshop, /pendingPlayRef/);
  assert.match(workshop, /pointerInsideRef/);
  assert.match(workshop, /framesReady[\s\S]*pendingPlayRef\.current[\s\S]*playSequence/);
  assert.match(workshop, /\.decode\(\)/);
  assert.match(workshop, /pointerType === "touch"/);
  assert.match(workshop, /lastPointerWasTouchRef/);
  assert.match(workshop, /onPointerDown=\{handlePointerDown\}/);
  assert.match(workshop, /pendingPlayRef\.current = false/);
});

test("a decode rejection keeps frame zero static and never marks the sequence ready", () => {
  assert.match(workshop, /failedFrameCount/);
  assert.match(workshop, /data-frame-error/);
  assert.doesNotMatch(workshop, /\.decode\(\)[\s\S]*?\.catch\(\(\) => undefined\)[\s\S]*?\.then/);
  assert.match(workshop, /\.decode\(\)[\s\S]*?\.then\([\s\S]*?loadedFramesRef[\s\S]*?\.catch\([\s\S]*?resetSequence/);
});

test("the stable visual envelope and reduced-motion fallback remain explicit", () => {
  assert.match(stylesheet, /\.workshop\s*{[^}]*min-height:\s*12rem[^}]*aspect-ratio:\s*520\s*\/\s*250/s);
  assert.match(stylesheet, /\.frame\s*{[^}]*position:\s*absolute[^}]*object-fit:\s*cover/s);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
