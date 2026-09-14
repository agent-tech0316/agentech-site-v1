import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = process.cwd();
const require = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTypeScriptModule(relativePath) {
  const filename = path.join(repositoryRoot, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(filename, module);
  const localRequire = (request) => {
    if (!request.startsWith(".")) return require(request);
    const resolved = path.resolve(path.dirname(filename), request);
    const resolvedTypeScript = resolved.endsWith(".ts") ? resolved : `${resolved}.ts`;
    return loadTypeScriptModule(path.relative(repositoryRoot, resolvedTypeScript));
  };
  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    module.exports,
    localRequire,
    module,
    filename,
    path.dirname(filename)
  );
  return module.exports;
}

const jointData = loadTypeScriptModule("lib/master-robot-joint-data.ts");
const motorMap = loadTypeScriptModule("lib/master-motor-map.ts");

test("Master motor map covers the 16 customer-facing arm and head joints exactly once", () => {
  const runtimeJointNames = new Set(
    jointData.RUNTIME_X2_LIMIT_GROUPS
      .filter((group) => group.label.includes("arm") || group.label === "Head")
      .flatMap((group) => group.joints.map((joint) => joint.joint))
  );
  const markerJointNames = motorMap.MASTER_MOTOR_MARKERS.map((marker) => marker.runtimeJoint);

  assert.equal(motorMap.MASTER_MOTOR_MARKERS.length, 16);
  assert.equal(new Set(markerJointNames).size, 16);
  assert.deepEqual(new Set(markerJointNames), runtimeJointNames);
  assert.equal(motorMap.MASTER_MOTOR_MARKERS.filter((marker) => marker.segment === "arm").length, 14);
  assert.equal(motorMap.MASTER_MOTOR_MARKERS.filter((marker) => marker.segment === "leg").length, 0);
  assert.equal(motorMap.MASTER_MOTOR_MARKERS.filter((marker) => marker.segment === "waist").length, 0);
  assert.equal(motorMap.MASTER_MOTOR_MARKERS.filter((marker) => marker.segment === "head").length, 2);
  for (const marker of motorMap.MASTER_MOTOR_MARKERS) {
    assert.ok(marker.positions.front, `${marker.runtimeJoint} is missing its front position`);
    assert.ok(marker.positions.back, `${marker.runtimeJoint} is missing its back position`);
  }
});

test("Master motor map attaches official and runtime limits to every marker", () => {
  for (const marker of motorMap.MASTER_MOTOR_MARKERS) {
    assert.ok(marker.displayName.length > 0, marker.runtimeJoint);
    assert.match(marker.jointNumber, /^J\d$/);
    for (const position of Object.values(marker.positions)) {
      assert.ok(position.xPercent >= 0 && position.xPercent <= 100, marker.runtimeJoint);
      assert.ok(position.yPercent >= 0 && position.yPercent <= 100, marker.runtimeJoint);
    }
    assert.ok(marker.officialLimit.minimumDegrees <= marker.officialLimit.maximumDegrees, marker.runtimeJoint);
    assert.ok(marker.runtimeLimit.minimumRadians <= marker.runtimeLimit.maximumRadians, marker.runtimeJoint);
  }
  assert.equal(jointData.X2_LIMITS_SOURCE_URL, "https://x2-aimdk.agibot.com/zh-cn/latest/about_agibot_X2/joint_name_and_limit.html");
});

test("Master head runtime keys map to the matching published head joints", () => {
  const headPitch = motorMap.MASTER_MOTOR_MARKERS.find((marker) => marker.runtimeJoint === "head_pitch_joint");
  const headYaw = motorMap.MASTER_MOTOR_MARKERS.find((marker) => marker.runtimeJoint === "head_yaw_joint");

  assert.equal(headPitch.displayName, "Head pitch");
  assert.equal(headPitch.jointNumber, "J1");
  assert.deepEqual([headPitch.officialLimit.minimumDegrees, headPitch.officialLimit.maximumDegrees], [0, 0]);
  assert.equal(headYaw.displayName, "Head yaw");
  assert.equal(headYaw.jointNumber, "J2");
  assert.deepEqual([headYaw.officialLimit.minimumDegrees, headYaw.officialLimit.maximumDegrees], [-20, 20]);
});

