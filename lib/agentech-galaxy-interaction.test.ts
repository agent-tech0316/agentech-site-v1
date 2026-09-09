import assert from "node:assert/strict";
import test from "node:test";

import {
  createGalaxyFrameLoop,
  createGalaxyInteractionController,
  getGalaxyPerformanceProfile,
} from "./agentech-galaxy-interaction.ts";
import * as galaxyInteraction from "./agentech-galaxy-interaction.ts";

test("performance profile keeps phone, tablet, and desktop work inside their rendering budgets", () => {
  assert.deepEqual(
    getGalaxyPerformanceProfile({ width: 390, height: 844, devicePixelRatio: 3, reducedMotion: false }),
    { tier: "phone", dpr: 2, particleCount: 3600 },
  );
  assert.deepEqual(
    getGalaxyPerformanceProfile({ width: 768, height: 1024, devicePixelRatio: 2, reducedMotion: false }),
    { tier: "tablet", dpr: 1.75, particleCount: 5200 },
  );
  assert.deepEqual(
    getGalaxyPerformanceProfile({ width: 1440, height: 900, devicePixelRatio: 2, reducedMotion: false }),
    { tier: "desktop", dpr: 1.75, particleCount: 7200 },
  );
  assert.deepEqual(
    getGalaxyPerformanceProfile({ width: 1440, height: 900, devicePixelRatio: 2, reducedMotion: true }),
    { tier: "reduced", dpr: 1.5, particleCount: 2400 },
  );
});

test("performance profiles cap the particle work for a responsive interaction frame", () => {
  const phone = getGalaxyPerformanceProfile({ width: 390, height: 844, devicePixelRatio: 3, reducedMotion: false });
  const tablet = getGalaxyPerformanceProfile({ width: 768, height: 1024, devicePixelRatio: 2, reducedMotion: false });
  const desktop = getGalaxyPerformanceProfile({ width: 1440, height: 900, devicePixelRatio: 2, reducedMotion: false });
  const reduced = getGalaxyPerformanceProfile({ width: 1440, height: 900, devicePixelRatio: 2, reducedMotion: true });

  assert.ok(phone.particleCount < tablet.particleCount);
  assert.ok(tablet.particleCount < desktop.particleCount);
  assert.ok(desktop.particleCount <= 8_000, "batched star rendering must stay within its measured budget");
  assert.ok(reduced.particleCount < phone.particleCount, "reduced motion uses the smallest static particle set");
});

test("hover assembles the wordmark gradually instead of snapping to the final state", () => {
  let now = 0;
  const controller = createGalaxyInteractionController({ now: () => now });

  assert.deepEqual(controller.enterHover(), { progress: 0, phase: "assembling" });
  now = 550;
  const early = controller.tick();
  assert.equal(early.phase, "assembling");
  assert.ok(early.progress > 0.1 && early.progress < 0.25);

  now = 1_100;
  const halfway = controller.tick();
  assert.equal(halfway.phase, "assembling");
  assert.ok(halfway.progress > 0.45 && halfway.progress < 0.55);

  now = 2_200;
  assert.deepEqual(controller.tick(), { progress: 1, phase: "assembled" });
});

test("leaving the hover area eases the assembled wordmark back into the galaxy", () => {
  let now = 0;
  const controller = createGalaxyInteractionController({ now: () => now });

  controller.enterHover();
  now = 2_200;
  assert.deepEqual(controller.tick(), { progress: 1, phase: "assembled" });
  assert.deepEqual(controller.leaveHover(), { progress: 1, phase: "releasing" });

  now = 2_900;
  const releasing = controller.tick();
  assert.equal(releasing.phase, "releasing");
  assert.ok(releasing.progress > 0.45 && releasing.progress < 0.55);

  now = 3_600;
  assert.deepEqual(controller.tick(), { progress: 0, phase: "idle" });
});

