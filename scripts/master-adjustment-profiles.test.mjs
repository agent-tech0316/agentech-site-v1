import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

// Request families from the September 30 Master adjustment profiles website handoff.
// This fixture is independent of the production profile generators.
const handoff = JSON.parse(readFileSync(new URL("./fixtures/master-adjustment-handoff-profiles.json", import.meta.url), "utf8"));
const { masterDocumentationFunctions, masterWebsiteFunctions, masterSetupParams, masterProfileDisplaySyntax, masterDocumentationStarterCode } = loadTypeScriptModule(
  "features/eaic/01-clients/eaic-hub/contracts/master-sdk-documentation.ts",
);
const byName = new Map(masterDocumentationFunctions.map((item) => [item.name, item]));
const forms = (item) => (item?.profiles ?? []).flatMap((entry) => [entry.syntax, entry.customDurationSyntax].filter(Boolean));

test("every relative Master adjustment shows numeric bounds minus the current angle", () => {
  const angleFields = {
    adjust_right_elbow: ["degrees"], adjust_left_elbow: ["degrees"],
    adjust_both_elbows: ["degrees"], adjust_elbow: ["degrees", "position"],
    adjust_right_shoulder: ["degrees"], adjust_left_shoulder: ["degrees"],
    adjust_right_wrist: ["degrees", "roll", "pitch", "yaw"],
    adjust_left_wrist: ["degrees", "roll", "pitch", "yaw"],
    adjust_wrist: ["degrees", "roll", "pitch", "yaw"],
    adjust_waist: ["degrees", "yaw", "pitch", "roll"],
    adjust_upper_body: ["waist", "right_arm", "left_arm", "both_elbows"],
  };
  assert.deepEqual(masterDocumentationFunctions.filter((item) => item.name.startsWith("adjust_")).map((item) => item.name).sort(), Object.keys(angleFields).sort());
  for (const [name, fields] of Object.entries(angleFields)) {
    for (const field of fields) {
      const input = byName.get(name).params.find((entry) => entry.name === field);
      assert.match(input.allowedRange, /\d(?:\.\d+)? − current/, `${name}.${field}: show numeric remaining-range bounds`);
      assert.doesNotMatch(input.allowedRange, /Dynamic|depends/i, `${name}.${field}: do not replace numbers with a vague label`);
      assert.match(input.description, /Example.*°.*range.*°/i, `${name}.${field}: include an actual remaining-range example`);
    }
  }
  for (const name of ["move_elbows_to", "move_arms_to", "move_mirrored_arms_to"]) {
    assert.ok(byName.get(name).params.every((entry) => !entry.allowedRange?.includes("− current")), `${name}: absolute targets retain their separate contract`);
  }
  const range = (name, field) => byName.get(name).params.find((entry) => entry.name === field).allowedRange;
  assert.equal(range("adjust_right_elbow", "degrees"), "(3 − current)° to (131.965 − current)°");
  assert.match(range("adjust_left_shoulder", "degrees"), /Pitch: \(-176\.471 − current\)° to \(116\.883 − current\)°/);
  assert.match(range("adjust_right_wrist", "roll"), /\(-33\.482 − current\)° to \(82\.012 − current\)°/);
  assert.match(range("adjust_waist", "roll"), /max\(-15, -27\.96 − current\).*min\(15, 27\.96 − current\)/);
});

