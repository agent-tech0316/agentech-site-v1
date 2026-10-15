import OBSWebSocket from "obs-websocket-js";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateObsStatus, verifyObsProfile } from "./obs-low-latency-policy.mjs";

async function bounded(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("OBS status probe timed out")), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function readObsStatus(obs, {url = "ws://127.0.0.1:4455", password, timeoutMs = 5000} = {}) {
  let failed = false;
  try {
    return await bounded((async () => {
      await obs.connect(url, password);
      const before = await obs.call("GetProfileList");
      const [stream, recording, video, stats, mode, encoder] = await Promise.all([
        obs.call("GetStreamStatus"), obs.call("GetRecordStatus"),
        obs.call("GetVideoSettings"), obs.call("GetStats"),
        obs.call("GetProfileParameter", {parameterCategory:"Output",parameterName:"Mode"}),
        obs.call("GetProfileParameter", {parameterCategory:"AdvOut",parameterName:"Encoder"}),
      ]);
      const after = await obs.call("GetProfileList");
      if (before.currentProfileName !== after.currentProfileName) throw new Error("OBS active profile changed during the probe");
      return validateObsStatus({
        currentProfileName: after.currentProfileName,
        outputMode: mode.parameterValue ?? mode.defaultParameterValue,
        streamEncoder: encoder.parameterValue ?? encoder.defaultParameterValue,
        outputActive: stream.outputActive, recordOutputActive: recording.outputActive,
        outputWidth: video.outputWidth, outputHeight: video.outputHeight,
        fpsNumerator: video.fpsNumerator, fpsDenominator: video.fpsDenominator,
        outputSkippedFrames: stats.outputSkippedFrames, renderSkippedFrames: stats.renderSkippedFrames,
      });
    })(), timeoutMs);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { await bounded(Promise.resolve().then(() => obs.disconnect()), timeoutMs); }
    catch (error) { if (!failed) throw error; }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let exitCode = 1;
  try {
    const [profileDirectory, mode, expectedProfileName] = process.argv.slice(2);
    if (mode && mode !== "--verify-configured") throw new Error("Unsupported OBS verification mode");
    if (mode && !expectedProfileName) throw new Error("Configured verification requires the original profile name");
    const status = await readObsStatus(new OBSWebSocket(), {
      url:process.env.OBS_WEBSOCKET_URL || "ws://127.0.0.1:4455",
      password:process.env.OBS_WEBSOCKET_PASSWORD || undefined,
    });
    if (profileDirectory) {
      status.profileSettings = verifyObsProfile({status,
        iniText:readFileSync(join(profileDirectory,"basic.ini"),"utf8"),
        encoder:JSON.parse(readFileSync(join(profileDirectory,"streamEncoder.json"),"utf8").replace(/^\uFEFF/,"")),
        configured:mode === "--verify-configured",expectedProfileName});
    }
    await new Promise((done, reject) => process.stdout.write(JSON.stringify(status), error => error ? reject(error) : done()));
    exitCode = 0;
  } catch (error) { console.error(error.message); }
  // A timed-out websocket may still retain a handle after bounded disconnect.
  process.exit(exitCode);
}
