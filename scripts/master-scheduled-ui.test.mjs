import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const workbench = readFileSync(new URL("../features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx", import.meta.url), "utf8");

test("gateway owner accounts retain the focused robot booking form", () => {
  const dashboard = readFileSync(new URL("../components/account-dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /if \(isGatewayOwnerAccount && !focusedRobotScheduling\) \{/);
  assert.doesNotMatch(dashboard, /if \(isGatewayOwnerAccount\) \{/);
});

test("Master uses its upper-body contract and offers the reviewed starter in normal certification", () => {
  assert.match(workbench, /checkMasterExecutionCode\(code\)\.commands/);
  assert.match(workbench, /data-master-arm-starter/);
  assert.match(workbench, /updateCode\(masterExecutionStarterCode/);
  assert.match(workbench, /Master upper-body contract/);
  assert.match(workbench, /Physical execution is checked by the trusted runner/);
});

test("restoring a regular Master submission never treats it as camera-only", () => {
  assert.doesNotMatch(workbench, /if \(latestSubmission\.robotModel === "Master"\)/);
  assert.match(workbench, /latestSubmission\.id\.startsWith\("master-live-test-"\)/);
  assert.match(workbench, /href=\{masterLiveTestSelected \? masterPresentation\.livePath : robotSchedulingPath\}/);
});

test("Master certification never substitutes an Aegis simulation clip", () => {
  assert.match(workbench, /if \(robotModel === "Master"\) return \[\];/);
  assert.match(workbench, /Static upper-body checks passed\. This does not establish physical qualification\./);
});

test("Master result clearly distinguishes static checks from an unavailable simulator", () => {
  assert.match(workbench, /data-master-static-result/);
  assert.match(workbench, /Master simulation is not available for this submission/);
  assert.doesNotMatch(workbench, /Walking and waist commands are excluded/);
});

test("Master explains verified raw guidance and the required explicit entry call", () => {
  assert.match(workbench, /data-master-guidance-prerequisite/);
  assert.match(workbench, /Adjustments require raw STAND_DEFAULT guidance/);
  assert.match(workbench, /Agentech\.enter_stand_hand_guide\(&quot;both&quot;\)/);
  assert.match(workbench, /Code without explicit entry is rejected/);
});

test("Master scheduled reference covers every allowed method once and keeps unsupported actions out", () => {
  const { masterScheduledMethodGroups } = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-execution-documentation.ts");
  const contract = JSON.parse(readFileSync(new URL("./master-command-contract.json", import.meta.url), "utf8"));
  const names = masterScheduledMethodGroups.flatMap(group => group.methods);
  assert.equal(names.length, 50);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), Object.keys(contract.commands).sort());
  for (const unsupported of ["forward", "walk", "turn_head", "center", "bow", "sit"]) {
    assert.ok(!names.includes(unsupported), unsupported);
  }
});

test("Master offers a valid Movement A example and explains distinct runtime prerequisites", () => {
  const docs = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-execution-documentation.ts");
  const { checkMasterExecutionCode } = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/master-execution-contract.ts");
  const report = checkMasterExecutionCode(docs.masterMovementAReviewedCode);
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.commands, ["movement_a"]);
  assert.match(workbench, /data-master-movement-a-starter/);
  assert.match(workbench, /updateCode\(masterMovementAReviewedCode\)/);
  assert.match(workbench, /data-master-scheduled-methods/);
  assert.match(docs.masterScheduledMethodGroups.find(group => group.id === "movement-a").description, /retained SDK right-arm preset/);
  assert.match(docs.masterScheduledMethodGroups.find(group => group.id === "native-presets").description, /native-ready standing state/);
  assert.match(docs.masterScheduledMethodGroups.find(group => group.id === "native-presets").description, /does not automatically return from raw guidance/);
  const guide = readFileSync(new URL("../docs/master-eaic-scheduling.md", import.meta.url), "utf8");
  assert.doesNotMatch(guide, /covers 21|movement_a` is not exposed|Certification rejects it before booking/);
  assert.match(guide, /50/);
});