test("normal Master examples use torque directly without execution-mode or budget setup", () => {
  assert.equal(masterDocumentationStarterCode, 'from agentech import Agentech\nAgentech.use("master")');
  assert.deepEqual(masterSetupParams, [], "customer setup omits controller configuration");
  const armAdjustments = masterWebsiteFunctions.filter((item) => item.name.startsWith("adjust_") && item.name !== "adjust_waist");
  assert.equal(armAdjustments.length, 10);
  for (const item of armAdjustments) {
    assert.match(item.example, /torque\s*=/, `${item.name}: show the implemented torque argument`);
    assert.doesNotMatch(item.example, /dry_run|planning_torque_budget|standing_.*torque_limit/, `${item.name}: normal command syntax`);
  }
  for (const name of ["adjust_left_wrist", "adjust_right_wrist", "adjust_wrist"]) {
    const example = masterWebsiteFunctions.find((item) => item.name === name).example;
    assert.match(example, /"yaw": 20/);
    assert.match(example, /"pitch": 1/);
    assert.match(example, /"roll": 1/);
  }
  const waist = masterWebsiteFunctions.find((item) => item.name === "adjust_waist");
  assert.ok(forms(waist).every((syntax) => !/torque=/.test(syntax)), "waist movement profiles use its supported position route");
});

