import assert from "node:assert/strict";
import test from "node:test";

import { classifyObsNvencHealth, ensureStreamWithRecovery } from "./obs-stream-recovery.mjs";

test("NVENC health distinguishes a stale OBS session from a broken driver", () => {
  assert.equal(classifyObsNvencHealth({
    probeExitCode: 0,
    probeOutput: "nvenc_supported=true",
    obsLog: "NVENC not supported\nEncoder ID 'obs_nvenc_h264_tex' not found",
  }), "stale-obs");

  assert.equal(classifyObsNvencHealth({
    probeExitCode: 1,
    probeOutput: "nvenc_supported=false",
    obsLog: "NVENC not supported",
  }), "driver-unavailable");

  assert.equal(classifyObsNvencHealth({
    probeExitCode: 0,
    probeOutput: "nvenc_supported=true",
    obsLog: "Available Encoders:\n- obs_nvenc_h264_tex (NVIDIA NVENC H.264)\n==== Startup complete",
  }), "healthy");

  assert.equal(classifyObsNvencHealth({
    probeExitCode: 0,
    probeOutput: "nvenc_supported=true",
    obsLog: "",
  }), "starting");
});

test("a failed stream start repairs OBS once and retries after confirmed recovery", async () => {
  let active = false;
  let startAttempts = 0;
  let recoveryAttempts = 0;
  const recoveryState = { lastAttemptAt: 0 };

  const result = await ensureStreamWithRecovery({
    getStatus: async () => ({ outputActive: active }),
    startStream: async () => {
      startAttempts += 1;
      if (startAttempts === 1) throw new Error("configured encoder is unavailable");
      active = true;
    },
    recover: async () => {
      recoveryAttempts += 1;
      return true;
    },
    recoveryState,
    recoveryCooldownMs: 300_000,
    nowMs: 600_000,
  });

  assert.deepEqual(result, { recovered: true });
  assert.equal(startAttempts, 2);
  assert.equal(recoveryAttempts, 1);
  assert.equal(recoveryState.lastAttemptAt, 600_000);
});

test("a silent start failure that never becomes active also triggers recovery", async () => {
  let active = false;
  let startAttempts = 0;
  let recoveryAttempts = 0;

  const result = await ensureStreamWithRecovery({
    getStatus: async () => ({ outputActive: active }),
    startStream: async () => {
      startAttempts += 1;
      if (startAttempts === 2) active = true;
    },
    recover: async () => {
      recoveryAttempts += 1;
      return true;
    },
    recoveryState: { lastAttemptAt: 0 },
    recoveryCooldownMs: 300_000,
    nowMs: 600_000,
  });

  assert.deepEqual(result, { recovered: true });
  assert.equal(startAttempts, 2);
  assert.equal(recoveryAttempts, 1);
});

test("a failed stream start does not restart OBS again inside the recovery cooldown", async () => {
  let recoveryAttempts = 0;

  await assert.rejects(
    ensureStreamWithRecovery({
      getStatus: async () => ({ outputActive: false }),
      startStream: async () => { throw new Error("start failed"); },
      recover: async () => {
        recoveryAttempts += 1;
        return true;
      },
      recoveryState: { lastAttemptAt: 590_000 },
      recoveryCooldownMs: 300_000,
      nowMs: 600_000,
    }),
    /start failed/,
  );

  assert.equal(recoveryAttempts, 0);
});

test("a non-NVENC failure is not retried when the health check declines recovery", async () => {
  let startAttempts = 0;

  await assert.rejects(
    ensureStreamWithRecovery({
      getStatus: async () => ({ outputActive: false }),
      startStream: async () => {
        startAttempts += 1;
        throw new Error("WHIP endpoint rejected the request");
      },
      recover: async () => false,
      recoveryState: { lastAttemptAt: 0 },
      recoveryCooldownMs: 300_000,
      nowMs: 600_000,
    }),
    /WHIP endpoint rejected the request/,
  );

  assert.equal(startAttempts, 1);
});

test("an already active stream is left untouched", async () => {
  let startAttempts = 0;
  let recoveryAttempts = 0;

  const result = await ensureStreamWithRecovery({
    getStatus: async () => ({ outputActive: true }),
    startStream: async () => { startAttempts += 1; },
    recover: async () => {
      recoveryAttempts += 1;
      return true;
    },
    recoveryState: { lastAttemptAt: 0 },
    recoveryCooldownMs: 300_000,
    nowMs: 600_000,
  });

  assert.deepEqual(result, { recovered: false });
  assert.equal(startAttempts, 0);
  assert.equal(recoveryAttempts, 0);
});
