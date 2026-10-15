// Pure validation shared by the offline tests and the read-only OBS probe.
export function validateObsStatus(status) {
  if (!status || typeof status.outputActive !== "boolean" || typeof status.recordOutputActive !== "boolean") {
    throw new Error("OBS stream and recording activity must both be known");
  }
  for (const key of ["currentProfileName", "outputMode", "streamEncoder"]) {
    if (typeof status[key] !== "string" || !status[key].trim()) throw new Error(`OBS ${key} is missing`);
  }
  for (const key of ["outputWidth", "outputHeight", "fpsNumerator", "fpsDenominator"]) {
    if (!Number.isSafeInteger(status[key]) || status[key] <= 0) throw new Error(`OBS ${key} is invalid`);
  }
  for (const key of ["outputSkippedFrames", "renderSkippedFrames"]) {
    if (!Number.isSafeInteger(status[key]) || status[key] < 0) throw new Error(`OBS ${key} is invalid`);
  }
  return status;
}

function profileIni(text) {
  const sections = Object.create(null);
  let section;
  for (const raw of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[;#]/.test(line)) continue;
    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading) {
      section = heading[1];
      if (sections[section]) throw new Error(`Duplicate OBS profile section ${section}`);
      sections[section] = Object.create(null);
    } else if (section && line.includes("=")) {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      if (Object.hasOwn(sections[section], key)) throw new Error(`Duplicate OBS profile key ${section}.${key}`);
      sections[section][key] = line.slice(separator + 1).trim();
    }
  }
  return sections;
}

export function verifyObsProfile({status, iniText, encoder, configured = false, expectedProfileName}) {
  validateObsStatus(status);
  if (status.outputActive || status.recordOutputActive) throw new Error("OBS stream and recording must be inactive");
  const ini = profileIni(iniText);
  if (ini.General?.Name !== status.currentProfileName
    || (expectedProfileName !== undefined && expectedProfileName !== status.currentProfileName)) {
    throw new Error("Selected OBS basic.ini display name does not match the expected active profile");
  }
  if (status.outputMode !== "Advanced" || ini.Output?.Mode !== "Advanced") {
    throw new Error("OBS Advanced output mode is required");
  }
  // This modern H.264 NVENC implementation supports p3/ull/multipass/bf and is
  // also the encoder checked by the gateway's existing NVENC health probe.
  if (status.streamEncoder !== "obs_nvenc_h264_tex" || ini.AdvOut?.Encoder !== status.streamEncoder) {
    throw new Error("Selected OBS profile must use the supported NVENC H.264 encoder");
  }
  const settings = encoder?.settings ?? encoder;
  if (!settings || Array.isArray(settings) || settings.rate_control !== "CBR") {
    throw new Error("The selected NVENC stream encoder must use CBR rate control");
  }
  for (const key of ["OutputCX", "OutputCY", "FPSType", "FPSCommon"]) {
    if (!ini.Video?.[key]) throw new Error(`OBS Video.${key} is missing`);
  }
  if (configured) {
    if (status.outputWidth !== 1280 || status.outputHeight !== 720
      || status.fpsNumerator !== 30 * status.fpsDenominator
      || ini.Video.OutputCX !== "1280" || ini.Video.OutputCY !== "720"
      || ini.Video.FPSType !== "0" || ini.Video.FPSCommon !== "30") {
      throw new Error("OBS active and persisted video settings do not verify 1280x720 at 30 FPS");
    }
    for (const [key,value] of Object.entries({bitrate:3500,keyint_sec:1,preset:"p3",tune:"ull",
      multipass:"disabled",lookahead:false,bf:0})) {
      if (settings[key] !== value) throw new Error(`OBS persisted encoder setting ${key} was not applied`);
    }
  }
  return {profileName:status.currentProfileName,encoder:status.streamEncoder,rateControl:settings.rate_control,
    fps:status.fpsNumerator / status.fpsDenominator,bitrateKbps:settings.bitrate,keyframeSeconds:settings.keyint_sec,
    preset:settings.preset,tune:settings.tune,multipass:settings.multipass,lookahead:settings.lookahead,bFrames:settings.bf};
}
