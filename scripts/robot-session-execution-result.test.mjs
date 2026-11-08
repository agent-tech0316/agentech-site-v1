import assert from "node:assert/strict";
import test from "node:test";
import { finalSessionDatabaseStatus } from "./robot-stream-session-policy.mjs";
import {
  buildExecutionResultPatch,
  finishExpiredAdmission,
  publishExpiredAdmission,
  publishTerminalPatch,
  parseExecutionResult,
} from "./robot-session-execution-result.mjs";


const valid = {
  schema_version: 1,
  outcome: "completed",
  session_id: "42",
  submission_id: "submission-test",
  source_sha256: "a".repeat(64),
  plan_sha256: "b".repeat(64),
  command_count: 1,
  completed_count: 1,
  started_at: "2026-08-25T01:00:00.000Z",
  finished_at: "2026-08-25T01:00:01.000Z",
  commands: [{ command_index: 1, name: "stand", status: "completed", args: {}, source_args: {}, line: 2, result: {}, error: null, duration_ms: 1000 }],
  error: null,
};
const expected = {
  sessionId: "42",
  submissionId: "submission-test",
  sourceSha256: "a".repeat(64),
  planSha256: "b".repeat(64),
};

test("a cached Master failure cannot overwrite a reviewed result or its final booking status", async () => {
  const item = {executionModel: "master", executionSubmissionId: "original"};
  const rows = [{id: "108", code_submission_id: "original", session_status: "completed",
    execution_result: {outcome: "completed", reporting_review: {previous_outcome: "failed"}}}];
  const request = async (table, query, {body}) => {
    assert.equal(table, "agentech_robot_sessions");
    const where = new URLSearchParams(query);
    const matches = rows.filter(row => where.get("id") === "eq."+row.id &&
      where.get("code_submission_id") === "eq."+row.code_submission_id &&
      (where.get("execution_result->>reporting_review") !== "is.null" || row.execution_result?.reporting_review == null));
    matches.forEach(row => Object.assign(row, body));
    return matches.map(({id}) => ({id}));
  };
  for (const patch of [{session_status: "failed"}, {execution_result: {outcome: "failed"}}]) {
    assert.equal(await publishTerminalPatch(request, "108", item, patch), false);
  }
  assert.equal(rows[0].session_status, "completed");
  assert.equal(rows[0].execution_result.outcome, "completed");
  rows[0].execution_result = null;
  assert.equal(await publishTerminalPatch(request, "108", item, {session_status: "completed"}), true);
});

const expiredNavi = {
  executionModel: "navi", status: "staged", executionResultRequired: true, executionStatus: "pending",
  executionSubmissionId: "reviewed-navi", start: "2026-11-05T20:10:00Z", end: "2026-11-05T20:15:00Z",
  endCleanupRequired: true, endCleanupStatus: "pending", endCleanupAttempts: 0,
  launchBlockedReason: "Navi live readiness check failed: Command failed: python --check-home-ready\nTraceback (most recent call last):\nRuntimeError: Healthy lowered/damped terminal posture is not verified",
  streamAvailableDuringSession: true,
};
const expiry = Date.parse(expiredNavi.end);
const undefinedPath = 'MissingOrInvalidExecutionResult: The "path" argument must be of type string or an instance of Buffer or URL. Received undefined';

test("expired staged Navi booking retains readiness refusal and delivery without receipt or cleanup", () => {
  const item = {...expiredNavi};
  assert.equal(finishExpiredAdmission(item, expiry - 1), false);
  assert.equal(finishExpiredAdmission(item, expiry), true);
  assert.match(item.executionResultError, /0 commands dispatched.*Healthy lowered\/damped terminal posture is not verified/);
  assert.doesNotMatch(item.executionResultError, /Traceback|undefined/);
  assert.equal(item.executionResult, null);
  assert.equal(item.endCleanupRequired, false);
  assert.equal(item.endCleanupStatus, "not_started");
  assert.equal(item.executionResultCollectionAttempted, true);
  assert.equal(item.streamAvailableDuringSession, true);
  assert.equal(item.executionStatus, "failed");
  assert.equal(finishExpiredAdmission(item, expiry + 1), false);
  assert.equal(finalSessionDatabaseStatus(item), null);
  assert.equal(finalSessionDatabaseStatus({...item, executionResultPersisted: true}), null);
});

test("publish observed posture details but omit command lines, file paths and timeout traces", () => {
  for (const reason of [
    "Navi live readiness check failed: Command failed: C:\\Python\\python.exe --check-home-ready\nTraceback...\nRuntimeError: Healthy lowered/damped terminal posture is not verified. Observed standing=True, action=3, estop=0, height=0.285 m, still=True",
    "Master readiness check failed: spawnSync C:\\Users\\operator\\Python310\\python.exe ETIMEDOUT",
    "Traceback (most recent call last):\nFileNotFoundError: [Errno 2] missing: '/private/trust.json'",
  ]) {
    const item = {...expiredNavi, launchBlockedReason: reason};
    finishExpiredAdmission(item, expiry);
    assert.doesNotMatch(item.executionResultError, /Traceback|C:\\|--check-ready|private\/trust/);
    if (reason.includes("height")) assert.match(item.executionResultError, /height=0.285 m, still=True/);
    if (reason.includes("ETIMEDOUT")) assert.match(item.executionResultError, /timed out/);
  }
});

