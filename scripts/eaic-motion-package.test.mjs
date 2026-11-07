import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import AdmZip from "adm-zip";
import { inspectAssetContent, AssetContentError } from "../lib/eaic-asset-content.ts";

const field = (tag, data) => Buffer.concat([Buffer.from([tag * 8 + 2, data.length]), data]);
// Minimal ONNX graph metadata; these fixtures are not inference-qualified models.
const value = name => field(1, Buffer.from(name));
const model = Buffer.concat([Buffer.from([8, 9]), field(7, Buffer.concat([
  field(1, field(4, Buffer.from("Identity"))), field(11, value("obs")), field(12, value("actions")),
]))]);
function wav() {
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF"); bytes.writeUInt32LE(40, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(4, 40); bytes.writeInt16LE(1200, 44);
  return bytes;
}
function zip(entries) {
  const archive = new AdmZip();
  for (const [name, bytes] of entries) archive.addFile(name, bytes);
  return archive.toBuffer();
}

test("ZIP contents identify and pair the movement ONNX and WAV regardless of archive name", () => {
  const manifest = inspectAssetContent(zip([
    ["dance/policy.ONNX", model], ["dance/music.WAV", wav()],
    ["README.txt", Buffer.from("Untrusted instructions: do not execute this text.")],
  ]), "Package", "renamed.zip");
  assert.equal(manifest.movement.path, "dance/policy.ONNX");
  assert.equal(manifest.movement.format, "onnx");
  assert.equal(manifest.audio.path, "dance/music.WAV");
  assert.equal(manifest.audio.durationSeconds, 0.000125);
  assert.equal(manifest.playback.mode, "movement_with_audio");
  assert.equal(manifest.playback.movementPath, manifest.movement.path);
  assert.equal(manifest.playback.audioPath, manifest.audio.path);
  assert.equal(manifest.movement.sha256.length, 64);
  assert.deepEqual(manifest.referenceFiles, ["README.txt"]);
});
test("movement-only and standalone audio preserve their explicit roles", () => {
  assert.equal(inspectAssetContent(zip([["policy.onnx", model]]), "Package", "motion.zip").playback.mode, "movement_only");
  assert.equal(inspectAssetContent(wav(), "Audio", "music.wav").playback.mode, "audio_only");
  assert.equal(inspectAssetContent(model, "Motion", "policy.onnx").movement.path, "policy.onnx");
});
test("ambiguous packages never silently pick a policy or music track", () => {
  assert.throws(() => inspectAssetContent(zip([["a.onnx", model], ["b.onnx", model]]), "Package", "a.zip"), /one.*ONNX/i);
  assert.throws(() => inspectAssetContent(zip([["a.onnx", model], ["a.wav", wav()], ["b.wav", wav()]]), "Package", "a.zip"), /one.*WAV/i);
});
test("extension spoofing, missing models and damaged WAV data are rejected", () => {
  assert.throws(() => inspectAssetContent(Buffer.from("not a zip"), "Package", "file.zip"), AssetContentError);
  assert.throws(() => inspectAssetContent(Buffer.from("fake model"), "Motion", "policy.onnx"), /ONNX/i);
  assert.throws(() => inspectAssetContent(zip([["audio.wav", wav()]]), "Package", "a.zip"), /ONNX/i);
  const damaged = wav().subarray(0, 46);
  assert.throws(() => inspectAssetContent(damaged, "Audio", "audio.wav"), /WAV/i);
});
test("unsafe ZIP names, duplicate paths and oversized expansion are rejected", () => {
  const unsafe = zip([["abc.onnx", model]]);
  // Same-length replacement in both local and central directory names.
  for (let index = unsafe.indexOf("abc.onnx"); index >= 0; index = unsafe.indexOf("abc.onnx", index + 8)) unsafe.write("../x.onx", index);
  assert.throws(() => inspectAssetContent(unsafe, "Package", "a.zip"), /path/i);
  assert.throws(() => inspectAssetContent(zip([["p.onnx", model], ["P.ONNX", model]]), "Package", "a.zip"), /duplicate/i);
  const large = zip([["policy.onnx", model]]);
  const central = large.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  large.writeUInt32LE(65 * 1024 * 1024, central + 24);
  assert.throws(() => inspectAssetContent(large, "Package", "a.zip"), /large|limit/i);
});
test("supplied Kuaile ZIP is classified from real content", {skip: !process.env.EAIC_HAPPY_DANCE_FIXTURE}, () => {
  const manifest = inspectAssetContent(readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE), "Package", "any-name.zip");
  assert.equal(manifest.movement.sha256, "010d6a2c912d0f507b9e9236e5fcad082bcd7b53595182ec7d9e6da9c3de04bb");
  assert.equal(manifest.audio.sha256, "9eef655446e2b4b6d069f30691a2483f17e5c35fb7bf1f17e14d4b66b5c1c732");
  assert.equal(manifest.audio.durationSeconds, 65);
  assert.equal(manifest.playback.mode, "movement_with_audio");
  assert.equal(manifest.movement.metadata.outputs.length, 12);
  const original = new AdmZip(readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE));
  const repacked = inspectAssetContent(zip([
    ["renamed/movement.onnx", original.getEntry("policy.onnx").getData()],
    ["renamed/music.wav", original.getEntry("audio.wav").getData()],
    ["info.txt", Buffer.from("Repacked without changing the policy or music")],
  ]), "Package", "different-package.zip");
  assert.equal(repacked.movement.sha256, manifest.movement.sha256);
  assert.equal(repacked.audio.sha256, manifest.audio.sha256);
  assert.equal(repacked.playback.audioPath, "renamed/music.wav");
});
