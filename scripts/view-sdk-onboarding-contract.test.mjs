import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const contractPath = "features/eaic/01-clients/eaic-hub/contracts/view-sdk-onboarding.ts";
const onboarding = loadTypeScriptModule(contractPath);

const {
  VIEW_SDK_ONBOARDING_STORAGE_KEY,
  createInitialViewSdkOnboardingState,
  loadViewSdkOnboardingState,
  parseViewSdkOnboardingState,
  persistViewSdkOnboardingState,
  reduceViewSdkOnboarding,
  selectFirstIncompleteViewSdkStep,
  selectViewSdkOnboardingProgress,
  serializeViewSdkOnboardingState,
} = onboarding;

const robots = ["master", "aegis", "navi"];

function progressState(robot = "master") {
  let state = createInitialViewSdkOnboardingState();
  state = reduceViewSdkOnboarding(state, { type: "ROBOT_SELECTED", robot });
  state = reduceViewSdkOnboarding(state, {
    type: "FUNCTION_DETAIL_VIEWED",
    robot,
    functionName: "standing_actions.teach",
  });
  return state;
}

test("creates and round-trips only the exact v1 evidence shape", () => {
  const state = createInitialViewSdkOnboardingState();
  assert.deepEqual(Object.keys(state.robots), robots);
  assert.deepEqual(state, {
    version: 1,
    lastExplicitlySelectedRobot: null,
    robots: Object.fromEntries(robots.map((robot) => [robot, {
      robotSelected: false,
      functionDetailViewed: false,
      setupReviewed: false,
      setupCopied: false,
      nextAction: null,
    }])),
    tour: { dismissed: false, finished: false },
  });
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.robots.master));

  const serialized = serializeViewSdkOnboardingState(state);
  assert.deepEqual(parseViewSdkOnboardingState(serialized), state);
  for (const forbidden of [
    "email", "account", "code", "functionname", "query", "price",
    "entitlement", "timestamp", "analytics",
  ]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false, forbidden);
  }
});

test("rejects malformed, partial, wrong-version, and invalid-enum storage records", () => {
  const valid = JSON.parse(serializeViewSdkOnboardingState(createInitialViewSdkOnboardingState()));
  const withoutMaster = structuredClone(valid);
  delete withoutMaster.robots.master;
  const replacedRobot = structuredClone(valid);
  replacedRobot.robots.other = replacedRobot.robots.navi;
  delete replacedRobot.robots.navi;
  const wrongBoolean = structuredClone(valid);
  wrongBoolean.robots.aegis.setupCopied = "yes";
  const invalidRobot = structuredClone(valid);
  invalidRobot.lastExplicitlySelectedRobot = "other";
  const invalidDestination = structuredClone(valid);
  invalidDestination.robots.navi.nextAction = "checkout";

  for (const value of [
    "{",
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify(withoutMaster),
    JSON.stringify(replacedRobot),
    JSON.stringify(wrongBoolean),
    JSON.stringify(invalidRobot),
    JSON.stringify(invalidDestination),
  ]) {
    assert.equal(parseViewSdkOnboardingState(value), null);
  }
});

test("reduces explicit evidence idempotently and isolates all three robots", () => {
  const initial = createInitialViewSdkOnboardingState();
  const masterSelected = reduceViewSdkOnboarding(initial, { type: "ROBOT_SELECTED", robot: "master" });
  assert.strictEqual(
    reduceViewSdkOnboarding(masterSelected, { type: "ROBOT_SELECTED", robot: "master" }),
    masterSelected,
  );
  const viewed = reduceViewSdkOnboarding(masterSelected, {
    type: "FUNCTION_DETAIL_VIEWED",
    robot: "master",
    functionName: "standing_actions.teach",
  });
  assert.strictEqual(
    reduceViewSdkOnboarding(viewed, {
      type: "FUNCTION_DETAIL_VIEWED",
      robot: "master",
      functionName: "standing_actions.teach",
    }),
    viewed,
  );
  assert.equal(viewed.robots.master.functionDetailViewed, true);
  assert.deepEqual(viewed.robots.aegis, initial.robots.aegis);
  assert.deepEqual(viewed.robots.navi, initial.robots.navi);
  assert.strictEqual(reduceViewSdkOnboarding(initial, { type: "STORAGE_HYDRATED", state: viewed }), viewed);
});

