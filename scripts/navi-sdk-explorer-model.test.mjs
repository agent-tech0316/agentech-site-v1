import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

// Mutation targets: verification leakage, hidden platform-note leakage,
// **connect_kwargs retention, featureCode exposure, invalid reviewed metadata,
// Common Task manifest drift, and lost or duplicated canonical records.
const canonical = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/navi-sdk-reference.ts");
const model = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer.ts");

const expectedCommonTasks = [
  ["stand", "Get Navi ready in a standing state", ["stand", "standing", "standing state", "ready"]],
  ["forward", "Move forward", ["forward", "move forward", "forward movement"]],
  ["turn", "Turn left or right", ["turn", "turn left", "turn right", "left turn", "right turn"]],
  ["sit", "Sit and return to standing automatically", ["sit", "sitting", "return to stand", "auto return to stand"]],
  ["stop", "Stop walking or turning", ["stop", "stop walking", "stop turning"]],
  ["get_battery_status", "View battery status", ["battery", "battery status", "view battery status"]],
];

const clone = (value) => structuredClone(value);
const validReviewedSource = () => expectedCommonTasks.map(([name]) => clone(canonical.naviFunctions.find((item) => item.name === name)));

test("validates the exact reviewed Common Task publication contract", () => {
  assert.doesNotThrow(() => model.validateNaviExplorerSource(canonical.naviFunctions));
  assert.deepEqual(
    model.selectReviewedCommonTasks(model.buildPublicNaviReferences(canonical.naviFunctions)).map((item) => [
      item.name,
      item.discovery.taskLabel,
      item.discovery.keywords,
      item.discovery.commonTask.rank,
      item.discovery.commonTask.approved,
      item.discovery.commonTask.reviewedBy,
      item.discovery.commonTask.reviewedOn,
    ]),
    expectedCommonTasks.map(([name, label, keywords], index) => [name, label, keywords, index + 1, true, "Agentech product owner", "2026-10-14"]),
  );
});

test("rejects malformed discoverability and return metadata", () => {
  const cases = [
    ["blank task label", (items) => { items[0].discovery.taskLabel = " "; }],
    ["long task label", (items) => { items[0].discovery.taskLabel = "x".repeat(81); }],
    ["blank keyword", (items) => { items[0].discovery.keywords = ["stand", " "]; }],
    ["long keyword", (items) => { items[0].discovery.keywords = ["x".repeat(51)]; }],
    ["normalized duplicate keyword", (items) => { items[0].discovery.keywords = ["standing-state", "standing_state"]; }],
    ["too many keywords", (items) => { items[0].discovery.keywords = Array.from({ length: 13 }, (_, index) => `term ${index}`); }],
    ["invalid calendar date", (items) => { items[0].discovery.commonTask.reviewedOn = "2026-02-30"; }],
    ["duplicate rank", (items) => { items[1].discovery.commonTask.rank = 1; }],
    ["out-of-range rank", (items) => { items[0].discovery.commonTask.rank = 7; }],
    ["missing approval", (items) => { items[0].discovery.commonTask.approved = false; }],
    ["missing reviewer", (items) => { items[0].discovery.commonTask.reviewedBy = ""; }],
    ["development Common Task", (items) => { items[0].status = "development"; }],
    ["unsupported Common Task", (items) => { items[0].status = "unsupported"; }],
    ["blank return type", (items) => { items[0].returns = { type: " ", reviewedBy: "Docs", reviewedOn: "2026-10-14" }; }],
    ["blank return description", (items) => { items[0].returns = { type: "bool", description: " ", reviewedBy: "Docs", reviewedOn: "2026-10-14" }; }],
    ["missing return reviewer", (items) => { items[0].returns = { type: "bool", reviewedBy: " ", reviewedOn: "2026-10-14" }; }],
    ["invalid return date", (items) => { items[0].returns = { type: "bool", reviewedBy: "Docs", reviewedOn: "2026-13-01" }; }],
  ];

  for (const [name, mutate] of cases) {
    const items = validReviewedSource();
    mutate(items);
    assert.throws(() => model.validateNaviExplorerSource(items), undefined, name);
  }
});

