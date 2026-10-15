import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const policyUrl = new URL("./obs-low-latency-policy.mjs", import.meta.url);
const status = () => ({outputActive:false,recordOutputActive:false,currentProfileName:"Robot Camera",
  outputMode:"Advanced",streamEncoder:"obs_nvenc_h264_tex",outputWidth:1280,outputHeight:720,
  fpsNumerator:30,fpsDenominator:1,outputSkippedFrames:0,renderSkippedFrames:0});
const ini = () => "[General]\nName=Robot Camera\n[Output]\nMode=Advanced\n[AdvOut]\nEncoder=obs_nvenc_h264_tex\n[Video]\nOutputCX=1280\nOutputCY=720\nFPSType=0\nFPSCommon=30\n";
const encoder = () => ({rate_control:"CBR",bitrate:3500,keyint_sec:1,preset:"p3",tune:"ull",
  multipass:"disabled",lookahead:false,bf:0});
async function policy() {
  assert.ok(existsSync(policyUrl), "OBS profile verification policy is required before configuration");
  return import(policyUrl);
}

test("OBS profile matches its INI display name even when directory name differs", async () => {
  const {verifyObsProfile} = await policy();
  const actual = verifyObsProfile({status:status(),iniText:ini(),encoder:encoder(),configured:true});
  assert.equal(actual.profileName, "Robot Camera");
  assert.equal(actual.bitrateKbps, 3500);
  assert.equal(actual.fps, 30);
});

test("OBS preflight rejects a different active profile, output mode, encoder, or rate control", async () => {
  const {verifyObsProfile} = await policy();
  for (const changes of [
    {status:{...status(),currentProfileName:"Other"}},
    {status:{...status(),outputMode:"Simple"}},
    {status:{...status(),streamEncoder:"obs_x264"}},
    {iniText:ini().replace("Mode=Advanced", "Mode=Simple")},
    {iniText:ini().replace("Encoder=obs_nvenc_h264_tex", "Encoder=obs_x264")},
    {encoder:{...encoder(),rate_control:"CQP"}},
  ]) assert.throws(() => verifyObsProfile({status:status(),iniText:ini(),encoder:encoder(),...changes}));
});

test("OBS preflight fails closed on missing or invalid activity and video status", async () => {
  const {verifyObsProfile} = await policy();
  for (const changes of [
    {outputActive:undefined},{recordOutputActive:undefined},{outputActive:"false"},
    {outputActive:true},{recordOutputActive:true},{currentProfileName:""},
    {outputWidth:null},{fpsNumerator:NaN},{fpsDenominator:0},{fpsDenominator:undefined},
  ]) assert.throws(() => verifyObsProfile({status:{...status(),...changes},iniText:ini(),encoder:encoder()}));
});

test("configured OBS verification checks fractional FPS and the original active profile", async () => {
  const {verifyObsProfile} = await policy();
  const options = {status:status(),iniText:ini(),encoder:encoder(),configured:true,expectedProfileName:"Robot Camera"};
  assert.equal(verifyObsProfile({...options,status:{...status(),fpsNumerator:60,fpsDenominator:2}}).fps, 30);
  assert.throws(() => verifyObsProfile({...options,status:{...status(),fpsDenominator:1001}}));
  assert.throws(() => verifyObsProfile({...options,expectedProfileName:"Earlier Profile"}));
});

test("configured OBS verification reads every claimed persisted encoder setting", async () => {
  const {verifyObsProfile} = await policy();
  for (const [key,value] of Object.entries({bitrate:5000,keyint_sec:2,preset:"p7",tune:"hq",
    multipass:"fullres",lookahead:true,bf:2})) {
    assert.throws(() => verifyObsProfile({status:status(),iniText:ini(),
      encoder:{settings:{...encoder(),[key]:value}},configured:true}), key);
  }
  for (const [from,to] of [["OutputCX=1280","OutputCX=1920"],["OutputCY=720","OutputCY=1080"],
    ["FPSType=0","FPSType=2"],["FPSCommon=30","FPSCommon=60"]]) {
    assert.throws(() => verifyObsProfile({status:status(),iniText:ini().replace(from,to),encoder:encoder(),configured:true}));
  }
  assert.throws(() => verifyObsProfile({status:{...status(),outputWidth:1920},iniText:ini(),encoder:encoder(),configured:true}));
  assert.equal(verifyObsProfile({status:status(),iniText:ini(),encoder:{settings:encoder()},configured:true}).bitrateKbps,3500);
});

function fakeObs(overrides = {}) {
  const requests = [];
  return {requests,async connect(){},async disconnect(){},async call(name, args) {
    requests.push([name,args]);
    if (name === "GetProfileList") return {currentProfileName:"Robot Camera",profiles:["Robot Camera"]};
    if (name === "GetProfileParameter") {
      assert.deepEqual(args, args.parameterCategory === "Output"
        ? {parameterCategory:"Output",parameterName:"Mode"}
        : {parameterCategory:"AdvOut",parameterName:"Encoder"});
      return {parameterValue:args.parameterCategory === "Output" ? "Advanced" : "obs_nvenc_h264_tex",defaultParameterValue:null};
    }
    if (["GetStreamStatus","GetRecordStatus"].includes(name)) return {outputActive:false};
    if (name === "GetVideoSettings") return status();
    if (name === "GetStats") return {outputSkippedFrames:0,renderSkippedFrames:0};
    throw Error(`Unexpected request ${name}`);
  },...overrides};
}

test("OBS status probe requests profile identity and the selected Advanced encoder", async () => {
  await policy(); // Never import the old executable probe before its replacement exists.
  const {readObsStatus} = await import("./obs-stream-status.mjs");
  const obs = fakeObs();
  assert.deepEqual(await readObsStatus(obs), status());
  assert.equal(obs.requests.filter(([name]) => name === "GetProfileList").length, 2);
  assert.equal(obs.requests.filter(([name]) => name === "GetProfileParameter").length, 2);
});

test("OBS status probe rejects profile switches and missing status fields", async () => {
  await policy();
  const {readObsStatus} = await import("./obs-stream-status.mjs");
  for (const mode of ["switch", "missing"]) {
    const obs = fakeObs();
    const call = obs.call.bind(obs);
    let profiles = 0;
    obs.call = async (name,args) => {
      if (mode === "switch" && name === "GetProfileList" && ++profiles === 2) {
        return {currentProfileName:"Other",profiles:["Other"]};
      }
      if (mode === "missing" && name === "GetStreamStatus") return {};
      return call(name,args);
    };
    await assert.rejects(readObsStatus(obs));
  }
});

test("OBS probe bounds connection, status, and disconnect waits", async () => {
  await policy();
  const {readObsStatus} = await import("./obs-stream-status.mjs");
  for (const phase of ["connect","call","disconnect"]) {
    const obs = fakeObs({[phase]:()=>new Promise(()=>{})});
    await assert.rejects(readObsStatus(obs,{timeoutMs:15}), /timed out/);
  }
});