test("repair only the prior undefined-path failure without rewriting dispatched runs", () => {
  const legacy = {...expiredNavi, executionModel: "master", masterPreparedAttemptId: "preflight-only",
    status: "finished", endCleanupStatus: "not_started", executionStatus: "failed", executionResult: null,
    executionResultError: undefinedPath, executionResultPersisted: true, databaseStatus: "failed"};
  for (const evidence of [{pid: "42"}, {executionAttemptId: "a"}, {executionGuardianPid: 42},
    {naviCleanupOwner: {}}, {localExecutionResult: "receipt.json"}, {executionResult: {}},
    {executionResultError: "SomeOtherFailure"}, {endCleanupAttempts: 1}]) {
    assert.equal(finishExpiredAdmission({...legacy, ...evidence}, expiry), false);
  }
  assert.equal(finishExpiredAdmission(legacy, expiry), true);
  assert.equal(legacy.executionResultPersisted, false);
});

test("publish a bounded terminal update only for the matching unfinished or legacy-failed row", async () => {
  const item = {...expiredNavi};
  finishExpiredAdmission(item, expiry);
  let patches = 0;
  const request = async (table, query, options) => {
    assert.equal(table, "agentech_robot_sessions");
    const filters = new URLSearchParams(query);
    assert.equal(filters.get("execution_result"), "is.null");
    assert.equal(filters.get("scheduled_end"), "eq." + item.end);
    assert.equal(filters.get("code_submission_id"), "eq." + item.executionSubmissionId);
    if (!options) return [{id:100, session_status:"failed", execution_error:undefinedPath}];
    patches++;
    assert.equal(filters.get("execution_error"), "eq." + undefinedPath);
    assert.equal(filters.get("session_status"), "eq.failed");
    assert.deepEqual(options.body, {session_status:"failed", execution_error:item.executionResultError,
      execution_updated_at:item.admissionFailureRecordedAt, updated_at:item.admissionFailureRecordedAt});
    return [{id:100}];
  };
  assert.equal(await publishExpiredAdmission(request, 100, item), true);
  assert.equal(patches, 1);
  for (const rows of [[], [{id:100,session_status:"cancelled",execution_error:null}],
    [{id:100,session_status:"failed",execution_error:"actual runner failure"}]]) {
    assert.equal(await publishExpiredAdmission(async (_table, _query, options) => {
      assert.equal(options, undefined); return rows;
    }, 100, item), false);
  }
  assert.equal(await publishExpiredAdmission(async (_table, _query, options) => options ? [] :
    [{id:100,session_status:"failed",execution_error:undefinedPath}], 100, item), false);
});


test("accepts an identity-bound completed execution result", () => {
  const parsed = parseExecutionResult(JSON.stringify(valid), expected);

  assert.equal(parsed.outcome, "completed");
  assert.equal(parsed.completed_count, 1);
});


test("rejects identity mismatch, impossible counts, and corrupt hashes", () => {
  assert.throws(() => parseExecutionResult(JSON.stringify({ ...valid, session_id: "43" }), expected), /session/);
  assert.throws(() => parseExecutionResult(JSON.stringify({ ...valid, completed_count: 2 }), expected), /count/);
  assert.throws(() => parseExecutionResult(JSON.stringify({ ...valid, plan_sha256: "bad" }), expected), /hash/);
  assert.throws(() => parseExecutionResult(JSON.stringify(valid), { ...expected, planSha256: "c".repeat(64) }), /plan hash/);
});


test("requires a structured error for failed execution", () => {
  const failed = { ...valid, outcome: "failed", completed_count: 0, error: null, commands: [{ ...valid.commands[0], status: "failed" }] };
  assert.throws(
    () => parseExecutionResult(JSON.stringify(failed), expected),
    /error/,
  );
});


test("rejects missing, invalid, or oversized JSON", () => {
  assert.throws(() => parseExecutionResult("", expected), /JSON/);
  assert.throws(() => parseExecutionResult("{}", expected), /schema|outcome/);
  assert.throws(() => parseExecutionResult(JSON.stringify(valid), expected, { maxBytes: 10 }), /size|bytes/);
});


test("builds only the execution-result Supabase columns", () => {
  assert.deepEqual(
    buildExecutionResultPatch(
      { executionResult: valid, executionResultError: null },
      "2026-08-25T01:00:02.000Z",
    ),
    {
      execution_result: valid,
      execution_error: null,
      execution_updated_at: "2026-08-25T01:00:02.000Z",
    },
  );
});
