import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { classifyObsNvencHealth } from "./obs-stream-recovery.mjs";

const [logDirectory, nvencTestPath, processStartedAt] = process.argv.slice(2);
if (!logDirectory || !nvencTestPath || !processStartedAt) {
  console.error("Usage: node obs-nvenc-health.mjs <log-directory> <nvenc-test-path> <process-started-at>");
  process.exit(64);
}

const processStartMs = Date.parse(processStartedAt);
const candidateLogs = readdirSync(logDirectory)
  .filter((name) => name.endsWith(".txt"))
  .map((name) => {
    const path = join(logDirectory, name);
    return { path, ...statSync(path) };
  })
  .filter((entry) => entry.size > 0 && entry.mtimeMs >= processStartMs - 120_000)
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

const currentLog = candidateLogs[0]?.path;
const obsLog = currentLog ? readFileSync(currentLog, "utf8") : "";
const probe = spawnSync(nvencTestPath, [], {
  encoding: "utf8",
  windowsHide: true,
  timeout: 30_000,
});
const probeOutput = `${probe.stdout || ""}\n${probe.stderr || ""}`;
const health = classifyObsNvencHealth({
  probeExitCode: probe.status ?? 1,
  probeOutput,
  obsLog,
});

console.log(JSON.stringify({ health, currentLog }));
if (health === "stale-obs") process.exit(10);
if (health === "driver-unavailable") process.exit(11);
if (health === "starting") process.exit(12);
