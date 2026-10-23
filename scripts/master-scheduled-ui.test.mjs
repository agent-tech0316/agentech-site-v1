import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync(new URL("../features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx", import.meta.url), "utf8");

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

test("Master explains verified raw guidance and the optional explicit entry call", () => {
  assert.match(workbench, /data-master-guidance-prerequisite/);
  assert.match(workbench, /Adjustments require raw STAND_DEFAULT guidance/);
  assert.match(workbench, /Agentech\.enter_stand_hand_guide\(&quot;both&quot;\)/);
  assert.match(workbench, /first adjustment enters and verifies guidance through the SDK before moving/);
});
