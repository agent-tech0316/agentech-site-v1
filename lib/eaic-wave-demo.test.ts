import assert from "node:assert/strict";
import test from "node:test";

test("only the wave action can activate the browser demo", async () => {
  const demo = await import("./eaic-wave-demo.ts").catch(() => null);
  assert.ok(demo, "The browser demo needs an explicit action allowlist");
  for (const value of ["wave", "WAVE", "  wave  "]) assert.equal(demo.parseWaveAction(value), "wave");
  for (const value of ["", "wa", "挥手", "walk", "wave()", "wave;alert(1)", "wave\nrun", "<script>", "constructor"]) {
    assert.equal(demo.parseWaveAction(value), null, `${JSON.stringify(value)} must never activate a command`);
  }
});