test("Master markers use clean portrait views and robot-relative left and right", () => {
  for (const marker of motorMap.MASTER_MOTOR_MARKERS) {
    for (const position of Object.values(marker.positions)) {
      assert.ok(position.xPercent >= 0 && position.xPercent <= 100, marker.runtimeJoint);
      assert.ok(position.yPercent >= 0 && position.yPercent <= 100, marker.runtimeJoint);
    }
  }

  const leftShoulder = motorMap.MASTER_MOTOR_MARKERS.find((marker) => marker.runtimeJoint === "left_shoulder_pitch_joint");
  const rightShoulder = motorMap.MASTER_MOTOR_MARKERS.find((marker) => marker.runtimeJoint === "right_shoulder_pitch_joint");
  assert.ok(leftShoulder.positions.front.xPercent > rightShoulder.positions.front.xPercent, "robot left must appear on the viewer's right in the front view");
  assert.ok(leftShoulder.positions.back.xPercent < rightShoulder.positions.back.xPercent, "robot left must appear on the viewer's left in the back view");
});

test("Master marker hit targets do not overlap on the wide diagram", () => {
  for (const view of ["front", "back"]) {
    for (let index = 0; index < motorMap.MASTER_MOTOR_MARKERS.length; index += 1) {
      const marker = motorMap.MASTER_MOTOR_MARKERS[index];
      for (const neighbor of motorMap.MASTER_MOTOR_MARKERS.slice(index + 1)) {
        const horizontal = marker.positions[view].xPercent - neighbor.positions[view].xPercent;
        const vertical = (marker.positions[view].yPercent - neighbor.positions[view].yPercent) * (3 / 2);
        const distance = Math.hypot(horizontal, vertical);
        assert.ok(distance >= 5, `${marker.runtimeJoint} overlaps ${neighbor.runtimeJoint} in ${view}`);
      }
    }
  }
});

test("Master joint markers are compact dots without visible J-number labels", () => {
  const component = fs.readFileSync(
    path.join(repositoryRoot, "features/eaic/01-clients/eaic-hub/components/master-motor-map.tsx"),
    "utf8"
  );

  assert.match(component, /h-\[14px\] w-\[14px\]/);
  assert.doesNotMatch(component, />\s*\{marker\.jointNumber\}\s*<\/button>/);
});

test("Master joint reference uses Manrope instead of a serif font", () => {
  const component = fs.readFileSync(
    path.join(repositoryRoot, "features/eaic/01-clients/eaic-hub/components/master-motor-map.tsx"),
    "utf8"
  );

  assert.doesNotMatch(component, /font-serif/);
  assert.equal(component.match(/font-interface/g)?.length, 3);
});

test("Master motor boxes identify the SDK function for each controllable joint", () => {
  const marker = (name) => motorMap.MASTER_MOTOR_MARKERS.find((candidate) => candidate.runtimeJoint === name);

  assert.equal(marker("right_shoulder_pitch_joint").sdkControl.functionName, "adjust_right_shoulder");
  assert.match(marker("right_shoulder_pitch_joint").sdkControl.example, /"pitch"/);
  assert.equal(marker("right_elbow_joint").sdkControl.functionName, "adjust_right_elbow");
  assert.equal(marker("right_wrist_yaw_joint").sdkControl.functionName, "adjust_right_wrist");
  assert.match(marker("right_wrist_yaw_joint").sdkControl.example, /"yaw"/);
  assert.equal(marker("left_wrist_roll_joint").sdkControl.functionName, "standing_actions.teach");
  assert.match(marker("left_wrist_roll_joint").sdkControl.example, /"left"/);
  assert.equal(marker("head_yaw_joint").sdkControl, null);
});

test("Master motor tooltips hide the teach suffix without changing the SDK mapping", () => {
  const component = fs.readFileSync(
    path.join(repositoryRoot, "features/eaic/01-clients/eaic-hub/components/master-motor-map.tsx"),
    "utf8"
  );

  assert.match(component, /function visibleSdkControlText\(/);
  assert.match(component, /replaceAll\("\.teach", ""\)/);
  assert.equal(
    component.match(/visibleSdkControlText\(activeMarker\.sdkControl\.(?:functionName|example)\)/g)?.length,
    2,
    "both the function label and example must use the suffix-free display value"
  );
  assert.equal(
    motorMap.MASTER_MOTOR_MARKERS.find((candidate) => candidate.runtimeJoint === "left_wrist_roll_joint").sdkControl.functionName,
    "standing_actions.teach",
    "the underlying SDK mapping must remain accurate"
  );
});
