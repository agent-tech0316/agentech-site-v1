import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = process.cwd();
const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath) {
  const filename = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    module.exports,
    require,
    module,
    filename,
    path.dirname(filename)
  );
  return module.exports;
}

const aegis = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/aegis-sdk-reference.ts");
const navi = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/navi-sdk-reference.ts");
const master = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/master-sdk-reference.ts");

const references = [
  {
    robot: "aegis",
    functions: aegis.aegisFunctions,
    starter: aegis.aegisStarterCode,
    expectedCount: 24
  },
  {
    robot: "navi",
    functions: navi.naviFunctions,
    starter: navi.naviStarterCode,
    expectedCount: 130
  },
  {
    robot: "master",
    functions: master.masterFunctions,
    starter: master.masterStarterCode,
    expectedCount: 24
  }
];

test("Aegis, Navi, and Master use the same private-address-free setup pattern", () => {
  for (const reference of references) {
    assert.equal(
      reference.starter,
      `from agentech import Agentech\nAgentech.use("${reference.robot}")`
    );
    assert.doesNotMatch(reference.starter, /host\s*=|(?:\d{1,3}\.){3}\d{1,3}/);
  }
});

test("every robot reference has unique, complete cards", () => {
  for (const reference of references) {
    assert.equal(reference.functions.length, reference.expectedCount);
    const names = reference.functions.map((item) => item.name);
    assert.equal(new Set(names).size, names.length);

    for (const item of reference.functions) {
      assert.equal(typeof item.name, "string");
      assert.ok(item.name.length > 0);
      assert.match(item.signature, /^Agentech\./);
      assert.match(item.example, /Agentech\./);
      assert.ok(Array.isArray(item.params));
      const parameterNames = item.params.map((parameter) => parameter.name);
      assert.equal(new Set(parameterNames).size, parameterNames.length);
    }
  }
});

test("Aegis and Master reference only their current public names", () => {
  const aegisNames = new Set(aegis.aegisFunctions.map((item) => item.name));
  assert.ok(aegisNames.has("get_battery_status"));
  assert.ok(!aegisNames.has("battery"));
  assert.ok(!aegisNames.has("imu"));

  assert.deepEqual(
    master.masterFunctions.map((item) => item.name),
    [
      "wave",
      "blow_kiss",
      "raise_hand",
      "salute",
      "heart",
      "handshake",
      "high_five",
      "clap",
      "cross_arms",
      "chest_wave",
      "hug",
      "cheer",
      "wave_goodbye",
      "raise_hands",
      "bow",
      "scratch_head",
      "center",
      "stay",
      "standing_actions.teach",
      "adjust_right_wrist",
      "adjust_right_elbow",
      "adjust_right_shoulder",
      "status",
      "action_catalog"
    ]
  );
});

test("Navi reference excludes unsupported photo actions while retaining raise_camera", () => {
  const naviNames = new Set(navi.naviFunctions.map((item) => item.name));
  const newActionNames = [
    "smell_food",
    "look_at_food",
    "eat_yellow",
    "drink",
    "enjoy_eating",
    "finish_eating",
    "apply_toothpaste",
    "main_brush",
    "gargle",
    "brush_teeth_horizontal_30s",
    "brush_teeth_back_and_forth_30s",
    "brush_teeth_horizontal_23s",
    "raise_camera",
    "brush_teeth_vertical_30s"
  ];
  const removedPhotoActions = [
    "prepare_camera",
    "camera_stand_3s",
    "take_photo",
    "photo_wave_hand",
    "before_take_photo_fast",
    "after_take_photo_1_fast",
    "after_take_photo_2_fast"
  ];

  for (const name of newActionNames) assert.ok(naviNames.has(name), name);
  for (const name of removedPhotoActions) assert.ok(!naviNames.has(name), name);
  assert.ok(!naviNames.has("turn_around"));
});

test("Navi exposes the exact product-owner-reviewed Common Tasks without changing executable records", () => {
  const expectedCommonTasks = [
    { name: "stand", taskLabel: "Get Navi ready in a standing state", keywords: ["stand", "standing", "standing state", "ready"] },
    { name: "forward", taskLabel: "Move forward", keywords: ["forward", "move forward", "forward movement"] },
    { name: "turn", taskLabel: "Turn left or right", keywords: ["turn", "turn left", "turn right", "left turn", "right turn"] },
    { name: "sit", taskLabel: "Sit and return to standing automatically", keywords: ["sit", "sitting", "return to stand", "auto return to stand"] },
    { name: "stop", taskLabel: "Stop walking or turning", keywords: ["stop", "stop walking", "stop turning"] },
    { name: "get_battery_status", taskLabel: "View battery status", keywords: ["battery", "battery status", "view battery status"] },
  ].map((item, index) => ({
    ...item,
    commonTask: {
      rank: index + 1,
      approved: true,
      reviewedBy: "Agentech product owner",
      reviewedOn: "2026-10-14",
    },
  }));

  const actualCommonTasks = navi.naviFunctions
    .filter((item) => item.discovery?.commonTask)
    .sort((left, right) => left.discovery.commonTask.rank - right.discovery.commonTask.rank)
    .map((item) => ({ name: item.name, ...item.discovery }));
  assert.deepEqual(actualCommonTasks, expectedCommonTasks);

  const executableRecords = navi.naviFunctions.map(({ discovery, returns, ...item }) => item);
  assert.equal(executableRecords.length, 130);
  assert.equal(new Set(executableRecords.map((item) => item.name)).size, 130);
  assert.equal(
    createHash("sha256").update(JSON.stringify(executableRecords)).digest("hex"),
    "b6e96cb3c83011c0d073a5572bce3828b7d4d7442b439ccc60f0b6e2495b1dd5",
    "discovery metadata must not change names, signatures, examples, statuses, access, parameters, profiles, or callable inputs",
  );
});
