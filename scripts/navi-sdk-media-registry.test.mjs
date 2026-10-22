import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const canonical = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/navi-sdk-reference.ts");
const model = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer.ts");
const media = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/navi-simulation-media.ts");
const publicRecords = model.buildPublicNaviReferences(canonical.naviFunctions);

test("preserves the exact Navi media inventory and formats", () => {
  const entries = Object.values(media.NAVI_SIMULATION_MEDIA_BY_COMMAND);
  assert.equal(entries.length, 120);
  assert.deepEqual(
    entries.reduce((counts, item) => ({ ...counts, [item.kind]: counts[item.kind] + 1 }), { video: 0, gif: 0, webp: 0 }),
    { video: 82, gif: 36, webp: 2 },
  );
  assert.ok(entries.every((item) => item.asset.startsWith("/assets/products/agentech-library/simulator-previews/navi/") && item.asset.includes("?v=")));
});

test("preserves eligible coverage, expanded aliases, defaults, and intentional exclusions", () => {
  const eligible = publicRecords.filter((item) =>
    item.status !== "development"
    && item.status !== "unsupported"
    && ["Movement", "Athletics", "Actions", "Posture"].includes(item.category)
    && item.name !== "recovery_stand");
  const expandedKeys = eligible.flatMap((item) => media.NAVI_PREVIEW_ALIASES[item.name] ?? [item.name]);
  assert.equal(eligible.length, 116);
  assert.equal(expandedKeys.length, 119);
  assert.ok(expandedKeys.every((command) => media.NAVI_SIMULATION_MEDIA_BY_COMMAND[command]));

  assert.deepEqual(media.NAVI_PREVIEW_ALIASES, {
    diagonal: ["diagonal_left", "diagonal_right"],
    lateral: ["lateral_left", "lateral_right"],
    turn: ["turn_left", "turn_right"],
  });
  assert.equal(media.resolveNaviPreviewCommand("diagonal"), "diagonal_right");
  assert.equal(media.resolveNaviPreviewCommand("lateral"), "lateral_left");
  assert.equal(media.resolveNaviPreviewCommand("turn"), "turn_right");
  assert.equal(media.getNaviSimulationMedia("stop"), null);
  assert.equal(media.getNaviSimulationMedia("recovery_stand"), null);
  assert.equal(media.getNaviSimulationMedia("get_battery_status"), null);
  assert.equal(media.getNaviSimulationMedia("set_gait"), null);
});

test("preserves replay offsets and fails closed when an eligible mapping is absent", () => {
  assert.deepEqual(media.NAVI_SIMULATION_REPLAY_START, {
    bow: 0,
    bark: 0,
    hip_shake: 0,
    nod_head: 0,
    shake_head: 0,
    confused: 0,
    show_affection: 13.8,
    draw_heart: 14.3,
    cute: 0,
    ask_for_play: 0,
    enjoy_touch: 0,
    knock: 14.5,
    shake_hand: 2.65,
    wave_hand: 0,
    wag_rear: 0,
    pee: 6.25,
    sway: 4.9,
  });
  assert.doesNotThrow(() => media.validateNaviSimulationMedia(publicRecords));
  const missing = publicRecords.map((item) => item.name === "stand" ? { ...item, name: "missing_eligible_preview" } : item);
  assert.throws(() => media.validateNaviSimulationMedia(missing), /missing_eligible_preview/);
});
