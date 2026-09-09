import assert from "node:assert/strict";
import test from "node:test";
import { getGalaxySpiralAngle } from "./agentech-galaxy-rendering.ts";

test("stars in the same spiral arm stay together after a long idle session", () => {
  for (const time of [0, 20, 120, 600]) {
    const slow = getGalaxySpiralAngle(0, 0.6, time, 1, 0.02);
    const fast = getGalaxySpiralAngle(0, 0.6, time, 1, 0.12);
    assert.ok(Math.abs(fast - slow) < 0.08, "differential spin must not disperse the arm into a cloud");
  }
});

test("the two arms retain their opposing orientation throughout rotation", () => {
  for (const time of [0, 15, 120, 600]) {
    const first = getGalaxySpiralAngle(0, 0.45, time, 2, 0.07);
    const second = getGalaxySpiralAngle(Math.PI, 0.45, time, 2, 0.07);
    assert.ok(Math.abs(second - first - Math.PI) < 1e-10);
  }
});

test("formation centers inside the visible hero above the partner strip", async () => {
  const rendering = await import("./agentech-galaxy-rendering.ts");
  const getGalaxyFormationCenter = Reflect.get(rendering, "getGalaxyFormationCenter");

  assert.equal(typeof getGalaxyFormationCenter, "function");
  assert.deepEqual(
    getGalaxyFormationCenter({ canvasWidth: 1440, canvasHeight: 900, bottomContentHeight: 128 }),
    { x: 720, y: 386, visualHeight: 772 },
  );
  assert.deepEqual(
    getGalaxyFormationCenter({ canvasWidth: 390, canvasHeight: 844, bottomContentHeight: 96 }),
    { x: 195, y: 374, visualHeight: 748 },
  );
});

test("formation center remains valid when the hero has no bottom content or an oversized measurement", async () => {
  const rendering = await import("./agentech-galaxy-rendering.ts");
  const getGalaxyFormationCenter = Reflect.get(rendering, "getGalaxyFormationCenter");

  assert.equal(typeof getGalaxyFormationCenter, "function");
  assert.deepEqual(
    getGalaxyFormationCenter({ canvasWidth: 768, canvasHeight: 1024, bottomContentHeight: 0 }),
    { x: 384, y: 512, visualHeight: 1024 },
  );
  assert.deepEqual(
    getGalaxyFormationCenter({ canvasWidth: 768, canvasHeight: 1024, bottomContentHeight: 1400 }),
    { x: 384, y: 0, visualHeight: 0 },
  );
});
