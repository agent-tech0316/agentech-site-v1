import assert from "node:assert/strict";
import test from "node:test";

import { handleMasterLiveTest, handleMasterLiveTestStatus } from "../lib/master-live-test-handler.ts";

const victoria = "victoria_c@agent-tech.ai";
const now = new Date("2026-08-11T18:00:00.000Z");

function storedSubmission(overrides = {}) {
  return {
    id: "master-live-test-audit-1",
    email: victoria,
    developer_name: "Victoria Master live test",
    robot_model: "Master",
    run_mode: "Master live stream test (view only)",
    source: "pasted_code",
    uploaded_file_name: null,
    github_repo_url: null,
    github_branch: null,
    commands: [],
    code: "this is arbitrary text, not robot code",
    physical_safety_status: "passed",
    ai_security_status: "locked",
    ai_security_model: null,
    ai_security_summary: null,
    ai_security_findings: [],
    ai_security_risk_level: null,
    ai_security_reviewed_at: null,
    credits_charged: 0,
    created_at: "2026-08-11T18:00:00.000Z",
    updated_at: "2026-08-11T18:00:00.000Z",
    ...overrides,
  };
}

function robotSession(overrides = {}) {
  return {
    id: 501,
    email: victoria,
    robot_model: "Master",
    scheduled_start: "2026-08-11T18:00:00.000Z",
    scheduled_end: "2026-08-11T18:03:00.000Z",
    session_status: "requested",
    requested_run_type: "preset_demo",
    approved_run_type: "preset_demo",
    preset_demo: "Master live stream test (view only)",
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    getAccount: async () => ({ email: victoria }),
    listSubmissions: async () => [],
    createSubmission: async (input) => storedSubmission({
      id: input.id,
      code: input.code,
      source: input.source,
      uploaded_file_name: input.uploadedFileName,
    }),
    ensureSession: async () => ({ session: robotSession(), reused: false }),
    updateSubmission: async (id, body) => storedSubmission({ id, ...body }),
    createSubmissionId: () => "master-live-test-audit-1",
    ...overrides,
  };
}

test("an unsigned request is rejected before any account lookup", async () => {
  let accountLookups = 0;
  const result = await handleMasterLiveTest({ email: "", payload: {}, now }, dependencies({
    getAccount: async () => { accountLookups += 1; return null; },
  }));

  assert.equal(result.status, 401);
  assert.equal(accountLookups, 0);
});

test("a signed account other than Victoria is forbidden before persistence", async () => {
  let created = false;
  const result = await handleMasterLiveTest({ email: "other@agent-tech.ai", payload: { code: "anything" }, now }, dependencies({
    createSubmission: async () => { created = true; return storedSubmission(); },
  }));

  assert.equal(result.status, 403);
  assert.equal(created, false);
});