test("implemented torque contracts use supported upper-body groups and per-joint request ceilings", () => {
  const implemented = ["adjust_right_elbow", "adjust_left_elbow", "adjust_elbow", "adjust_both_elbows", "adjust_right_shoulder", "adjust_left_shoulder", "adjust_right_wrist", "adjust_left_wrist", "adjust_wrist", "adjust_waist", "adjust_upper_body"];
  for (const name of implemented) {
    const item = masterWebsiteFunctions.find((entry) => entry.name === name);
    const torque = item.params.find((entry) => entry.name === "torque");
    assert.ok(torque, `${name}: implemented torque parameter`);
    assert.notEqual(torque.status, "development", `${name}: implemented torque must be available`);
    assert.ok(byName.get(name).params.some((entry) => entry.name === "torque"), `${name}: current catalog includes torque`);
  }
  const upper = masterWebsiteFunctions.find((entry) => entry.name === "adjust_upper_body");
  assert.equal(upper.profiles.length, 4);
  assert.deepEqual(upper.params.map((entry) => entry.name), ["waist", "right_arm", "left_arm", "both_elbows", "duration_seconds", "torque"]);
  for (const field of ["right_arm", "left_arm"]) {
    for (const key of ["shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"]) {
      assert.ok(upper.params.find((entry) => entry.name === field).description.includes(key));
    }
  }
  for (const syntax of forms(upper)) {
    assert.match(syntax, /torque=\{/);
    assert.doesNotMatch(syntax, /"both_elbows":/);
    assert.doesNotMatch(syntax, /torque=\{\s*"waist"/, "coordinated profiles use the live arm torque receiver");
  }
  const { masterJointTorqueReference } = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-joint-torque-reference.ts");
  assert.equal(masterJointTorqueReference("adjust_right_shoulder")[0].additionalTorqueInputRange, "-24 to +24 N·m");
  assert.equal(masterJointTorqueReference("adjust_right_wrist").find((row) => row.joint === "right_wrist_pitch_joint").additionalTorqueInputRange, "-2.2 to +2.2 N·m");
  assert.match(upper.platformNote, /nonzero waist torque.*no.*receiver/i);
});

const requiredParams = {
  adjust_right_elbow: ["degrees", "duration_seconds", "torque"],
  adjust_left_elbow: ["degrees", "duration_seconds", "torque"],
  adjust_elbow: ["side", "degrees", "position", "speed", "torque", "duration_seconds"],
  adjust_both_elbows: ["degrees", "duration_seconds", "torque"],
  move_elbows_to: ["degrees", "duration_seconds"],
  adjust_right_shoulder: ["axis", "degrees", "duration_seconds", "torque"],
  adjust_left_shoulder: ["axis", "degrees", "duration_seconds", "torque"],
  adjust_right_wrist: ["axis", "degrees", "roll", "pitch", "yaw", "torque"],
  adjust_left_wrist: ["axis", "degrees", "roll", "pitch", "yaw", "torque"],
  adjust_wrist: ["axis", "degrees", "roll", "pitch", "yaw", "torque"],
  adjust_waist: ["axis", "degrees", "yaw", "pitch", "roll", "max_duration_seconds", "expected_start_degrees", "torque"],
  return_waist_to_neutral: ["max_duration_seconds"],
  undo_waist: ["movement", "max_duration_seconds"],
  adjust_upper_body: ["waist", "right_arm", "left_arm", "both_elbows", "duration_seconds", "torque"],
  move_arms_to: ["left", "right", "duration_seconds"],
  mirror_arm_pose: ["source_side", "duration_seconds"],
  move_mirrored_arms_to: ["targets", "duration_seconds"],
  stiff: ["level", "side", "duration_seconds", "operator_ready", "mechanically_supported", "preflight"],
  plan_upper_body_torque_assist: ["arm_effort_nm", "waist_effort_nm", "max_additional_effort_nm", "duration_seconds", "ramp_seconds", "limit_source"],
};

function canonicalPython(sources, omitAddedTorque = false) {
  const result = spawnSync(process.env.MASTER_SDK_PYTHON ?? "python", ["-c", `
import ast, json, sys
class Canonical(ast.NodeTransformer):
    def visit_Call(self, node):
        self.generic_visit(node)
        if ${omitAddedTorque ? "True" : "False"}:
            node.keywords = [kw for kw in node.keywords if kw.arg != 'torque']
        node.keywords.sort(key=lambda kw: kw.arg or '')
        return node
    def visit_Dict(self, node):
        self.generic_visit(node)
        pairs = sorted(zip(node.keys, node.values), key=lambda pair: ast.dump(pair[0]))
        node.keys, node.values = map(list, zip(*pairs)) if pairs else ([], [])
        return node
print(json.dumps([ast.dump(Canonical().visit(ast.parse(source))) for source in json.load(sys.stdin)]))
`], { input: JSON.stringify(sources), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("every historical handoff family is retained alongside current optional torque fields", () => {
  for (const [name, rows] of Object.entries(handoff)) {
    const item = byName.get(name);
    assert.ok(item, `${name} needs a function card`);
    const actualForms = forms(item);
    // The September 30 fixture remains unchanged. Ignore newly added torque
    // only for its position-only families; the original elbow effort matrix stays exact.
    const canonical = canonicalPython([...actualForms, ...rows.map((row) => row.syntax)],
      ["adjust_both_elbows", "adjust_left_shoulder", "adjust_right_shoulder", "adjust_left_wrist", "adjust_right_wrist", "adjust_wrist", "adjust_waist", "adjust_upper_body"].includes(name));
    const actual = new Set(canonical.slice(0, actualForms.length));
    for (const [index, row] of rows.entries()) {
      assert.ok(actual.has(canonical[actualForms.length + index]), `${name}: missing ${row.name}`);
    }
    assert.equal(actual.size, actualForms.length, `${name}: duplicate profile forms`);
  }
});

test("parameter tables expose actual top-level SDK keywords and mapping schemas", () => {
  for (const [name, params] of Object.entries(requiredParams)) {
    assert.deepEqual(byName.get(name)?.params.map((entry) => entry.name).sort(), [...params].sort(), name);
  }
  for (const name of ["move_arms_to", "move_mirrored_arms_to"]) {
    const text = byName.get(name).params.map((entry) => entry.description).join(" ");
    for (const key of ["shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"]) {
      assert.ok(text.includes(key), `${name}: missing ${key} in mapping schema`);
    }
  }
});

test("general upper-body plans and all proposed stiffness profiles carry development status", () => {
  const upper = byName.get("adjust_upper_body");
  assert.equal(upper.profiles.filter((entry) => entry.status === "development").length, 8);
  for (const entry of upper.profiles.filter((entry) => entry.status === "development")) {
    assert.equal(entry.customDurationSyntax, undefined);
  }
  const stiff = byName.get("stiff");
  assert.equal(stiff?.category, "Sensing");
  assert.equal(forms(stiff).length, 18);
  for (const entry of stiff.profiles) {
    assert.equal(entry.status, "development");
    assert.equal(entry.customDurationPaidOnly, false);
  }
  assert.ok(stiff.params.every((entry) => entry.status === "development" && !entry.paidOnly));
  assert.match(stiff.platformNote, /proposed|current SDK/i);
});

test("wrist aliases, waist timeouts and torque admission retain distinct semantics", () => {
  assert.match(byName.get("adjust_wrist").summary, /right.wrist.*alias/i);
  for (const name of ["adjust_right_wrist", "adjust_left_wrist", "adjust_wrist"]) {
    assert.equal(forms(byName.get(name)).length, 11);
    assert.ok(byName.get(name).profiles.every((entry) => !entry.customDurationSyntax));
  }
  for (const name of ["adjust_waist", "return_waist_to_neutral", "undo_waist"]) {
    assert.ok(byName.get(name)?.profiles.filter((entry) => entry.customDurationSyntax)
      .every((entry) => entry.customDurationLabel === "Custom maximum duration"));
  }
  assert.match(byName.get("adjust_waist").params.find((entry) => entry.name === "expected_start_degrees")?.description ?? "", /dry.run.*does not validate/i);
  const torque = byName.get("adjust_elbow").params.find((entry) => entry.name === "torque");
  assert.match(torque.description, /feedforward.*N·m/i);
  assert.equal(torque.paidOnly, undefined);
  assert.equal(byName.get("adjust_elbow").params.find((entry) => entry.name === "speed").paidOnly, undefined);
  assert.deepEqual(masterSetupParams, [], "controller setup stays outside customer command examples");
});

test("related restoration and head cards preserve return, aliases and posture selection", () => {
  assert.equal(forms(byName.get("restore_stand_hand_guide")).length, 2);
  assert.equal(forms(byName.get("restore_stand_default")).length, 1);
  for (const name of ["turn_head", "return_head_to_center", "center_head", "shake_head", "get_status", "action_catalog"]) {
    assert.ok(byName.has(name), name);
  }
  assert.match(byName.get("center_head").summary, /alias/);
  for (const name of ["turn_head", "return_head_to_center", "center_head", "shake_head"]) {
    assert.ok(byName.get(name).profiles.some((entry) => entry.syntax.includes('posture="stand"')));
    assert.ok(byName.get(name).profiles.some((entry) => entry.syntax.includes('posture="sit"') && entry.status === "development"));
  }
});

test("copyable examples and profile syntax parse with the audited SDK call signatures", () => {
  const examples = masterDocumentationFunctions.filter((item) => item.category !== "Actions")
    .flatMap((item) => [item.example, ...forms(item)]);
  canonicalPython(examples);
});

test("every displayed Master profile, configuration and example passes the actual offline SDK audit", () => {
  const sdkRoot = path.resolve(process.env.MASTER_SDK_ROOT ?? "../agentech_sdk");
  const result = spawnSync(process.execPath, ["scripts/audit-master-sdk-profiles.mjs", sdkRoot, "--json"], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.filter((row) => row.sourceKind === "profile").length,
    masterWebsiteFunctions.reduce((count, item) => count + forms(item).length, 0),
    "audit every default and custom-duration profile");
  assert.equal(rows.filter((row) => row.sourceKind === "configuration").length,
    masterWebsiteFunctions.reduce((count, item) => count + (item.configurations?.length ?? 0), 0),
    "audit every displayed action configuration");
  assert.ok(masterWebsiteFunctions.every((item) => rows.some((row) => row.function === item.name && row.sourceKind === "example")),
    "audit copyable examples on every displayed function");
  const rejected = rows.filter((row) => row.outcome === "rejected");
  assert.equal(rejected.length, 0,
    "development labels must not excuse unsupported displayed SDK calls: "
    + [...new Set(rejected.map((row) => row.function))].join(", "));
  assert.ok(rows.every((row) => row.signatureBound), "every displayed call must bind to its SDK method");
  assert.equal(result.status, 0, result.stderr);
});

test("the website retains implemented functions while withholding specifically unavailable profiles", () => {
  assert.ok(Array.isArray(masterWebsiteFunctions));
  const published = new Map(masterWebsiteFunctions.map((item) => [item.name, item]));
  const unavailableStandingHead = ["turn_head", "return_head_to_center", "center_head", "shake_head"];
  for (const name of Object.keys(handoff).filter((name) => name !== "stiff" && !unavailableStandingHead.includes(name))) assert.ok(published.has(name), name);
  for (const name of unavailableStandingHead) assert.ok(!published.has(name), "withhold the unimplemented standing head controller: " + name);
  const currentStiff = published.get("stiff");
  assert.ok(currentStiff, "retain the implemented stiffness API");
  assert.equal(forms(currentStiff).length, 3);
  assert.deepEqual(currentStiff.params.map((entry) => entry.name), ["level"]);
  assert.deepEqual(forms(currentStiff), ['Agentech.stiff(level="hard")', 'Agentech.stiff(level="medium")', 'Agentech.stiff(level="soft")']);
  assert.equal(currentStiff.signature, 'Agentech.stiff(level="hard")');
  assert.doesNotMatch(currentStiff.example, /operator_ready|mechanically_supported|preflight|True|False/);
  assert.ok(forms(currentStiff).every((syntax) => !/\b(?:side|duration_seconds)\s*=/.test(syntax)));
  assert.equal(forms(published.get("adjust_upper_body")).length, 4);
  for (const item of masterWebsiteFunctions) {
    assert.ok(item.profiles?.every((entry) => entry.status !== "development") ?? true);
  }
  for (const name of ["move_arms_to", "move_mirrored_arms_to"]) {
    assert.match(published.get(name).platformNote, /joint.*limits/);
    assert.match(published.get(name).platformNote, /elbow.*zero/i);
  }
});

test("every Master profile uses x inputs while preserving named mapping keys and fixed choices", () => {
  assert.equal(typeof masterProfileDisplaySyntax, "function");
  const displayedForms = [];
  for (const item of masterWebsiteFunctions) {
    for (const source of forms(item)) {
      const displayed = masterProfileDisplaySyntax(source);
      assert.doesNotMatch(displayed, /\b(?:delta|target|duration|max_duration|cycle_count|pause|[a-z_]+_(?:delta|deltas|target|targets|start))\b/);
      assert.doesNotMatch(displayed, /=\s*(?:torque|speed|targets|movement)\b/);
      displayedForms.push(displayed);
    }
  }
  canonicalPython(displayedForms);
  assert.equal(masterProfileDisplaySyntax('Agentech.adjust_right_elbow(degrees=delta, torque=-torque)'), 'Agentech.adjust_right_elbow(degrees=x, torque=-x)');
  assert.equal(masterProfileDisplaySyntax('Agentech.move_arms_to(right={"elbow": target})'), 'Agentech.move_arms_to(right={"elbow": x})');
  assert.equal(masterProfileDisplaySyntax('Agentech.stiff(level="hard")'), 'Agentech.stiff(level="hard")');
});

test("elbow torque ranges are visible while explanations stay inside the disclosure", () => {
  for (const [name, joint] of [["adjust_right_elbow", "Right elbow"], ["adjust_left_elbow", "Left elbow"], ["adjust_elbow", "Right and left elbows"]]) {
    const torque = masterWebsiteFunctions.find((item) => item.name === name).params.find((entry) => entry.name === "torque");
    assert.equal(torque.allowedRange, "-24 to +24 N·m", `${name}: show the SDK input range directly`);
    assert.doesNotMatch(torque.description, /-24 to \+24/, "avoid repeating the range in its explanation");
    assert.doesNotMatch(torque.description, /legacy|wrapper/i);
    assert.ok(torque.description.includes(joint));
    assert.doesNotMatch(torque.description, /owner|ceiling|planning_torque_budget/, "keep controller configuration out of the parameter explanation");
  }
});

test("current torque variables appear without development labels on every other adjustment family", () => {
  const currentNames = ["adjust_both_elbows", "adjust_left_shoulder", "adjust_right_shoulder", "adjust_left_wrist", "adjust_right_wrist", "adjust_wrist", "adjust_waist", "adjust_upper_body"];
  for (const name of currentNames) {
    const item = masterWebsiteFunctions.find((entry) => entry.name === name);
    const torque = item.params.find((entry) => entry.name === "torque");
    assert.ok(torque, `${name}: torque must be a variable`);
    assert.equal(torque.status, "available", `${name}: current contract is implemented`);
    assert.equal(torque.allowedRange, name.includes("wrist")
      ? "Yaw: -24 to +24; pitch/roll: -2.2 to +2.2 N·m"
      : name === "adjust_waist" ? "-24 to +24 N·m (planning only)"
        : name === "adjust_upper_body" ? "Shoulder, elbow, wrist yaw: -24 to +24 N·m; Wrist pitch/roll: -2.2 to +2.2 N·m"
          : name === "adjust_both_elbows" ? "-24 to +24 N·m per elbow" : "-24 to +24 N·m");
    assert.ok(item.profiles.every((entry) => entry.status !== "development"));
    assert.ok(forms(item).every((syntax) => name === "adjust_waist" ? !/\btorque=/.test(syntax) : /\btorque=/.test(syntax)));
    assert.equal(item.example, byName.get(name).example, "retain the current copyable movement example");
    assert.ok(byName.get(name).params.some((entry) => entry.name === "torque"), "current catalog includes the audited torque keyword");
  }
  const waist = forms(masterWebsiteFunctions.find((entry) => entry.name === "adjust_waist"));
  assert.ok(waist.every((syntax) => !/torque=/.test(syntax)), "normal waist profiles do not request unsupported live effort");
  canonicalPython(currentNames.flatMap((name) => forms(masterWebsiteFunctions.find((entry) => entry.name === name))));
});

test("native joint effort entries match the captured installed model, separately from SDK additions", () => {
  const { masterNativeModelEffort } = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-sdk-documentation.ts");
  const evidence = JSON.parse(readFileSync(new URL("./fixtures/master-native-model-effort.json", import.meta.url), "utf8"));
  assert.ok(masterNativeModelEffort);
  assert.deepEqual(masterNativeModelEffort, evidence.maxEffortNm);
  assert.equal(masterNativeModelEffort.right_shoulder_pitch_joint, 36);
  assert.equal(masterNativeModelEffort.right_elbow_joint, 24);
  assert.equal(masterNativeModelEffort.right_wrist_pitch_joint, 4.8);
  assert.equal(masterNativeModelEffort.waist_yaw_joint, 120);
  assert.equal(masterNativeModelEffort.head_yaw_joint, 2.6);
});

test("every joint-adjustment card references all of its own native joint torque ranges", () => {
  const { masterJointTorqueReference } = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-joint-torque-reference.ts");
  const evidence = JSON.parse(readFileSync(new URL("./fixtures/master-native-model-effort.json", import.meta.url), "utf8"));
  const armJoints = (side) => ["shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"].map((joint) => `${side}_${joint}_joint`);
  const bothArms = [...armJoints("left"), ...armJoints("right")];
  const waistJoints = ["waist_yaw_joint", "waist_pitch_joint", "waist_roll_joint"];
  const elbowJoints = ["left_elbow_joint", "right_elbow_joint"];
  const expectedJoints = {
    adjust_right_elbow: ["right_elbow_joint"],
    adjust_left_elbow: ["left_elbow_joint"],
    adjust_both_elbows: elbowJoints,
    adjust_elbow: elbowJoints,
    move_elbows_to: elbowJoints,
    adjust_right_shoulder: armJoints("right").slice(0, 3),
    adjust_left_shoulder: armJoints("left").slice(0, 3),
    adjust_right_wrist: armJoints("right").slice(4),
    adjust_left_wrist: armJoints("left").slice(4),
    adjust_wrist: armJoints("right").slice(4),
    adjust_waist: waistJoints,
    return_waist_to_neutral: waistJoints,
    undo_waist: waistJoints,
    adjust_upper_body: [...waistJoints, ...bothArms],
    move_arms_to: bothArms,
    mirror_arm_pose: bothArms,
    move_mirrored_arms_to: bothArms,
    plan_upper_body_torque_assist: [...bothArms, ...waistJoints],
  };
  const torqueInputFunctions = new Set(["adjust_right_elbow", "adjust_left_elbow", "adjust_elbow", "adjust_both_elbows", "adjust_left_shoulder", "adjust_right_shoulder", "adjust_left_wrist", "adjust_right_wrist", "adjust_wrist", "adjust_waist", "adjust_upper_body"]);
  const adjustmentCards = masterWebsiteFunctions.filter((item) => item.category === "Joint Adjustments");
  assert.deepEqual(adjustmentCards.map((item) => item.name).sort(), Object.keys(expectedJoints).sort());
  for (const [name, joints] of Object.entries(expectedJoints)) {
    const rows = masterJointTorqueReference(name);
    assert.deepEqual(rows.map((row) => row.joint).sort(), [...joints].sort(), `${name}: correct joints without omissions or duplicates`);
    for (const row of rows) {
      assert.equal(row.maxEffortNm, evidence.maxEffortNm[row.joint], `${name}: ${row.joint} must match captured native model`);
      assert.equal(typeof row.label, "string", `${name}: ${row.joint} needs a readable label`);
      assert.ok(row.label.trim().length > 0, `${name}: ${row.joint} label must not be blank`);
      const expectedRange = row.joint.endsWith("wrist_pitch_joint") || row.joint.endsWith("wrist_roll_joint") ? "-2.2 to +2.2 N·m" : "-24 to +24 N·m";
      assert.equal(row.additionalTorqueInputRange, torqueInputFunctions.has(name) ? expectedRange : null, `${name}: request ceiling matches the callable keyword separately from native effort`);
    }
  }
  assert.deepEqual(masterJointTorqueReference("get_status"), []);
});

test("the existing SDK card renderer includes the per-function joint torque reference", () => {
  const renderer = readFileSync(new URL("../features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx", import.meta.url), "utf8");
  assert.ok(/import[\s\S]*?masterJointTorqueReference[\s\S]*?from\s+["'][^"']*master-joint-torque-reference["']/.test(renderer), "renderer imports the per-function torque reference");
  assert.ok(/masterJointTorqueReference\(item\.name\)/.test(renderer), "renderer resolves the active card's own joints");
  assert.ok(/data-sdk-function-joint-torque/.test(renderer), "renderer exposes the per-card torque reference hook");
});

test("all-joint torque planning profiles cover every arm and waist joint", () => {
  const item = masterWebsiteFunctions.find((entry) => entry.name === "plan_upper_body_torque_assist");
  assert.ok(item, "the newer all-joint torque planner must be visible");
  assert.equal(forms(item).length, 22, "17 individual joints and five complete-group forms");
  const evidence = JSON.parse(readFileSync(new URL("./fixtures/master-native-model-effort.json", import.meta.url), "utf8"));
  for (const joint of Object.keys(evidence.maxEffortNm).filter((joint) => !joint.startsWith("head_"))) {
    assert.ok(forms(item).some((source) => source.includes('"' + joint + '"')), joint);
  }
  assert.match(item.example, /"left_elbow_joint": 20/);
  assert.match(item.platformNote, /offline/i);
  assert.match(item.platformNote, /20/);
  assert.match(item.platformNote, /4\.8/);
  assert.ok(item.params.every((entry) => !entry.paidOnly), "offline torque planning adds no paid timing choice");
  for (const name of ["adjust_left_shoulder", "adjust_right_shoulder", "adjust_left_wrist", "adjust_right_wrist", "adjust_waist"]) {
    assert.ok(byName.get(name).params.some((entry) => entry.name === "torque"), `${name}: include the current callable signature`);
  }
});