test("requires setup review plus successful copy and derives the first incomplete step", () => {
  const explored = progressState();
  const reviewOnly = reduceViewSdkOnboarding(explored, { type: "SETUP_REVIEWED", robot: "master" });
  const copyOnly = reduceViewSdkOnboarding(explored, { type: "SETUP_COPIED", robot: "master" });
  assert.equal(selectViewSdkOnboardingProgress(reviewOnly, "master").steps.setup, false);
  assert.equal(selectViewSdkOnboardingProgress(copyOnly, "master").steps.setup, false);

  const setupComplete = reduceViewSdkOnboarding(reviewOnly, { type: "SETUP_COPIED", robot: "master" });
  assert.deepEqual(selectViewSdkOnboardingProgress(setupComplete, "master"), {
    steps: { choose: true, explore: true, setup: true, next: false },
    completed: 3,
    total: 4,
    allComplete: false,
  });
  assert.equal(selectFirstIncompleteViewSdkStep(setupComplete, "master"), "next");

  const complete = reduceViewSdkOnboarding(setupComplete, {
    type: "NEXT_ACTION_CHOSEN",
    robot: "master",
    destination: "software-check",
  });
  assert.equal(selectFirstIncompleteViewSdkStep(complete, "master"), "next");
  assert.equal(selectViewSdkOnboardingProgress(complete, "master").allComplete, true);
});

test("skip finish and restart change tour presentation without changing evidence", () => {
  const evidence = progressState("navi");
  const skipped = reduceViewSdkOnboarding(evidence, { type: "TOUR_SKIPPED" });
  const finished = reduceViewSdkOnboarding(evidence, { type: "TOUR_FINISHED" });
  const restarted = reduceViewSdkOnboarding(finished, { type: "TOUR_RESTARTED" });
  assert.deepEqual(skipped.robots, evidence.robots);
  assert.deepEqual(finished.robots, evidence.robots);
  assert.deepEqual(restarted.robots, evidence.robots);
  assert.deepEqual(skipped.tour, { dismissed: true, finished: false });
  assert.deepEqual(finished.tour, { dismissed: false, finished: true });
  assert.deepEqual(restarted.tour, { dismissed: false, finished: false });
  assert.equal(finished.robots.navi.nextAction, null);
  assert.doesNotMatch(fs.readFileSync(contractPath, "utf8"), /STEP_COMPLETED/);
});

test("persists next action before navigation can continue and degrades storage exceptions to memory-only", () => {
  const writes = [];
  const storage = {
    getItem(key) {
      assert.equal(key, VIEW_SDK_ONBOARDING_STORAGE_KEY);
      return writes.at(-1)?.value ?? null;
    },
    setItem(key, value) {
      writes.push({ key, value });
    },
  };
  const initialLoad = loadViewSdkOnboardingState(storage);
  assert.equal(initialLoad.storageMode, "persistent");
  let next = reduceViewSdkOnboarding(initialLoad.state, {
    type: "NEXT_ACTION_CHOSEN",
    robot: "aegis",
    destination: "start-coding",
  });
  assert.equal(persistViewSdkOnboardingState(storage, next), "persistent");
  assert.equal(writes.length, 1);
  assert.deepEqual(loadViewSdkOnboardingState(storage), { state: next, storageMode: "persistent" });

  assert.deepEqual(loadViewSdkOnboardingState({
    getItem() { throw new Error("blocked"); },
    setItem() {},
  }), { state: createInitialViewSdkOnboardingState(), storageMode: "memory-only" });
  assert.deepEqual(loadViewSdkOnboardingState({
    getItem() { return "{"; },
    setItem() {},
  }), { state: createInitialViewSdkOnboardingState(), storageMode: "persistent" });
  assert.equal(persistViewSdkOnboardingState({
    getItem() { return null; },
    setItem() { throw new Error("full"); },
  }, next), "memory-only");
  assert.deepEqual(loadViewSdkOnboardingState(null), {
    state: createInitialViewSdkOnboardingState(),
    storageMode: "memory-only",
  });

  const source = fs.readFileSync(contractPath, "utf8");
  assert.doesNotMatch(source, /document\.cookie|sessionStorage|fetch\s*\(|URLSearchParams/);
});
