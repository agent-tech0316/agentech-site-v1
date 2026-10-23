import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const root = "features/eaic/02-unified-api/";
const rawEntry = 'Agentech.enter_stand_hand_guide(side="both")';
const inRawMode = code => `${rawEntry}\n${code}`;

test("Master supports preferred explicit bilateral raw-mode entry and runtime automatic entry when omitted", () => {
  const { checkMasterExecutionCode, masterExecutionStarterCode } = loadTypeScriptModule(`${root}projects-validation/master-execution-contract.ts`);
  const move = 'Agentech.adjust_both_elbows(degrees=5)';
  assert.equal(checkMasterExecutionCode(move).status, "PASS");
  assert.equal(checkMasterExecutionCode(inRawMode(move)).status, "PASS");
  for (const source of [
    `Agentech.enter_stand_hand_guide(side="right")\n${move}`,
    `Agentech.enter_stand_hand_guide()\n${move}`,
  ]) assert.equal(checkMasterExecutionCode(source).status, "FAIL", source);
  for (const source of [
    `${rawEntry}\n${rawEntry}\n${move}`,
    `${rawEntry}\nAgentech.restore_stand_hand_guide()\n${move}`,
    `${rawEntry}\nAgentech.restore_stand_default()\n${move}`,
  ]) assert.equal(checkMasterExecutionCode(source).status, "PASS", source);
  assert.equal(checkMasterExecutionCode(`${rawEntry}\nAgentech.restore_stand_hand_guide()\n${rawEntry}\n${move}`).status, "PASS");
  assert.equal(checkMasterExecutionCode(`${rawEntry}\nAgentech.return_waist_to_neutral()\n${move}`).status, "PASS");
  assert.match(masterExecutionStarterCode, /enter_stand_hand_guide\(side="both"\)/);
  assert.match(masterExecutionStarterCode, /adjust_both_elbows/);
  assert.match(masterExecutionStarterCode, /adjust_waist/);
  assert.equal(checkMasterExecutionCode(masterExecutionStarterCode).status, "PASS");
  const unavailable = checkMasterExecutionCode('Agentech.movement_a()');
  assert.equal(unavailable.status, "FAIL");
  assert.match(unavailable.findings[0].message, /unavailable for scheduled live execution/);
});

test("normal product model selection accepts Master and preserves Navi/Aegis", () => {
  const { normalizeAgentechRobotModel, robotModelOptions } = loadTypeScriptModule(`${root}resources-runs/agentech-robot-model.ts`);
  assert.equal(normalizeAgentechRobotModel(" master "), "Master");
  assert.equal(normalizeAgentechRobotModel("aegis"), "Aegies");
  assert.equal(normalizeAgentechRobotModel("Navi"), "Navi");
  assert.ok(robotModelOptions.includes("Master"));
});

test("Master upper-body certification accepts SDK literals and rejects executable Python and base control", () => {
  const { checkAgentechSoftware } = loadTypeScriptModule(`${root}projects-validation/agentech-validation.ts`);
  const source = `from agentech import Agentech\nAgentech.use("master")\n${rawEntry}\nAgentech.adjust_right_shoulder(axis="pitch", degrees=-5, duration_seconds=1.0)\nAgentech.adjust_right_wrist(yaw=5, torque={"yaw": 1})`;
  assert.equal(checkAgentechSoftware(source, "Master").status, "PASS");
  for (const code of [
    'Agentech.forward()', 'Agentech.walk_forward()',
    'Agentech.adjust_upper_body(legs={"pitch": 5})',
    'Agentech.adjust_right_elbow(degrees=value)',
    'for i in range(2):\n Agentech.adjust_right_elbow(degrees=5)',
    'Agentech.adjust_right_elbow(degrees=5); print("hello")',
    'Agentech.use("master", host="somewhere")\nAgentech.adjust_right_elbow(degrees=5)',
    'Agentech.adjust_right_elbow(degrees=5, degrees=10)',
    'Agentech.adjust_right_wrist(yaw=5, torque={"leg": 1})',
  ]) assert.equal(checkAgentechSoftware(inRawMode(code), "Master").status, "FAIL", code);
});

