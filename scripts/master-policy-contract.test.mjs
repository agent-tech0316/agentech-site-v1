import assert from "node:assert/strict";
import test from "node:test";
import {policy, field, message} from "./fixtures/master-policy-fixture.mjs";
import { inspectAssetContent, AssetContentError } from "../lib/eaic-asset-content.ts";

const inspect = bytes => inspectAssetContent(bytes, "Motion", "dance.onnx", "Master");
test("the server derives exact Master model and duration from self-contained policy bytes", () => {
  for (const [obs, acts, model] of [[151, 29, "Master Ultra"], [131, 25, "Master Edu"]]) {
    assert.deepEqual(inspect(policy({obs, acts})).movement.metadata.masterContract,
      {model, observationSize: obs, actionSize: acts, controlHz: 50, frameCount: 100, opset: 18, evidence: "static-interface"});
  }
});
test("an embedded constant motion phase supplies duration if the optional metadata is absent", () => {
  assert.equal(inspect(policy({frames:null})).movement.metadata.masterContract.frameCount,100);
});
test("shape, type, missing duration, unsupported imports, external data and non-finite weights fail validation", () => {
  for (const input of [{obs:150}, {acts:25}, {type:7}, {frames:"0"}, {frames:"1000000000"}, {domain:"custom"},
    {extraModel:field(8, message(field(1, "evil"),field(2, 1)))}, {op:"Loop"}, {external:true}, {badWeight:true},
    {extraModel:field(25, message())}, {wrongGains:true}, {frames:"99"}, {metadata:{joint_names:"wrong"}}, {metadata:{joint_stiffness:"1e20"}}, {omitOutput:"body_quat_w"}]) {
    assert.throws(() => inspect(policy(input)), AssetContentError, JSON.stringify(input));
  }
});