test("Victoria's arbitrary input is approved only as a zero-command view-only audit without changing shared Aegies or Navi gates", async () => {
  const arbitraryText = "rm -rf /\nAgentech.forward(999)\njust words";
  let createInput = null;
  let updateBody = null;
  let sharedGateWrites = 0;
  const result = await handleMasterLiveTest({
    email: "  VICTORIA_C@AGENT-TECH.AI ",
    payload: { code: arbitraryText, uploadedFileName: "notes.txt" },
    now,
  }, dependencies({
    createSubmission: async (input) => {
      createInput = input;
      return storedSubmission({ id: input.id, code: input.code });
    },
    updateSubmission: async (id, body) => {
      updateBody = { id, ...body };
      return storedSubmission({ id, ...body });
    },
    markAccountGate: async () => { sharedGateWrites += 1; },
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.viewOnly, true);
  assert.equal(result.body.robotModel, "Master");
  assert.equal(result.body.expiresAt, "2026-08-11T18:03:00.000Z");
  assert.deepEqual(createInput.commands, []);
  assert.equal(createInput.code, arbitraryText);
  assert.equal(createInput.robotModel, "Master");
  assert.equal(createInput.runMode, "Master live stream test (view only)");
  assert.equal(updateBody.physical_safety_status, "passed");
  assert.equal(updateBody.ai_security_status, "passed");
  assert.match(updateBody.ai_security_summary, /view-only, not executable/i);
  assert.equal(sharedGateWrites, 0);
});

test("a locked Master audit is reused after a retry instead of being duplicated", async () => {
  const existing = storedSubmission({ id: "existing-locked-audit" });
  let creates = 0;
  const result = await handleMasterLiveTest({ email: victoria, payload: { code: existing.code }, now }, dependencies({
    listSubmissions: async () => [storedSubmission({ id: "wrong-model", robot_model: "Aegies" }), existing],
    createSubmission: async () => { creates += 1; return storedSubmission(); },
    ensureSession: async () => ({ session: robotSession({ id: 777 }), reused: true }),
  }));

  assert.equal(result.status, 200);
  assert.equal(result.body.submissionId, "existing-locked-audit");
  assert.equal(result.body.reusedSession, true);
  assert.equal(creates, 0);
});

test("a session conflict relocks the approved audit and reports 409", async () => {
  const statuses = [];
  const conflict = new Error("Another active robot session overlaps this 3-minute Master test.");
  conflict.name = "MasterLiveTestConflictError";
  const result = await handleMasterLiveTest({ email: victoria, payload: { code: "test" }, now }, dependencies({
    ensureSession: async () => { throw conflict; },
    updateSubmission: async (id, body) => {
      statuses.push(body.ai_security_status);
      return storedSubmission({ id, ...body });
    },
  }));

  assert.equal(result.status, 409);
  assert.equal(result.body.error, conflict.message);
  assert.deepEqual(statuses, ["passed", "locked"]);
});

test("approval persistence completes before reservation so a failed approval cannot delete any session", async () => {
  const updates = [];
  let reservations = 0;
  const result = await handleMasterLiveTest({ email: victoria, payload: { code: "test" }, now }, dependencies({
    ensureSession: async () => {
      reservations += 1;
      return { session: robotSession(), reused: false };
    },
    updateSubmission: async (id, body) => {
      updates.push({ id, body });
      if (body.ai_security_status === "passed") throw new Error("approval write failed");
      return storedSubmission({ id, ...body });
    },
  }));

  assert.equal(result.status, 500);
  assert.equal(reservations, 0);
  assert.equal(updates.at(-1).body.ai_security_status, "locked");
});

test("Master status returns its own latest audit without reading the shared Aegies or Navi pointer", async () => {
  const masterAudit = storedSubmission({ id: "master-audit-status", ai_security_status: "passed" });
  const result = await handleMasterLiveTestStatus({ email: victoria }, {
    listSubmissions: async () => [storedSubmission({ id: "aegies-audit", robot_model: "Aegies" }), masterAudit],
    getActiveSession: async () => ({
      id: 501,
      robotModel: "Master",
      approvedRunType: "preset_demo",
      presetDemo: "Master live stream test (view only)",
      codeSubmissionId: null,
      status: "requested",
      scheduledStart: "2026-08-11T18:00:00.000Z",
      scheduledEnd: "2026-08-11T18:30:00.000Z",
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.latestAudit.id, "master-audit-status");
  assert.equal(result.body.activeSession.robotModel, "Master");
});

test("Master camera-test status never treats a normal custom-code booking as the camera test", async () => {
  for (const approvedRunType of ["custom_code", undefined]) {
    const result = await handleMasterLiveTestStatus({ email: victoria }, {
      listSubmissions: async () => [storedSubmission({ ai_security_status: "passed" })],
      getActiveSession: async () => ({ id: 502, robotModel: "Master", approvedRunType,
        presetDemo: "Master live stream test (view only)", codeSubmissionId: "normal-submission",
        status: "running", scheduledStart: now.toISOString(), scheduledEnd: "2026-08-11T18:30:00.000Z" }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.activeSession, null);
  }
});

test("Master status fails closed when the current live session belongs to another robot", async () => {
  const result = await handleMasterLiveTestStatus({ email: victoria }, {
    listSubmissions: async () => [storedSubmission({ ai_security_status: "passed" })],
    getActiveSession: async () => ({
      id: 88,
      robotModel: "Aegies",
      status: "requested",
      scheduledStart: "2026-08-11T18:00:00.000Z",
      scheduledEnd: "2026-08-11T18:30:00.000Z",
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.activeSession, null);
});