test("projects all 130 canonical records exactly once and excludes protected fields", () => {
  const source = canonical.naviFunctions;
  const publicRecords = model.buildPublicNaviReferences(source);
  assert.equal(source.length, 130);
  assert.equal(publicRecords.length, 130);
  assert.deepEqual(publicRecords.map((item) => item.name), source.map((item) => item.name));
  assert.equal(new Set(publicRecords.map((item) => item.name)).size, 130);

  const verificationValues = source.flatMap((item) => item.verification ? [item.verification] : []);
  const hiddenPlatformNotes = source.filter((item) => item.platformNote && !model.NAVI_PUBLIC_PLATFORM_NOTE_NAMES.has(item.name));
  const internalParams = source.flatMap((item) => item.params.filter((param) => param.name === "**connect_kwargs"));
  const featureCodes = source.flatMap((item) => item.access?.featureCode ? [item.access.featureCode] : []);
  assert.equal(verificationValues.length, 29);
  assert.equal(hiddenPlatformNotes.length, 11);
  assert.equal(internalParams.length, 7);

  const serialized = JSON.stringify(publicRecords);
  for (const value of [...verificationValues, ...featureCodes]) assert.ok(!serialized.includes(value), value);
  for (const item of hiddenPlatformNotes) {
    const projected = publicRecords.find((candidate) => candidate.name === item.name);
    assert.equal(projected.platformNote, undefined, `${item.name} must not expose its hidden platform note`);
    assert.equal(projected.platformNoteLabel, undefined, `${item.name} must not expose its hidden platform-note label`);
  }
  assert.ok(!serialized.includes("**connect_kwargs"));
  assert.ok(!serialized.includes("featureCode"));

  assert.deepEqual(
    publicRecords.filter((item) => item.platformNote).map((item) => item.name),
    ["jump", "jump_forward", "observe", "set_gait", "set_foot_height", "set_collision_protect", "set_friction", "set_jump_distance", "set_jump_angle"],
  );
  assert.equal(Object.isFrozen(publicRecords), true);
  assert.ok(publicRecords.every((item) => Object.isFrozen(item) && Object.isFrozen(item.params) && Object.isFrozen(item.profiles)));
});

test("preserves public premium badges without exposing entitlement identifiers", () => {
  const premium = model.buildPublicNaviReferences(canonical.naviFunctions).find((item) => item.name === "return_to_home");
  assert.deepEqual(premium.access, { tier: "premium", includedWithMonthlySubscription: true, oneTimePurchase: true });
  assert.equal(premium.creditUsage, "high");
  assert.equal("featureCode" in premium.access, false);
});

test("presents only reviewed return documentation and never infers an absent return", () => {
  const source = validReviewedSource()[0];
  delete source.returns;
  const absent = model.toPublicNaviReference(source, 0);
  assert.deepEqual(model.getNaviReturnPresentation(absent), {
    type: null,
    description: "Not documented in the current public reference.",
  });

  source.returns = { type: "NaviStatus", description: "Reviewed public status fields.", reviewedBy: "SDK documentation owner", reviewedOn: "2026-10-14" };
  model.validateNaviExplorerSource([source]);
  const reviewed = model.toPublicNaviReference(source, 0);
  assert.deepEqual(model.getNaviReturnPresentation(reviewed), { type: "NaviStatus", description: "Reviewed public status fields." });
});

test("normalizes NFKC, en-US case, separators, and repeated whitespace", () => {
  assert.deepEqual(model.normalizeNaviSearchValue("  ＲＥＴＵＲＮ.to-HOME__NOW  "), {
    exact: "return.to-home__now",
    tokenText: "return to home now",
    tokens: ["return", "to", "home", "now"],
  });
  assert.equal(model.normalizeNaviSearchValue("İ").exact, "i̇");
});

