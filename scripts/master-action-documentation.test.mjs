import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relativePath) {
  const filename = path.resolve(relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", "module", output)(module.exports, require, module);
  return module.exports;
}

const docs = load("features/eaic/01-clients/eaic-hub/contracts/master-action-documentation.ts");
const { masterSimulationPreviews } = load("lib/master-simulation-previews.ts");
// Independent contract expectations from agentech_sdk@095ebe3, api.py and
// arms/presets/standing.py. These tests never import or execute robot code.
const expected = {
  wave: { hands: ["left", "right"], verified: ["right"] },
  blow_kiss: { hands: ["left", "right"], verified: ["left", "right"] },
  raise_hand: { hands: ["left", "right"], verified: ["right"] },
  salute: { hands: ["left", "right"], verified: ["right"] },
  heart: { hands: ["left", "right", "both"], verified: ["both"] },
  handshake: { hands: ["left", "right"], verified: ["left", "right"] },
  high_five: { hands: ["left", "right"], verified: ["left", "right"] },
  clap: { verified: ["fixed"] },
  cross_arms: { verified: ["fixed"] },
  chest_wave: { hands: ["left", "right"], verified: ["left", "right"] },
  hug: { verified: ["fixed"] },
  cheer: { verified: ["fixed"] },
  wave_goodbye: { verified: ["fixed"] },
  raise_hands: { verified: ["fixed"] },
  bow: { verified: ["fixed"] },
  scratch_head: { verified: ["fixed"] },
  center: {},
  stay: {}
};

test("all 18 action docs preserve source parameter names and valid hand selections", () => {
  assert.deepEqual(docs.masterActionFunctions.map((action) => action.name), Object.keys(expected));
  for (const action of docs.masterActionFunctions) {
    const contract = expected[action.name];
    const parameterNames = action.name === "heart" ? ["hand", "posture", "operator_ready", "feet_planted"]
      : action.name === "stay" ? ["seconds"] : contract.hands ? ["hand"] : [];
    assert.deepEqual(action.params.map((parameter) => parameter.name), parameterNames, action.name);
    assert.notEqual(action.summary, action.definition);
    if (!contract.hands) {
      assert.equal(action.configurations, undefined, `${action.name} should not invent hand profiles`);
      continue;
    }
    assert.deepEqual(action.params[0].allowedValues, contract.hands.map((hand) => `"${hand}"`));
    assert.deepEqual(action.configurations.map((configuration) => configuration.value), contract.hands);
    for (const hand of contract.hands) {
      assert.ok(action.example.includes(`Agentech.${action.name}("${hand}")`));
    }
  }
  const heart = docs.masterActionFunctions.find((action) => action.name === "heart");
  assert.equal(heart.params[0].defaultValue, '"both"');
  assert.deepEqual(heart.params[1].allowedValues, ['"stand"', '"sit"', "None"]);
  assert.equal(heart.params[1].defaultValue, "None");
  assert.ok(heart.params.slice(2).every((parameter) => parameter.defaultValue === "False"));
  const stay = docs.masterActionFunctions.find((action) => action.name === "stay");
  assert.equal(stay.params[0].defaultValue, "1.0");
  assert.equal(stay.params[0].allowedRange, "0 < seconds ≤ 300");
});

test("every preview selection maps to the corresponding API call without substituting another variant", () => {
  for (const action of docs.masterActionFunctions) {
    const variants = expected[action.name].hands ?? ["fixed"];
    assert.deepEqual(masterSimulationPreviews[action.name].variants.map((variant) => variant.value), variants);
    for (const variant of variants) {
      assert.equal(docs.masterActionPreviewCall(action, variant), `Agentech.${action.name}(${variant === "fixed" ? "" : `"${variant}"`})`);
    }
    for (const invalid of ["left", "right", "both", "fixed"].filter((variant) => !variants.includes(variant))) {
      assert.equal(docs.masterActionPreviewCall(action, invalid), undefined, `${action.name} must not manufacture a call for ${invalid}`);
    }
  }
});

test("physical verification is reported only for variants recorded in the SDK catalog", () => {
  for (const action of docs.masterActionFunctions) {
    assert.deepEqual(action.verifiedVariants ?? [], expected[action.name].verified ?? []);
    for (const variant of ["left", "right", "both", "fixed"]) {
      assert.equal(Boolean(docs.masterActionVerification(action, variant)), Boolean(expected[action.name].verified?.includes(variant)), `${action.name}: ${variant}`);
    }
  }
});