test("Master arm maps and positional SDK profiles use the same strict command contract", () => {
  const { checkAgentechSoftware } = loadTypeScriptModule(`${root}projects-validation/agentech-validation.ts`);
  for (const code of [
    'Agentech.adjust_right_elbow(5, duration_seconds=2.0)',
    'Agentech.adjust_right_shoulder("yaw", 5)',
    'Agentech.adjust_upper_body(right_arm={"elbow": 5, "wrist_yaw": 2})',
    'Agentech.adjust_waist(yaw=5)',
    'Agentech.adjust_upper_body(waist={"yaw": 5})',
    'Agentech.adjust_upper_body(\n right_arm={"elbow": 5},\n waist={"yaw": 2}\n)',
  ]) assert.equal(checkAgentechSoftware(inRawMode(code), "Master").status, "PASS", code);
  assert.equal(checkAgentechSoftware(inRawMode('Agentech.adjust_upper_body(right_arm={"leg": 5})'), "Master").status, "FAIL");
  assert.equal(checkAgentechSoftware(inRawMode('Agentech.adjust_upper_body(right_arm={"elbow": 5}, both_elbows=2)'), "Master").status, "FAIL");
  assert.equal(checkAgentechSoftware(inRawMode('Agentech.move_mirrored_arms_to(targets={"elbow": 10})'), "Master").status, "FAIL");
});

function loadRoute(relativePath, mocks = {}) {
  const filename = path.resolve(relativePath);
  const nativeRequire = createRequire(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }, fileName: filename }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith("@/")) return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
    return nativeRequire(specifier);
  };
  new Function("require", "module", "exports", output)(require, module, module.exports);
  return module.exports;
}

test("real booking POST pins normal Master custom code and does not charge when gateway is unavailable", async () => {
  const email = "developer@agent-tech.ai";
  const calls = [];
  const account = { email, first_name: "Developer", developer_latest_code_submission_id: "master-reviewed-1" };
  let approved = true;
  let signedIn = email;
  let runMode = "Software check";
  const { POST } = loadRoute("app/api/robot-slot/route.ts", {
    "@/lib/server-account-session": { getServerAccountEmail: async () => signedIn },
    "@/lib/email": { sendEmail: async () => ({ sent: true }) },
    "@/lib/account-records": {
      getAccountRecord: async () => account,
      allocateCreditSpend: () => ({ rechargeRequired: false }),
      getAccessProfiles: async () => [{ id: 1, username: "developer", profile_type: "developer" }],
      getCodeSubmissionRecord: async () => ({ id: "master-reviewed-1", robot_model: "Master", run_mode: runMode, code: inRawMode('Agentech.adjust_waist(yaw=5)'), physical_safety_status: "passed", ai_security_status: approved ? "passed" : "locked" }),
      findRobotSessionConflict: async () => null,
      spendAccountCredits: async () => { calls.push("charge"); return { rechargeRequired: false }; },
      createRobotSession: async (input) => { calls.push(input); return { id: 42, ...input }; },
    },
  });
  const time = new Date(Date.now() + 3_600_000); time.setUTCMinutes(Math.ceil(time.getUTCMinutes() / 5) * 5, 0, 0);
  const request = { json: async () => ({ email, profileId: 1, scheduledStart: time.toISOString(), durationMinutes: 5, robotModel: "Master", requestedRunType: "custom_code", timeZone: "America/Los_Angeles" }) };
  const saved = [process.env.AGENTECH_MASTER_EXECUTION_ENABLED, process.env.AGENTECH_MASTER_GATEWAY_PROTOCOL];
  try {
    delete process.env.AGENTECH_MASTER_EXECUTION_ENABLED;
    delete process.env.AGENTECH_MASTER_GATEWAY_PROTOCOL;
    const unavailable = await POST(request);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.errorCode, "MASTER_GATEWAY_NOT_CONFIGURED");
    assert.deepEqual(calls, []);
    process.env.AGENTECH_MASTER_EXECUTION_ENABLED = "true";
    process.env.AGENTECH_MASTER_GATEWAY_PROTOCOL = "master-arm-session-v1";
    approved = false;
    assert.equal((await POST(request)).status, 403);
    assert.deepEqual(calls, []);
    approved = true; signedIn = "other@agent-tech.ai";
    assert.equal((await POST(request)).status, 403);
    signedIn = email;
    runMode = "Master live stream test (view only)";
    const viewOnly = await POST(request);
    assert.equal(viewOnly.status, 403);
    assert.equal(viewOnly.body.errorCode, "MASTER_VIEW_ONLY_AUDIT");
    assert.deepEqual(calls, []);
    runMode = "Software check";
    const booked = await POST(request);
    assert.equal(booked.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].robotModel, "Master");
    assert.equal(calls[0].approvedRunType, "custom_code");
    assert.equal(calls[0].codeSubmissionId, "master-reviewed-1");
    assert.notEqual(calls[0].presetDemo, "Master live stream test (view only)");
  } finally {
    for (const [index, key] of ["AGENTECH_MASTER_EXECUTION_ENABLED", "AGENTECH_MASTER_GATEWAY_PROTOCOL"].entries()) {
      if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index];
    }
  }
});

