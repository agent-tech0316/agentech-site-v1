const staleNvencPatterns = [
  /NVENC not supported/i,
  /Encoder ID ['"]obs_nvenc_h264_tex['"] not found/i,
  /Failed to initialize module ['"]obs-nvenc\.dll['"]/i,
];

export function classifyObsNvencHealth({ probeExitCode, probeOutput, obsLog }) {
  if (probeExitCode !== 0 || !/nvenc_supported=true/i.test(probeOutput)) {
    return "driver-unavailable";
  }
  if (staleNvencPatterns.some((pattern) => pattern.test(obsLog))) {
    return "stale-obs";
  }
  if (!/==== Startup complete/i.test(obsLog) || !/obs_nvenc_h264_tex/i.test(obsLog)) {
    return "starting";
  }
  return "healthy";
}

export async function ensureStreamWithRecovery({
  getStatus,
  startStream,
  recover,
  recoveryState,
  recoveryCooldownMs,
  nowMs,
}) {
  const status = await getStatus();
  if (status.outputActive) return { recovered: false };

  const startAndVerify = async () => {
    await startStream();
    const verified = await getStatus();
    if (!verified.outputActive) throw new Error("OBS did not enter the streaming state");
  };

  try {
    await startAndVerify();
  } catch (initialError) {
    if (nowMs - recoveryState.lastAttemptAt < recoveryCooldownMs) throw initialError;

    recoveryState.lastAttemptAt = nowMs;
    const recovered = await recover(initialError);
    if (!recovered) throw initialError;
    await startAndVerify();
    return { recovered: true };
  }

  return { recovered: false };
}