test("hover reversal continues from the current particle position without a jump", () => {
  let now = 0;
  const controller = createGalaxyInteractionController({ now: () => now });

  controller.enterHover();
  now = 880;
  const assembling = controller.tick();
  assert.ok(assembling.progress > 0.3 && assembling.progress < 0.4);

  const releaseStart = controller.leaveHover();
  assert.equal(releaseStart.progress, assembling.progress);
  now = 1_080;
  const releasing = controller.tick();
  assert.ok(releasing.progress < releaseStart.progress);

  const reenter = controller.enterHover();
  assert.equal(reenter.progress, releasing.progress);
  assert.equal(reenter.phase, "assembling");
});

test("mouse intent releases inside hero blank space and reassembles only over a visible wordmark region", () => {
  const getGalaxyPointerIntent = Reflect.get(galaxyInteraction, "getGalaxyPointerIntent");
  assert.equal(typeof getGalaxyPointerIntent, "function");

  const initialBounds = { left: 220, top: 590, right: 1_220, bottom: 700 };
  const formationBounds = { left: 220, top: 280, right: 1_220, bottom: 390 };

  assert.equal(
    getGalaxyPointerIntent({
      point: { x: 720, y: 645 },
      initialBounds,
      formationBounds,
      phase: "idle",
      progress: 0,
      tolerance: 12,
    }),
    "assemble",
    "the visible initial logo starts the animation",
  );
  assert.equal(
    getGalaxyPointerIntent({
      point: { x: 720, y: 500 },
      initialBounds,
      formationBounds,
      phase: "assembled",
      progress: 1,
      tolerance: 12,
    }),
    "release",
    "blank hero space must release even while the pointer remains inside the hero",
  );
  assert.equal(
    getGalaxyPointerIntent({
      point: { x: 720, y: 335 },
      initialBounds,
      formationBounds,
      phase: "releasing",
      progress: 0.6,
      tolerance: 12,
    }),
    "assemble",
    "re-entering the final wordmark reverses the release from its current progress",
  );
  assert.equal(
    getGalaxyPointerIntent({
      point: { x: 720, y: 335 },
      initialBounds,
      formationBounds,
      phase: "idle",
      progress: 0,
      tolerance: 12,
    }),
    "release",
    "the empty final position must not retrigger after the logo has fully returned",
  );
});

test("wordmark hit tolerance includes gaps without turning nearby hero space into a trigger", () => {
  const getGalaxyPointerIntent = Reflect.get(galaxyInteraction, "getGalaxyPointerIntent");
  assert.equal(typeof getGalaxyPointerIntent, "function");

  const bounds = { left: 100, top: 100, right: 300, bottom: 160 };
  const common = {
    initialBounds: bounds,
    formationBounds: bounds,
    phase: "assembled" as const,
    progress: 1,
    tolerance: 10,
  };

  assert.equal(getGalaxyPointerIntent({ ...common, point: { x: 200, y: 130 } }), "assemble");
  assert.equal(getGalaxyPointerIntent({ ...common, point: { x: 305, y: 130 } }), "assemble");
  assert.equal(getGalaxyPointerIntent({ ...common, point: { x: 311, y: 130 } }), "release");
});

test("stable galaxy ellipse includes its center and visible arm without covering lower hero blank space", () => {
  const isPointInsideGalaxyPointerEllipse = Reflect.get(galaxyInteraction, "isPointInsideGalaxyPointerEllipse");
  assert.equal(typeof isPointInsideGalaxyPointerEllipse, "function");

  const galaxyBounds = {
    centerX: 720,
    centerY: 190,
    radiusX: 650,
    radiusY: 165,
    rotation: -0.12,
  };

  assert.equal(isPointInsideGalaxyPointerEllipse({ x: 720, y: 190 }, galaxyBounds, 12), true);
  assert.equal(isPointInsideGalaxyPointerEllipse({ x: 1_050, y: 220 }, galaxyBounds, 12), true);
  assert.equal(isPointInsideGalaxyPointerEllipse({ x: 720, y: 500 }, galaxyBounds, 12), false);
});

