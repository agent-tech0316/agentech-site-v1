import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [player, stylesheet] = await Promise.all([
  readFile(new URL("../app/about/about-story-frame-player.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-story-frame-player.module.css", import.meta.url), "utf8").catch(() => "")
]);

test("Build and Share can use one story-specific full-frame player without visible controls", () => {
  assert.match(player, /^"use client";/);
  assert.match(player, /type AboutStoryFramePlayerProps = \{/);
  assert.match(player, /story: "build" \| "share"/);
  assert.match(player, /frames: readonly string\[\]/);
  assert.match(player, /frameIntervalMs: number/);
  assert.match(player, /data-about-story-player=\{story\}/);
  assert.match(player, /data-story-frame=\{index\}/);
  assert.match(player, /aria-label=\{`Play the \$\{label\} story`\}/);
  assert.equal((player.match(/<button\b/g) ?? []).length, 1);
  assert.doesNotMatch(player, /<svg\b|Pause|Resume|Play story/);
});

test("story playback starts on the first decoded action frame and never reveals an undecoded next frame", () => {
  assert.match(player, /const firstActiveFrameIndex = Math\.min\(1, finalFrameIndex\)/);
  assert.match(player, /loadedFramesRef\.current\.has\(requiredStartFrameIndex\)/);
  assert.match(player, /setFrameIndex\(firstActiveFrameIndex\)/);
  assert.match(player, /loadedFramesRef\.current\.has\(nextFrameIndex\)/);
  assert.match(player, /pendingFrameRef\.current = nextFrameIndex/);
  assert.match(player, /image\.decode\(\)/);
  assert.match(player, /priority=\{index <= firstActiveFrameIndex\}/);
  assert.match(player, /data-playback-pending=\{isPlaybackPending \? "true" : "false"\}/);
  assert.match(player, /data-story-loading-cue/);
  assert.match(stylesheet, /\.loadingCue\[data-visible="true"\]/);
});

test("each player owns its lifecycle, fallback, and reduced-motion state", () => {
  assert.match(player, /export function AboutStoryFramePlayer/);
  assert.match(player, /useRef<HTMLButtonElement>/);
  assert.match(player, /useRef\(new Set<number>\(\)\)/);
  assert.match(player, /IntersectionObserver/);
  assert.match(player, /prefers-reduced-motion:\s*reduce/);
  assert.match(player, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(player, /onPointerLeave=\{handlePointerLeave\}/);
  assert.match(player, /onClick=\{playSequence\}/);
  assert.match(player, /onBlur=\{handleBlur\}/);
  assert.match(player, /setFrameIndex\(0\)/);
  assert.match(player, /setFrameIndex\(finalFrameIndex\)/);
  assert.match(player, /data-frame-error=\{hasFrameError \? "true" : "false"\}/);
  assert.match(player, /resetSequence\(\)/);
});

test("the story player preserves the exact 2:1 card envelope and uses a passive loading cue", () => {
  assert.match(stylesheet, /\.player\s*{[^}]*aspect-ratio:\s*2\s*\/\s*1/s);
  assert.match(stylesheet, /\.frame\s*{[^}]*position:\s*absolute[^}]*object-fit:\s*cover/s);
  assert.match(stylesheet, /\.loadingCue\s*{[^}]*pointer-events:\s*none/s);
  assert.match(stylesheet, /\.loadingCue\[data-visible="true"\]/);
  assert.doesNotMatch(stylesheet, /@keyframes/);
});
