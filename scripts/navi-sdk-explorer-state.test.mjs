import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const stateModel = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer-state.ts");
const canonicalNames = new Set(["turn", "stand", "get_battery_status"]);
const parse = (value) => stateModel.parseNaviExplorerState(new URLSearchParams(value), canonicalNames);

test("parses empty, valid, bounded, and invalid Navi URL state without throwing", () => {
  assert.deepEqual(parse(""), { query: "", category: "All", openReferenceName: null });
  assert.deepEqual(parse("robot=navi&q=turn&category=movement&ref=turn"), {
    query: "turn",
    category: "Movement",
    openReferenceName: "turn",
  });
  assert.equal(parse(`robot=navi&q=%20${"x".repeat(130)}%20`).query, "x".repeat(120));
  assert.deepEqual(parse("robot=aegis&q=turn&category=movement&ref=turn"), { query: "", category: "All", openReferenceName: null });
  assert.deepEqual(parse("robot=navi&q=turn&category=unknown&ref=missing"), { query: "turn", category: "All", openReferenceName: null });
});

test("a valid reference overrides query and category state that cannot describe it", () => {
  assert.deepEqual(parse("robot=navi&q=battery&category=sensing&ref=turn"), {
    query: "",
    category: "All",
    openReferenceName: "turn",
  });
});

test("serializes canonical state, omits All, and preserves unrelated parameters", () => {
  const current = new URLSearchParams("robot=navi&utm_source=docs&category=posture&ref=stand");
  const serialized = stateModel.serializeNaviExplorerState(current, {
    query: "turn",
    category: "Movement",
    openReferenceName: "turn",
  });
  assert.equal(serialized.toString(), "robot=navi&utm_source=docs&category=movement&ref=turn&q=turn");
  assert.equal(current.toString(), "robot=navi&utm_source=docs&category=posture&ref=stand", "serialization must not mutate current URL state");

  const all = stateModel.serializeNaviExplorerState(serialized, { query: "", category: "All", openReferenceName: null });
  assert.equal(all.toString(), "robot=navi&utm_source=docs");
});

test("strips only Navi Explorer keys when switching robot", () => {
  const stripped = stateModel.stripNaviExplorerParams(new URLSearchParams("robot=master&q=turn&category=movement&ref=turn&utm_source=docs"));
  assert.equal(stripped.toString(), "robot=master&utm_source=docs");
});

test("pure state transitions support meaningful explicit history and debounced query replacement", () => {
  const initial = new URLSearchParams("robot=navi&utm_source=docs");
  const typed = stateModel.serializeNaviExplorerState(initial, { query: "tur", category: "All", openReferenceName: null });
  const explicitOpen = stateModel.serializeNaviExplorerState(typed, { query: "turn", category: "All", openReferenceName: "turn" });
  const explicitClose = stateModel.serializeNaviExplorerState(explicitOpen, { query: "turn", category: "All", openReferenceName: null });

  assert.equal(typed.get("q"), "tur");
  assert.equal(explicitOpen.get("ref"), "turn");
  assert.equal(explicitClose.has("ref"), false);
  assert.equal(explicitClose.get("utm_source"), "docs");
});
