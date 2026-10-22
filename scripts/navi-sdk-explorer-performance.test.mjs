import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const canonical = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/navi-sdk-reference.ts");
const model = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer.ts");
const index = model.buildNaviSearchIndex(model.buildPublicNaviReferences(canonical.naviFunctions));
const queries = [
  ["", "All"],
  ["turn", "All"],
  ["standing state ready", "All"],
  ["lateral_left", "Movement"],
  ["battery status", "Sensing"],
  ["angle rate", "Movement"],
  ["jump wait", "Athletics"],
  ["development", "Configuration"],
  ["return to home", "All"],
  ["no-match-sentinel", "All"],
];

test("Navi search p95 stays within one 16.7 ms frame", () => {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const [query, category] = queries[iteration % queries.length];
    model.searchNaviReferences(index, query, category);
  }

  const durations = [];
  const sampleCount = 2_000;
  for (let iteration = 0; iteration < sampleCount; iteration += 1) {
    const [query, category] = queries[iteration % queries.length];
    const started = performance.now();
    model.searchNaviReferences(index, query, category);
    durations.push(performance.now() - started);
  }
  durations.sort((left, right) => left - right);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  console.log(`Navi search benchmark: samples=${sampleCount} p95=${p95.toFixed(3)}ms`);
  assert.ok(p95 <= 16.7, `expected p95 <= 16.7ms, received ${p95.toFixed(3)}ms`);
});