test("idle and assembling states accept galaxy entry while release requires the final wordmark", () => {
  const getGalaxyPointerIntent = Reflect.get(galaxyInteraction, "getGalaxyPointerIntent");
  assert.equal(typeof getGalaxyPointerIntent, "function");

  const initialBounds = { left: 470, top: 520, right: 970, bottom: 575 };
  const formationBounds = { left: 220, top: 280, right: 1_220, bottom: 390 };
  const galaxyBounds = {
    centerX: 720,
    centerY: 190,
    radiusX: 650,
    radiusY: 165,
    rotation: -0.12,
  };
  const galaxyArmPoint = { x: 1_050, y: 220 };
  const common = { initialBounds, formationBounds, galaxyBounds, tolerance: 12 };

  assert.equal(
    getGalaxyPointerIntent({
      ...common,
      point: galaxyArmPoint,
      phase: "idle",
      progress: 0,
      galaxyEntryArmed: true,
    }),
    "assemble",
  );
  assert.equal(
    getGalaxyPointerIntent({
      ...common,
      point: galaxyArmPoint,
      phase: "assembling",
      progress: 0.4,
      galaxyEntryArmed: false,
    }),
    "assemble",
  );
  assert.equal(
    getGalaxyPointerIntent({
      ...common,
      point: galaxyArmPoint,
      phase: "releasing",
      progress: 0.4,
      galaxyEntryArmed: true,
    }),
    "release",
    "the reforming galaxy cannot bounce a release back into assembly",
  );
  assert.equal(
    getGalaxyPointerIntent({
      ...common,
      point: galaxyArmPoint,
      phase: "idle",
      progress: 0,
      galaxyEntryArmed: false,
    }),
    "release",
    "a completed release needs a real exit and re-entry before galaxy hover can trigger again",
  );
  assert.equal(
    getGalaxyPointerIntent({
      ...common,
      point: { x: 720, y: 335 },
      phase: "releasing",
      progress: 0.4,
      galaxyEntryArmed: false,
    }),
    "assemble",
    "the final wordmark remains the only quick reversal target during release",
  );
});

test("reduced-motion mode uses stable states instead of time-based animation", () => {
  let now = 0;
  const controller = createGalaxyInteractionController({ now: () => now, reducedMotion: true });

  assert.deepEqual(controller.enterHover(), { progress: 1, phase: "reduced" });
  now = 60_000;
  assert.deepEqual(controller.tick(), { progress: 1, phase: "reduced" });
  assert.deepEqual(controller.leaveHover(), { progress: 0, phase: "reduced" });
});

test("frame loop pauses while hidden, resumes once, and cancels all work on dispose", () => {
  let nextId = 0;
  const pending = new Map<number, (time: number) => void>();
  const cancelled: number[] = [];
  let frames = 0;

  const loop = createGalaxyFrameLoop({
    requestFrame(callback) {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
      pending.delete(id);
    },
    onFrame() {
      frames += 1;
    },
  });

  loop.start();
  assert.equal(pending.size, 1);
  const first = pending.entries().next().value as [number, (time: number) => void];
  pending.delete(first[0]);
  first[1](16);
  assert.equal(frames, 1);
  assert.equal(pending.size, 1);

  loop.pause();
  assert.equal(pending.size, 0);
  assert.equal(cancelled.length, 1);

  loop.resume();
  loop.resume();
  assert.equal(pending.size, 1);

  loop.dispose();
  assert.equal(pending.size, 0);
  assert.equal(cancelled.length, 2);
  loop.resume();
  assert.equal(pending.size, 0);
});

test("reduced-motion frame loop renders one stable frame and never starts RAF", () => {
  let requests = 0;
  let frames = 0;
  const loop = createGalaxyFrameLoop({
    reducedMotion: true,
    requestFrame() {
      requests += 1;
      return requests;
    },
    cancelFrame() {},
    onFrame() {
      frames += 1;
    },
  });

  loop.start();
  assert.equal(frames, 1);
  assert.equal(requests, 0);
  loop.dispose();
});