test("real Master code submission persists the normal review gate with explicit static-only evidence", async () => {
  const persisted = [];
  const { POST } = loadRoute("app/api/agentech-code-submit/route.ts", {
    fs: { promises: { mkdir: async () => {}, writeFile: async () => {} } },
    "@/lib/server-account-session": { getServerAccountEmail: async () => "developer@agent-tech.ai" },
    "@/lib/agentech-ai-review": { runAgentechAiCodeReview: async () => { throw new Error("Physical/static stage cannot invoke software review."); } },
    "@/lib/premium-features": { getReturnToHomeAccess: async () => ({ allowed: false }), RETURN_TO_HOME_FEATURE_CODE: "return-home" },
    "@/lib/account-records": {
      getAccountRecord: async () => ({ email: "developer@agent-tech.ai" }),
      createCodeSubmissionRecord: async input => { persisted.push(input); return input; },
      markDeveloperReviewGateOnAccount: async input => { persisted.push(input); },
    },
  });
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const result = await POST({ json: async () => ({ robotModel: "Master", reviewStage: "physical", runMode: "Software check", code: inRawMode('Agentech.adjust_waist(yaw=5)') }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.physicalSafetyStatus, "passed");
    assert.equal(result.body.validationKind, "master_upper_body_static_contract");
    assert.equal(result.body.physicalQualified, false);
    assert.equal(result.body.runtimeChecksRequired, true);
    assert.equal(persisted[0].robotModel, "Master");
    assert.equal(persisted[1].aiSecurityStatus, "locked");
  } finally { if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv; }
});

test("Master simulate endpoint never routes to Aegis or invents a MuJoCo pass", async () => {
  const { POST } = loadRoute("app/api/agentech-simulate/route.ts", {
    "node:child_process": { spawn: () => { throw new Error("Simulator process must not start for Master."); } },
  });
  const valid = await POST({ json: async () => ({ robotModel: "Master", code: inRawMode('Agentech.adjust_waist(yaw=5)') }) });
  assert.equal(valid.status, 422);
  assert.equal(valid.body.errorCode, "MASTER_SIMULATION_UNAVAILABLE");
  assert.equal(valid.body.staticValidationPassed, true);
  assert.equal(valid.body.simulationPassed, false);
  assert.equal(valid.body.physicalQualified, false);
  const invalid = await POST({ json: async () => ({ robotModel: "Master", code: 'Agentech.forward()' }) });
  assert.equal(invalid.status, 400);
});

test("Master movement check describes static validation without claiming simulated or physical success", () => {
  const { evaluateAgentechMovementSafety } = loadTypeScriptModule("lib/agentech-motion-safety.ts");
  const result = evaluateAgentechMovementSafety(inRawMode('Agentech.adjust_right_elbow(degrees=5)'), "Master");
  assert.equal(result.submitReady, true);
  assert.equal(result.validationKind, "master_upper_body_static_contract");
  assert.equal(result.physicalQualified, false);
  assert.equal(result.runtimeChecksRequired, true);
  assert.doesNotMatch(result.detail, /2m x 2m|MuJoCo.*pass/i);
  assert.equal(evaluateAgentechMovementSafety('Agentech.forward()', "Master").submitReady, false);
});

test("Master booking requires deployment contract and rechecks the saved approved program", () => {
  const { masterBookingBlocker } = loadTypeScriptModule("lib/master-booking-policy.ts");
  const code = inRawMode('Agentech.adjust_right_elbow(degrees=5)');
  assert.equal(masterBookingBlocker(code, {}).errorCode, "MASTER_GATEWAY_NOT_CONFIGURED");
  const config = { AGENTECH_MASTER_EXECUTION_ENABLED: "true", AGENTECH_MASTER_GATEWAY_PROTOCOL: "master-arm-session-v1" };
  assert.equal(masterBookingBlocker(code, config), null);
  assert.equal(masterBookingBlocker('Agentech.forward()', config).errorCode, "MASTER_PROGRAM_INVALID");
  assert.equal(masterBookingBlocker('Agentech.adjust_right_elbow(degrees=5)', config), null);
});

test("normal booking preserves account review and billing gates before creating a Master reservation", () => {
  const route = readFileSync(new URL("../app/api/robot-slot/route.ts", import.meta.url), "utf8");
  assert.match(route, /codeSubmission\.physical_safety_status !== "passed"/);
  assert.match(route, /codeSubmission\.ai_security_status !== "passed"/);
  assert.match(route, /masterBookingBlocker\(codeSubmission\.code, process\.env\)/);
  assert.ok(route.indexOf("masterBookingBlocker(codeSubmission.code") < route.indexOf("creditSpend = await spendAccountCredits"));
  assert.match(route, /codeSubmissionId: codeSubmission\.id/);
});
