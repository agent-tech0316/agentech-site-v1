import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMasterLiveTestPayload,
  getCodeCheckingRobotOptions,
  isMasterLiveSessionActive,
  masterLiveTestPresentation,
  millisecondsUntilMasterLiveTestExpiry,
  selectCodeCheckingRobotModel,
} from "../lib/master-live-test-ui.ts";

const normalModels = ["Aegies", "Navi", "Master"];

test("normal Master certification remains separate from the account-gated camera test", () => {
  assert.deepEqual(getCodeCheckingRobotOptions(normalModels, false), ["Aegies", "Navi", "Master"]);
  assert.deepEqual(getCodeCheckingRobotOptions(normalModels, true), ["Aegies", "Navi", "Master", "Master Live Test"]);
});

test("camera test selection requires capability while Master selects the normal execution model", () => {
  assert.deepEqual(selectCodeCheckingRobotModel("Master Live Test", true, "Navi"), {
    normalRobotModel: "Navi",
    masterLiveTestSelected: true,
  });
  assert.deepEqual(selectCodeCheckingRobotModel("Master Live Test", false, "Navi"), {
    normalRobotModel: "Navi",
    masterLiveTestSelected: false,
  });
  assert.deepEqual(selectCodeCheckingRobotModel("Master", false, "Navi"), {
    normalRobotModel: "Master",
    masterLiveTestSelected: false,
  });
  assert.deepEqual(selectCodeCheckingRobotModel("Aegies", true, "Navi"), {
    normalRobotModel: "Aegies",
    masterLiveTestSelected: false,
  });
});

test("arbitrary Master text is sent unchanged and without an executable command list", () => {
  const rawText = "rm -rf /\nAgentech.forward(999)\nnot Python";
  assert.deepEqual(buildMasterLiveTestPayload(rawText, "notes.txt"), {
    code: rawText,
    uploadedFileName: "notes.txt",
  });
});

test("the unlocked presentation describes the 3-minute view-only test and opens the existing Master live page", () => {
  assert.deepEqual(masterLiveTestPresentation("2026-08-11T18:03:00.000Z"), {
    actionLabel: "Start 3-Minute Master Live Test",
    artifactLabel: "View-only test artifact",
    liveLinkLabel: "Open Master Live Stream",
    livePath: "/agentech-products/eaic-hub/watch-live-run",
    expiresAt: "2026-08-11T18:03:00.000Z",
    viewOnlyNotice: "View-only test. Submitted text will not execute on Master.",
  });
});

test("restored Master UI is unlocked only by a currently active server session", () => {
  const current = new Date("2026-08-11T18:00:00.000Z");
  const activeMaster = {
    active: true,
    session: {
      robotModel: "Master",
      scheduledStart: "2026-08-11T17:55:00.000Z",
      scheduledEnd: "2026-08-11T18:25:00.000Z",
    },
  };
  assert.equal(isMasterLiveSessionActive(activeMaster, current), true);
  assert.equal(isMasterLiveSessionActive({ ...activeMaster, active: false }, current), false);
  assert.equal(isMasterLiveSessionActive({ ...activeMaster, session: { ...activeMaster.session, robotModel: "Aegies" } }, current), false);
  assert.equal(isMasterLiveSessionActive({ ...activeMaster, session: { ...activeMaster.session, scheduledStart: "2026-08-11T18:05:00.000Z" } }, current), false);
  assert.equal(isMasterLiveSessionActive({ ...activeMaster, session: { ...activeMaster.session, scheduledEnd: "2026-08-11T18:00:00.000Z" } }, current), false);
});

test("the client expiry timer reaches zero at the server-provided end time", () => {
  assert.equal(millisecondsUntilMasterLiveTestExpiry("2026-08-11T18:30:00.000Z", new Date("2026-08-11T18:00:00.000Z")), 1_800_000);
  assert.equal(millisecondsUntilMasterLiveTestExpiry("2026-08-11T18:00:00.000Z", new Date("2026-08-11T18:00:00.000Z")), 0);
  assert.equal(millisecondsUntilMasterLiveTestExpiry("not-a-date", new Date("2026-08-11T18:00:00.000Z")), 0);
});
