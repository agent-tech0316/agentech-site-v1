import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const sdkRoot = path.resolve(positional[0] ?? "../agentech_sdk");
const python = process.env.MASTER_SDK_PYTHON ?? path.join(sdkRoot, ".venv", "Scripts", "python.exe");
const { masterDocumentationFunctions, masterWebsiteFunctions } = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-sdk-documentation.ts");
const catalog = process.argv.includes("--include-drafts") ? masterDocumentationFunctions : masterWebsiteFunctions;
const input = catalog.flatMap((item) => [
  ...(item.profiles ?? []).flatMap((profile) => [profile.syntax, profile.customDurationSyntax].filter(Boolean).map((syntax) => ({
    function: item.name, profile: profile.name, sourceKind: "profile", syntax, status: profile.status ?? item.status ?? "available",
  }))),
  ...(item.configurations ?? []).map((configuration) => ({
    function: item.name, profile: configuration.title, sourceKind: "configuration", syntax: configuration.syntax,
    status: item.status ?? "available",
  })),
  { function: item.name, profile: "Copyable example", sourceKind: "example", syntax: item.example, status: item.status ?? "available" },
]);
const result = spawnSync(python, ["scripts/audit-master-sdk-profiles.py", "--sdk-root", sdkRoot], { input: JSON.stringify(input), encoding: "utf8" });
if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
const rows = JSON.parse(result.stdout);
const output = positional[1];
if (output) writeFileSync(output, result.stdout);
if (process.argv.includes("--json")) {
  console.log(result.stdout);
} else {
  console.log(`calls: ${rows.length}`);
  console.log(`signature-bound: ${rows.filter((row) => row.signatureBound).length}`);
  for (const outcome of ["offline-pass", "unbound-result-refused", "live-telemetry-required", "rejected"]) console.log(`${outcome}: ${rows.filter((row) => row.outcome === outcome).length}`);
  for (const row of rows.filter((row) => row.outcome === "rejected")) console.log(`${row.function} / ${row.profile}: ${row.error}`);
}
// Every displayed call must match the SDK, including development-labelled
// profiles. Only the explicitly requested internal draft catalog permits drafts.
process.exitCode = rows.some((row) => row.outcome === "rejected"
  && (catalog === masterWebsiteFunctions || row.status !== "development")) ? 1 : 0;