test("searches literal public fields while protected strings produce no hit", () => {
  const records = model.buildPublicNaviReferences(canonical.naviFunctions);
  const index = model.buildNaviSearchIndex(records);
  const names = (query, category = "All") => model.searchNaviReferences(index, query, category).map((result) => result.reference.name);

  assert.equal(names("return_to_home")[0], "return_to_home");
  assert.equal(names("Agentech.return_to_home(facing_angle_deg=0)")[0], "return_to_home");
  assert.equal(names("standing state ready")[0], "stand");
  assert.equal(names("auto return to stand")[0], "sit");
  assert.equal(names("best effort software zero velocity")[0], "emergency_stop");
  assert.deepEqual(new Set(names("sensing")), new Set(["get_status", "get_battery_status", "body_status", "joint_states", "diagnose"]));
  assert.equal(names("facing_angle_deg")[0], "return_to_home");
  assert.equal(names("Face backward")[0], "return_to_home");
  assert.equal(names("robot advertised range")[0], "set_gait");
  assert.equal(names("battery = Agentech.get_battery_status()")[0], "get_battery_status");
  assert.deepEqual(names("controller error=0 warning=0"), []);
  assert.ok(index.every((document) => document.fields.every((field) => !field.normalized.exact.includes("navi_return_to_home"))), "the protected feature code must not enter the search index");
  assert.deepEqual(names("connect_kwargs"), []);
  assert.deepEqual(names("no dependable global x y odometry"), []);
});

test("uses exact and prefix bonuses, highest per-token weights, AND semantics, category filtering, and source-order ties", () => {
  const make = (overrides = {}) => ({
    name: "alpha",
    category: "Actions",
    signature: "Agentech.alpha()",
    summary: "summary text",
    example: "Agentech.alpha()",
    params: [],
    profiles: [],
    sourceIndex: 0,
    ...overrides,
  });
  const weightCases = [
    ["canonical", "needle", make({ name: "needle", signature: "Agentech.alpha()", example: "Agentech.alpha()" }), 1060],
    ["signature", "needle", make({ signature: "Agentech.alpha(needle=x)" }), 50],
    ["task", "needle", make({ discovery: { taskLabel: "needle", keywords: [], commonTask: undefined } }), 40],
    ["summary", "needle", make({ summary: "needle" }), 30],
    ["category", "sensing", make({ category: "Sensing" }), 30],
    ["parameter", "needle", make({ params: [{ name: "needle", type: "str", description: "input" }] }), 20],
    ["profile", "needle", make({ profiles: [{ name: "needle", syntax: "Agentech.alpha()" }] }), 20],
    ["return", "needle", make({ returns: { type: "needle", reviewedBy: "Docs", reviewedOn: "2026-10-14" } }), 10],
    ["platform-note", "needle", make({ platformNote: "needle" }), 10],
    ["example", "needle", make({ example: "needle" }), 10],
  ];
  for (const [kind, query, reference, score] of weightCases) {
    const [result] = model.searchNaviReferences(model.buildNaviSearchIndex([reference]), query, "All");
    assert.equal(result.score, score, kind);
  }

  const lateral = model.buildPublicNaviReferences(canonical.naviFunctions).find((item) => item.name === "lateral");
  const lateralIndex = model.buildNaviSearchIndex([lateral]);
  assert.equal(model.searchNaviReferences(lateralIndex, "lateral_left", "All")[0].score, 1120);
  assert.equal(model.searchNaviReferences(lateralIndex, "lateral_r", "All")[0].score, 620);
  assert.equal(model.searchNaviReferences(lateralIndex, "lateral left impossible", "All").length, 0);

  const tied = model.buildNaviSearchIndex([
    make({ name: "first", summary: "shared term", sourceIndex: 4 }),
    make({ name: "second", summary: "shared term", sourceIndex: 9 }),
  ]);
  assert.deepEqual(model.searchNaviReferences(tied, "shared", "All").map((result) => result.reference.name), ["first", "second"]);
  assert.deepEqual(model.searchNaviReferences(tied, "", "Sensing"), []);
});

test("reports canonical and query-relative category counts before a category filter", () => {
  const index = model.buildNaviSearchIndex(model.buildPublicNaviReferences(canonical.naviFunctions));
  assert.deepEqual(model.getNaviCategoryCounts(index, ""), {
    All: 130,
    Movement: 6,
    Athletics: 6,
    Actions: 92,
    Posture: 13,
    Configuration: 6,
    Safety: 2,
    Sensing: 5,
  });
  assert.deepEqual(model.getNaviCategoryCounts(index, "view battery status"), {
    All: 1,
    Movement: 0,
    Athletics: 0,
    Actions: 0,
    Posture: 0,
    Configuration: 0,
    Safety: 0,
    Sensing: 1,
  });
});
